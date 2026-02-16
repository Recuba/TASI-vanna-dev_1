# Development Guide

This guide covers common development tasks and architectural patterns in the Ra'd AI codebase.

## Async Database Access

### Background

All FastAPI route handlers are `async def`, but the database drivers (sqlite3, psycopg2) are synchronous. Calling sync I/O directly inside an async handler blocks the event loop, degrading throughput for concurrent requests.

The solution: wrap sync calls in `asyncio.to_thread()`, which runs them in a thread pool without blocking the event loop.

### Using `aget_*` Methods (NewsStore)

`services/news_store.py` provides both sync and async methods. **Always use the async variants in route handlers.**

```python
# CORRECT - non-blocking
from api.routes.news_feed import get_store

@router.get("/articles")
async def list_articles(source: str | None = None):
    store = get_store()
    articles = await store.aget_latest_news(limit=20, source=source)
    return {"items": articles}
```

```python
# WRONG - blocks the event loop
@router.get("/articles")
async def list_articles():
    store = get_store()
    articles = store.get_latest_news(limit=20)  # sync call in async handler!
    return {"items": articles}
```

Available async methods:

| Async Method | Sync Equivalent | Description |
|---|---|---|
| `aget_latest_news(**kwargs)` | `get_latest_news(...)` | Fetch articles with filters |
| `acount_articles(**kwargs)` | `count_articles(...)` | Count articles with filters |
| `aget_article_by_id(id)` | `get_article_by_id(id)` | Single article by ID |
| `asearch_articles(**kwargs)` | `search_articles(...)` | Full-text search |
| `acount_search(**kwargs)` | `count_search(...)` | Count search results |
| `aget_sources()` | `get_sources()` | List sources with counts |
| `aget_articles_by_ids(ids)` | `get_articles_by_ids(ids)` | Batch fetch by IDs |

### Using `db_helper` (Generic Queries)

For ad-hoc SQLite queries in route handlers, use `api/db_helper.py`:

```python
from api.db_helper import afetchall, afetchone

@router.get("/stats")
async def get_stats():
    row = await afetchone("SELECT COUNT(*) as total FROM companies")
    return {"total": row["total"]}

@router.get("/sectors")
async def get_sectors():
    rows = await afetchall(
        "SELECT sector, COUNT(*) as count FROM companies GROUP BY sector"
    )
    return {"sectors": rows}
```

### Adding Async Methods to Existing Services

When adding new sync methods that will be called from route handlers, always add an async wrapper:

```python
class NewsStore:
    def get_trending(self, hours: int = 24) -> List[Dict]:
        """Sync implementation."""
        conn = self._connect()
        try:
            # ... query logic
            return [dict(row) for row in rows]
        finally:
            conn.close()

    async def aget_trending(self, **kwargs) -> List[Dict]:
        """Async wrapper for use in FastAPI handlers."""
        return await asyncio.to_thread(self.get_trending, **kwargs)
```

## Adding a News Source

The news scraper system in `services/news_scraper.py` is extensible. Each source is a subclass of `BaseNewsScraper`.

### Step 1: Create the Scraper Class

```python
class MySourceScraper(BaseNewsScraper):
    """Scraper for MySource financial news."""

    @property
    def source_name(self) -> str:
        return "مصدري"  # Arabic name displayed in UI

    @property
    def base_url(self) -> str:
        return "https://mysource.example.com/economy"

    def parse_articles(self, html: str) -> List[Dict]:
        soup = BeautifulSoup(html, "lxml")
        articles = []
        for item in soup.select("article.news-item"):
            title_el = item.select_one("h2 a")
            if not title_el:
                continue
            articles.append({
                "title": title_el.get_text(strip=True),
                "source_url": title_el.get("href", ""),
                "published_at": self._parse_date(
                    item.select_one("time")
                ),
            })
        return articles[:_scraper_cfg.max_articles_per_source]
```

If the source blocks direct requests (Cloudflare, WAF), extend `GoogleNewsRssScraper` instead:

```python
class MySourceScraper(GoogleNewsRssScraper):
    @property
    def source_name(self) -> str:
        return "مصدري"

    @property
    def base_url(self) -> str:
        return "https://mysource.example.com"  # used for Google News site: filter

    @property
    def google_news_query(self) -> str:
        return "سوق الأسهم السعودي site:mysource.example.com"
```

