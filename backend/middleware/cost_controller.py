"""
API cost tracking controller for Anthropic/LLM usage.

Tracks per-user API costs in Redis (db=1) with daily and monthly buckets.
Falls back to in-memory tracking when Redis is unavailable.

Usage::

    controller = CostController(redis_url="redis://localhost:6379/1")
    controller.record_cost("user:123", input_tokens=500, output_tokens=200)
    usage = controller.get_usage("user:123")
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Anthropic Claude pricing (USD per 1M tokens, approximate)
_DEFAULT_INPUT_COST_PER_M = 3.00  # $3 per 1M input tokens
_DEFAULT_OUTPUT_COST_PER_M = 15.00  # $15 per 1M output tokens


class UsageSummary(BaseModel):
    """Summary of API usage for a user.

    Attributes
    ----------
    user_id : str
        The user identifier.
    daily_input_tokens : int
        Input tokens used today.
    daily_output_tokens : int
        Output tokens used today.
    daily_cost_usd : float
        Estimated USD cost for today.
    monthly_input_tokens : int
        Input tokens used this month.
    monthly_output_tokens : int
        Output tokens used this month.
    monthly_cost_usd : float
        Estimated USD cost for this month.
    """

    user_id: str
    daily_input_tokens: int = 0
    daily_output_tokens: int = 0
    daily_cost_usd: float = 0.0
    monthly_input_tokens: int = 0
    monthly_output_tokens: int = 0
    monthly_cost_usd: float = 0.0


class CostLimitConfig(BaseModel):
    """Per-user cost limits.

    Attributes
    ----------
    daily_cost_limit_usd : float
        Maximum daily spend per user in USD. 0 = unlimited.
    monthly_cost_limit_usd : float
        Maximum monthly spend per user in USD. 0 = unlimited.
    daily_token_limit : int
        Maximum total tokens (input + output) per day. 0 = unlimited.
    """

    daily_cost_limit_usd: float = Field(default=0.0, ge=0)
    monthly_cost_limit_usd: float = Field(default=0.0, ge=0)
    daily_token_limit: int = Field(default=0, ge=0)


class CostController:
    """Tracks per-user LLM API costs with Redis or in-memory storage.

    Parameters
    ----------
    redis_url : str or None
        Redis URL (should use db=1). Pass None for in-memory only.
    input_cost_per_m : float
        Cost per 1M input tokens in USD.
    output_cost_per_m : float
        Cost per 1M output tokens in USD.
    limits : CostLimitConfig or None
        Per-user cost/token limits. None = no limits.
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        input_cost_per_m: float = _DEFAULT_INPUT_COST_PER_M,
        output_cost_per_m: float = _DEFAULT_OUTPUT_COST_PER_M,
        limits: Optional[CostLimitConfig] = None,
    ) -> None:
        self._redis = None
        self._input_cost_per_m = input_cost_per_m
        self._output_cost_per_m = output_cost_per_m
        self._limits = limits or CostLimitConfig()

        # In-memory fallback: key -> {field: value}
        self._memory: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

        if redis_url:
            self._init_redis(redis_url)

    def _init_redis(self, url: str) -> None:
        """Attempt to connect to Redis."""
        try:
            import redis

            self._redis = redis.Redis.from_url(
                url,
                decode_responses=True,
                socket_connect_timeout=3,
                socket_timeout=3,
            )
            self._redis.ping()
            logger.info("Cost controller Redis connected: %s", url)
        except Exception as exc:
            logger.warning(
                "Cost controller Redis unavailable (%s): %s -- using in-memory",
                url,
                exc,
            )
            self._redis = None

    def _calc_cost(self, input_tokens: int, output_tokens: int) -> float:
        """Calculate USD cost from token counts."""
        return (
            input_tokens * self._input_cost_per_m / 1_000_000
            + output_tokens * self._output_cost_per_m / 1_000_000
        )

    @staticmethod
    def _daily_key(user_id: str) -> str:
        """Redis key for daily usage bucket."""
        day = datetime.now(timezone.utc).strftime("%Y%m%d")
        return f"cost:daily:{day}:{user_id}"

    @staticmethod
    def _monthly_key(user_id: str) -> str:
        """Redis key for monthly usage bucket."""
        month = datetime.now(timezone.utc).strftime("%Y%m")
        return f"cost:monthly:{month}:{user_id}"

    def record_cost(
        self,
        user_id: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> None:
        """Record token usage for a user.

        Parameters
        ----------
        user_id : str
            User identifier (e.g. "user:123" or "ip:10.0.0.1").
        input_tokens : int
            Number of input tokens consumed.
        output_tokens : int
            Number of output tokens consumed.
        """
        daily_key = self._daily_key(user_id)
        monthly_key = self._monthly_key(user_id)

        if self._redis is not None:
            try:
                pipe = self._redis.pipeline(transaction=False)
                pipe.hincrby(daily_key, "input_tokens", input_tokens)
                pipe.hincrby(daily_key, "output_tokens", output_tokens)
                pipe.expire(daily_key, 86400 + 3600)  # 25 hours
                pipe.hincrby(monthly_key, "input_tokens", input_tokens)
                pipe.hincrby(monthly_key, "output_tokens", output_tokens)
                pipe.expire(monthly_key, 32 * 86400)  # 32 days
                pipe.execute()
                return
            except Exception as exc:
                logger.warning("Redis record_cost failed: %s -- using in-memory", exc)

        # In-memory fallback
        self._memory[daily_key]["input_tokens"] += input_tokens
        self._memory[daily_key]["output_tokens"] += output_tokens
        self._memory[monthly_key]["input_tokens"] += input_tokens
        self._memory[monthly_key]["output_tokens"] += output_tokens

    def get_usage(self, user_id: str) -> UsageSummary:
        """Get current usage summary for a user.

        Parameters
        ----------
        user_id : str
            User identifier.

        Returns
        -------
        UsageSummary
            Current daily and monthly token counts and estimated costs.
        """
        daily_key = self._daily_key(user_id)
        monthly_key = self._monthly_key(user_id)

        daily_in = 0
        daily_out = 0
        monthly_in = 0
        monthly_out = 0

        if self._redis is not None:
            try:
                daily_data = self._redis.hgetall(daily_key)
                monthly_data = self._redis.hgetall(monthly_key)
                daily_in = int(daily_data.get("input_tokens", 0))
                daily_out = int(daily_data.get("output_tokens", 0))
                monthly_in = int(monthly_data.get("input_tokens", 0))
                monthly_out = int(monthly_data.get("output_tokens", 0))
            except Exception as exc:
                logger.warning("Redis get_usage failed: %s -- using in-memory", exc)
                daily_in = self._memory[daily_key].get("input_tokens", 0)
                daily_out = self._memory[daily_key].get("output_tokens", 0)
                monthly_in = self._memory[monthly_key].get("input_tokens", 0)
                monthly_out = self._memory[monthly_key].get("output_tokens", 0)
        else:
            daily_in = self._memory[daily_key].get("input_tokens", 0)
            daily_out = self._memory[daily_key].get("output_tokens", 0)
            monthly_in = self._memory[monthly_key].get("input_tokens", 0)
            monthly_out = self._memory[monthly_key].get("output_tokens", 0)

        return UsageSummary(
            user_id=user_id,
            daily_input_tokens=daily_in,
            daily_output_tokens=daily_out,
            daily_cost_usd=round(self._calc_cost(daily_in, daily_out), 6),
            monthly_input_tokens=monthly_in,
            monthly_output_tokens=monthly_out,
            monthly_cost_usd=round(self._calc_cost(monthly_in, monthly_out), 6),
        )

    def check_limits(self, user_id: str) -> tuple:
        """Check if a user has exceeded their cost/token limits.

        Parameters
        ----------
        user_id : str
            User identifier.

        Returns
        -------
        tuple[bool, str]
            (allowed, reason). allowed=True if under all limits.
        """
        if (
            self._limits.daily_cost_limit_usd == 0
            and self._limits.monthly_cost_limit_usd == 0
            and self._limits.daily_token_limit == 0
        ):
            return True, ""

        usage = self.get_usage(user_id)

        if self._limits.daily_token_limit > 0:
            total_daily = usage.daily_input_tokens + usage.daily_output_tokens
            if total_daily >= self._limits.daily_token_limit:
                return False, f"Daily token limit exceeded ({total_daily}/{self._limits.daily_token_limit})"

        if self._limits.daily_cost_limit_usd > 0:
            if usage.daily_cost_usd >= self._limits.daily_cost_limit_usd:
                return False, f"Daily cost limit exceeded (${usage.daily_cost_usd:.4f}/${self._limits.daily_cost_limit_usd})"

        if self._limits.monthly_cost_limit_usd > 0:
            if usage.monthly_cost_usd >= self._limits.monthly_cost_limit_usd:
                return False, f"Monthly cost limit exceeded (${usage.monthly_cost_usd:.4f}/${self._limits.monthly_cost_limit_usd})"

        return True, ""

    def close(self) -> None:
        """Close the Redis connection if open."""
        if self._redis is not None:
            try:
                self._redis.close()
                logger.info("Cost controller Redis connection closed")
            except Exception as exc:
                logger.warning("Error closing cost controller Redis: %s", exc)
            finally:
                self._redis = None
