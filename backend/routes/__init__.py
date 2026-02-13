"""
Backend API routes for Ra'd AI TASI platform.

Provides health check, readiness, and metrics endpoints.
"""

from backend.routes.health import router as health_router

__all__ = ["health_router"]