### Step 2: Register the Scraper

Add your class to the `ALL_SCRAPERS` list at the bottom of `news_scraper.py`:

```python
ALL_SCRAPERS: List[type] = [
    AlarabiyaScraper,
    AsharqBusinessScraper,
    ArgaamScraper,
    MaaalScraper,
    MubasherScraper,
    MySourceScraper,         # <-- add here
]
```

### Step 3: Add the Source Filter to the Frontend

Update `frontend/src/app/news/utils.ts` to add the source chip:

```typescript
export const SOURCE_FILTERS = [
  { key: null, label: 'الكل', color: '#D4A84B' },
  { key: 'العربية', label: 'العربية', color: '#C4302B' },
  { key: 'الشرق', label: 'الشرق', color: '#1A73E8' },
  { key: 'أرقام', label: 'أرقام', color: '#00A650' },
  { key: 'معال', label: 'معال', color: '#FF6B00' },
  { key: 'مباشر', label: 'مباشر', color: '#6B21A8' },
  { key: 'مصدري', label: 'مصدري', color: '#FF1493' },  // <-- add here
] as const;
```

Also add the color mapping in the `SOURCE_COLORS` map (same file):

```typescript
const SOURCE_COLORS: Record<string, string> = {
  // ... existing entries
  'مصدري': '#FF1493',
};
```

### Step 4: Configuration

All scraper settings are centralized in `config/settings.py` under `ScraperSettings`:

| Env Variable | Default | Description |
|---|---|---|
| `SCRAPER_REQUEST_TIMEOUT` | `10` | HTTP timeout for source pages (seconds) |
| `SCRAPER_ARTICLE_FETCH_TIMEOUT` | `5` | HTTP timeout for article body fetches |
| `SCRAPER_INTER_REQUEST_DELAY` | `1.5` | Delay between requests (rate limiting) |
| `SCRAPER_MAX_ARTICLES_PER_SOURCE` | `10` | Max articles per source per cycle |
| `SCRAPER_MAX_FULL_ARTICLE_FETCHES` | `5` | Max full-body fetches per source |
| `SCRAPER_FETCH_INTERVAL_SECONDS` | `1800` | Scheduler interval (30 min default) |
| `SCRAPER_CLEANUP_AGE_DAYS` | `7` | Auto-delete articles older than N days |
| `SCRAPER_DEDUP_THRESHOLD` | `0.55` | Title similarity threshold for dedup |

### Step 5: Test

```bash
# Verify the scraper works in isolation
python -c "
from services.news_scraper import MySourceScraper
s = MySourceScraper()
articles = s.fetch_articles()
print(f'Found {len(articles)} articles')
for a in articles[:3]:
    print(f'  - {a[\"title\"][:60]}')
"

# Run the full pipeline
python -c "
from services.news_scraper import fetch_all_news
articles = fetch_all_news()
print(f'Total: {len(articles)} articles from all sources')
"
```

## Frontend Patterns

### RTL Support

The app uses `dir="rtl"` for Arabic layout. Always use Tailwind logical properties:

| Physical (DO NOT USE) | Logical (USE THIS) |
|---|---|
| `ml-*` | `ms-*` (margin-inline-start) |
| `mr-*` | `me-*` (margin-inline-end) |
| `pl-*` | `ps-*` (padding-inline-start) |
| `pr-*` | `pe-*` (padding-inline-end) |
| `left-*` | `start-*` |
| `right-*` | `end-*` |

### AbortController Pattern

All fetch calls must be cancellable. The `api-client.ts` `request()` function accepts an optional `signal` parameter:

```typescript
import { getNewsFeed } from '@/lib/api-client';

useEffect(() => {
  const controller = new AbortController();
  getNewsFeed({ limit: 20 }, undefined, undefined, controller.signal)
    .then(setData)
    .catch((err) => {
      if (err.name !== 'AbortError') setError(err.message);
    });
  return () => controller.abort();
}, []);
```

For hooks, use the `useAsync` pattern from `lib/hooks/use-api.ts` which handles AbortController automatically.

### Runtime Configuration

Frontend config values live in `frontend/src/lib/config.ts` and are driven by environment variables:

```typescript
import { API_TIMEOUT_MS, HEALTH_POLL_INTERVAL_MS } from '@/lib/config';
```

See `frontend/.env.local.example` for all available variables.

## Live Market Widgets

