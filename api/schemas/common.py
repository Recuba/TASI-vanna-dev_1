"""Common schema types shared across all API route modules."""

from __future__ import annotations

import math
from typing import Generic, List, Optional, TypeVar

from fastapi import Query
from pydantic import BaseModel

T = TypeVar("T")


class PaginationParams:
    """Injectable FastAPI dependency for standard pagination query parameters.

    Usage::

        @router.get("/items")
        async def list_items(pagination: PaginationParams = Depends()):
            items = svc.get_items(limit=pagination.limit, offset=pagination.offset)
    """

    def __init__(
        self,
        page: int = Query(1, ge=1, description="Page number (1-indexed)"),
        page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    ):
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper."""

    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int

    @classmethod
    def build(
        cls,
        items: List[T],
        total: int,
        page: int,
        page_size: int,
    ) -> "PaginatedResponse[T]":
        """Construct a paginated response with computed total_pages."""
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=max(1, math.ceil(total / page_size)) if page_size > 0 else 1,
        )


class ErrorResponse(BaseModel):
    """Standard error response body."""

    detail: str
    code: Optional[str] = None
