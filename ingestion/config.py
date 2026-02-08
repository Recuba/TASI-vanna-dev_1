"""
Ingestion pipeline configuration.

Settings for batch processing, rate limiting, and retry behavior.
Can be overridden via environment variables.
"""

import os


class IngestionConfig:
    """Configuration for ingestion pipeline components."""

    def __init__(
        self,
        batch_size: int = None,
        rate_limit_seconds: float = None,
        max_retries: int = None,
        backoff_factor: float = None,
    ):
        self.batch_size = batch_size or int(
            os.environ.get("INGESTION_BATCH_SIZE", "10")
        )
        self.rate_limit_seconds = rate_limit_seconds or float(
            os.environ.get("INGESTION_RATE_LIMIT_SECONDS", "2")
        )
        self.max_retries = max_retries if max_retries is not None else int(
            os.environ.get("INGESTION_MAX_RETRIES", "3")
        )
        self.backoff_factor = backoff_factor if backoff_factor is not None else float(
            os.environ.get("INGESTION_BACKOFF_FACTOR", "2.0")
        )

    def __repr__(self) -> str:
        return (
            f"IngestionConfig(batch_size={self.batch_size}, "
            f"rate_limit_seconds={self.rate_limit_seconds}, "
            f"max_retries={self.max_retries}, "
            f"backoff_factor={self.backoff_factor})"
        )