The widgets system provides live-updating market quotes (crypto, metals, oil, global indices) via Server-Sent Events.

### Architecture

```
QuotesHub (services/widgets/quotes_hub.py)
  ├── CryptoProvider     (providers/crypto.py)
  ├── MetalsProvider     (providers/metals.py)
  ├── OilProvider        (providers/oil.py)
  └── IndicesProvider    (providers/indices.py)
         │
         v
  SSE endpoint (/api/v1/widgets/stream)
         │
         v
  LiveMarketWidgets (React component)
    └── EventSource with reconnection backoff
```

### Adding a New Provider

1. Create a new file in `services/widgets/providers/`:

```python
from api.models.widgets import QuoteItem

async def fetch_my_quotes() -> list[QuoteItem]:
    """Fetch quotes from your data source."""
    # ... fetch logic
    return [
        QuoteItem(
            symbol="XYZ",
            name="My Asset",
            price=100.0,
            change=2.5,
            change_pct=2.56,
            category="my_category",
        )
    ]
```

2. Register the provider in `services/widgets/providers/__init__.py`.

3. Add the category to the `LiveMarketWidgets` component's category filter tabs.

### Redis Pub/Sub (Optional)

The `QuotesHub` supports Redis pub/sub for multi-instance deployments. Configure via:

| Env Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection URL |
| `CACHE_ENABLED` | `false` | Enable Redis-based caching |

Without Redis, the hub operates in single-process mode with in-memory state.

## Cache Utilities

### Unified Caching Decorator (`services/cache_utils.py`)

Use `@cache_response` for caching service method results:

```python
from services.cache_utils import cache_response

@cache_response(ttl=300, max_size=500)
def get_expensive_data(ticker: str) -> dict:
    # ... expensive computation
    return result
```

The decorator provides:
- **TTL-based expiration**: Entries expire after `ttl` seconds
- **LRU eviction**: Cache is capped at `max_size` entries (default 500)
- **Thread-safe**: Uses `threading.Lock` internally

### YFinance Shared Utilities (`services/yfinance_base.py`)

Common patterns for yfinance API calls are centralized in `yfinance_base.py`:

- **`YFinanceCache`**: Shared LRU cache with configurable TTL and max entries (default 500)
- **`CircuitBreaker`**: Prevents repeated calls to a failing yfinance endpoint; auto-resets after a cooldown period

```python
from services.yfinance_base import YFinanceCache, CircuitBreaker

cache = YFinanceCache(max_size=500, ttl=300)
breaker = CircuitBreaker(failure_threshold=5, reset_timeout=60)
```

## Connection Status Patterns

### SSE Disconnect Detection (Backend)

All SSE endpoints must check for client disconnection to avoid orphaned generators:

```python
@router.get("/stream")
async def stream(request: Request):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            yield {"data": json.dumps(payload)}
            await asyncio.sleep(interval)
    return EventSourceResponse(event_generator())
```

### EventSource Reconnection (Frontend)

The `ConnectionStatusBadge` component (`frontend/src/components/common/ConnectionStatusBadge.tsx`) provides a reusable connection state indicator. SSE consumers should implement exponential backoff on reconnection:

```typescript
const reconnect = useCallback(() => {
  const delay = Math.min(1000 * 2 ** attempt, 30000);
  setTimeout(() => {
    const es = new EventSource(url);
    es.onopen = () => setAttempt(0);
    es.onerror = () => { es.close(); reconnect(); };
  }, delay);
}, [attempt]);
```

States: `live` (connected), `reconnecting` (attempting), `offline` (failed).

### Header Health Polling

The site header polls `/health/live` with AbortController to show a connection indicator. The polling interval is configurable via `HEALTH_POLL_INTERVAL_MS` in `frontend/src/lib/config.ts`.

## Async I/O Notes

In addition to database calls and news store methods, health check routes in `app.py` are also wrapped in `asyncio.to_thread()` to prevent blocking when the database driver performs I/O during health probes.

## RTL Lint Enforcement

Run the RTL lint check to catch physical direction properties (`ml-*`, `mr-*`, `pl-*`, `pr-*`) that should use logical equivalents:

```bash
cd frontend && npm run lint:rtl
```

This runs `scripts/lint-rtl.js`, which scans `.tsx` and `.ts` files for Tailwind physical direction classes and reports violations. The check is also integrated into CI.
