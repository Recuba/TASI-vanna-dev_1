"""
TASI AI Platform configuration module.

Usage:
    from config import get_settings
    settings = get_settings()
    print(settings.db.backend)       # "sqlite" or "postgresql"
    print(settings.server.port)      # 8084
    print(settings.get_llm_api_key())  # effective API key
"""

from config.logging_config import get_logger, setup_logging
from config.settings import (
    AuthSettings,
    CacheSettings,
    DatabaseSettings,
    LLMSettings,
    MiddlewareSettings,
    PoolSettings,
    ServerSettings,
    Settings,
    get_settings,
)

__all__ = [
    "AuthSettings",
    "CacheSettings",
    "DatabaseSettings",
    "LLMSettings",
    "MiddlewareSettings",
    "PoolSettings",
    "ServerSettings",
    "Settings",
    "get_logger",
    "get_settings",
    "setup_logging",
]
