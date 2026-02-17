"""Live Market Widgets SSE endpoint.

Streams real-time market quotes (crypto, metals, oil, indices) to the
frontend via Server-Sent Events. Uses Redis Pub/Sub when available,
falls back to polling the in-memory snapshot from the quotes hub.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/widgets", tags=["widgets"])

_REDIS_KEY = "widgets:quotes:latest"
_REDIS_CHANNEL = "widgets:quotes:pubsub"


def _get_redis():
    """Return the Redis client, or None."""
    try:
        from cache import get_redis
        return get_redis()
    except ImportError:
        return None


@router.get("/quotes/stream")
async def widgets_quotes_stream(request: Request):
    """SSE stream of live market quotes.

    Sends the latest snapshot immediately on connect, then streams
    updates via Redis Pub/Sub or in-memory polling.
    """
    redis = _get_redis()

    if redis:
        return StreamingResponse(
            _redis_event_generator(request, redis),
            media_type="text/event-stream",
            headers=_sse_headers(),
        )

    # In-memory fallback (no Redis)
    return StreamingResponse(
        _memory_event_generator(request),
        media_type="text/event-stream",
        headers=_sse_headers(),
    )


def _sse_headers() -> dict:
    return {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }


async def _memory_event_generator(request: Request):
    """Stream quotes from in-memory snapshot (no Redis)."""
    from services.widgets.quotes_hub import get_latest_snapshot, get_snapshot_event

    last_sent = ""

    # Fast first paint
    snapshot = get_latest_snapshot()
    if snapshot:
        yield f"event: snapshot\ndata: {snapshot}\n\n"
        last_sent = snapshot
    else:
        yield ": waiting for first fetch\n\n"

    event = get_snapshot_event()

    while True:
        if await request.is_disconnected():
            logger.debug("Widget SSE client disconnected (memory mode)")
            break

        # Wait for new data or timeout
        try:
            await asyncio.wait_for(event.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            # Send keepalive comment
            yield ": keepalive\n\n"
            continue

        snapshot = get_latest_snapshot()
        if snapshot and snapshot != last_sent:
            yield f"event: snapshot\ndata: {snapshot}\n\n"
            last_sent = snapshot


async def _redis_event_generator(request: Request, redis):
    """Stream quotes from Redis Pub/Sub."""
    # Fast first paint: send cached snapshot immediately
    try:
        snapshot = await asyncio.to_thread(redis.get, _REDIS_KEY)
        if snapshot:
            yield f"event: snapshot\ndata: {snapshot}\n\n"
        else:
            yield ": no data yet\n\n"
    except Exception as exc:
        logger.warning("Failed to read initial snapshot: %s", exc)
        yield ": connecting\n\n"

    # Subscribe to Pub/Sub channel for live updates
    pubsub = redis.pubsub()
    try:
        await asyncio.to_thread(pubsub.subscribe, _REDIS_CHANNEL)

        while True:
            if await request.is_disconnected():
                logger.debug("Widget SSE client disconnected")
                break

            msg = await asyncio.to_thread(pubsub.get_message, timeout=1.0)

            if msg and msg["type"] == "message":
                data = msg["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                yield f"event: snapshot\ndata: {data}\n\n"

            await asyncio.sleep(0.5)
    except asyncio.CancelledError:
        logger.debug("Widget SSE generator cancelled")
    except Exception as exc:
        logger.warning("Widget SSE error: %s", exc)
    finally:
        try:
            await asyncio.to_thread(pubsub.unsubscribe, _REDIS_CHANNEL)
            await asyncio.to_thread(pubsub.close)
        except Exception:
            pass
