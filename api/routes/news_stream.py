"""
News Stream SSE endpoint.

Provides a Server-Sent Events stream that pushes notifications when new
news articles are detected in the store. Clients connect once and receive
events as they arrive, avoiding the need for polling.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from api.routes.news_feed import get_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/news", tags=["news-stream"])


@router.get("/stream")
async def news_stream(
    request: Request,
    source: Optional[str] = Query(None, description="Filter by source name"),
) -> StreamingResponse:
    """SSE endpoint that emits events when new articles appear.

    Polls the NewsStore every 10 seconds and sends an event containing
    the new article count whenever the latest article ID changes.
    Clients should reconnect on error.
    """

    async def event_generator():
        last_seen_id: Optional[str] = None
        store = get_store()

        # Send an initial keepalive so the client knows the connection is open
        yield ": connected\n\n"

        while True:
            if await request.is_disconnected():
                logger.debug("SSE client disconnected, closing stream")
                return

            try:
                articles = await store.aget_latest_news(
                    limit=10, offset=0, source=source
                )

                if articles:
                    newest_id = articles[0]["id"]
                    if last_seen_id is None:
                        # First poll -- just record the current head
                        last_seen_id = newest_id
                    elif newest_id != last_seen_id:
                        # Find how many articles are newer than last_seen_id
                        new_items = []
                        for a in articles:
                            if a["id"] == last_seen_id:
                                break
                            new_items.append(
                                {
                                    "id": a["id"],
                                    "title": a.get("title", ""),
                                    "source_name": a.get("source_name", ""),
                                }
                            )
                        last_seen_id = newest_id

                        if new_items:
                            payload = json.dumps(
                                {"items": new_items, "count": len(new_items)},
                                ensure_ascii=False,
                            )
                            yield f"data: {payload}\n\n"
            except Exception:
                logger.debug("SSE poll error", exc_info=True)

            await asyncio.sleep(10)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
