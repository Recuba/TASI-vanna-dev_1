"""Quotes Hub -- background task that fetches market quotes.

Fetches from all providers on a schedule. When Redis is available, stores
snapshots and publishes changes via Pub/Sub. Without Redis, keeps an
in-memory snapshot that the SSE endpoint reads directly.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import List, Optional

from api.models.widgets import QuoteItem

logger = logging.getLogger(__name__)

_REDIS_KEY = "widgets:quotes:latest"
_REDIS_CHANNEL = "widgets:quotes:pubsub"
_REDIS_TTL = 120  # seconds
_FETCH_INTERVAL = 30  # seconds

# In-memory snapshot for Redis-free operation
_latest_snapshot: Optional[str] = None
_snapshot_event: asyncio.Event = asyncio.Event()


def get_latest_snapshot() -> Optional[str]:
    """Return the latest in-memory snapshot JSON string, or None."""
    return _latest_snapshot


def get_snapshot_event() -> asyncio.Event:
    """Return the asyncio.Event that is set on each new snapshot."""
    return _snapshot_event


async def _fetch_all_providers() -> List[QuoteItem]:
    """Gather quotes from all providers concurrently."""
    from services.widgets.providers.crypto import fetch_crypto
    from services.widgets.providers.metals import fetch_metals
    from services.widgets.providers.oil import fetch_oil
    from services.widgets.providers.indices import fetch_indices

    results = await asyncio.gather(
        fetch_crypto(),
        fetch_metals(),
        fetch_oil(),
        fetch_indices(),
        return_exceptions=True,
    )

    quotes: List[QuoteItem] = []
    for result in results:
        if isinstance(result, BaseException):
            logger.warning("Provider fetch error: %s", result)
            continue
        quotes.extend(result)

    return quotes


def _serialize(quotes: List[QuoteItem]) -> str:
    """Serialize a list of QuoteItems to JSON."""
    return json.dumps(
        [q.model_dump() for q in quotes],
        ensure_ascii=False,
    )


async def run_quotes_hub(redis_client=None) -> None:
    """Long-running coroutine that fetches quotes and publishes updates.

    Parameters
    ----------
    redis_client
        A ``redis.Redis`` instance (synchronous, with ``decode_responses=True``).
        If None, operates in memory-only mode.
    """
    global _latest_snapshot

    mode = "Redis" if redis_client else "in-memory"
    logger.info("Quotes hub started (mode: %s)", mode)
    last_snapshot = ""

    while True:
        try:
            quotes = await _fetch_all_providers()

            if not quotes:
                logger.debug("No quotes fetched this cycle")
                await asyncio.sleep(_FETCH_INTERVAL)
                continue

            snapshot = _serialize(quotes)

            # Always update in-memory snapshot
            _latest_snapshot = snapshot
            _snapshot_event.set()
            _snapshot_event.clear()

            if redis_client:
                # Store latest snapshot with TTL
                await asyncio.to_thread(
                    redis_client.setex, _REDIS_KEY, _REDIS_TTL, snapshot
                )

                # Only publish if data changed
                if snapshot != last_snapshot:
                    await asyncio.to_thread(
                        redis_client.publish, _REDIS_CHANNEL, snapshot
                    )

            if snapshot != last_snapshot:
                last_snapshot = snapshot
                logger.debug("Quotes updated (%d items)", len(quotes))
            else:
                logger.debug("Quotes unchanged, skipping")

        except asyncio.CancelledError:
            logger.info("Quotes hub cancelled")
            raise
        except Exception as exc:
            logger.warning("Quotes hub error: %s", exc)

        await asyncio.sleep(_FETCH_INTERVAL)
