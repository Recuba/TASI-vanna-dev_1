"""
CORS middleware setup for TASI AI Platform.

Configures FastAPI's built-in CORSMiddleware with allowed origins from settings.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, List

from fastapi.middleware.cors import CORSMiddleware

if TYPE_CHECKING:
    from fastapi import FastAPI


def setup_cors(app: "FastAPI", allowed_origins: List[str]) -> None:
    """Add CORS middleware to the FastAPI application.

    Parameters
    ----------
    app : FastAPI
        The FastAPI application instance.
    allowed_origins : list[str]
        List of allowed origin URLs (e.g. ["http://localhost:3000"]).
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
