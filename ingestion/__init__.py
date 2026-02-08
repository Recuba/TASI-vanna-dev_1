"""
Ingestion pipeline for TASI AI Platform.

Provides XBRL financial filing processing and Yahoo Finance price loading
into PostgreSQL.
"""

from ingestion.xbrl_processor import XBRLProcessor
from ingestion.price_loader import PriceLoader

__all__ = ["XBRLProcessor", "PriceLoader"]
