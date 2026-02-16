"""Pydantic models for live market widgets."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class QuoteItem(BaseModel):
    """A single market quote for display in live widgets."""

    symbol: str
    name: str
    asset_class: Literal["crypto", "metal", "oil", "index", "fx", "other"]
    price: float
    currency: str
    change: Optional[float] = None
    change_pct: Optional[float] = None
    ts_iso: str
    source: str
    is_delayed: bool = False
    delay_minutes: int = 0
