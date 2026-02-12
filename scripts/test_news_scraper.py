"""Quick smoke test for the news scraper"""

import sys
import os

sys.path.insert(0, ".")
# Force UTF-8 output on Windows
if sys.platform == "win32":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from services.news_scraper import fetch_all_news

articles = fetch_all_news()
print(f"Fetched {len(articles)} articles total")
for i, a in enumerate(articles[:5]):
    print(
        f"\n[{i + 1}] {a.get('source_name', 'Unknown')} (priority {a.get('priority', '?')})"
    )
    print(f"    Title: {a.get('title', 'N/A')[:80]}")
    print(f"    Body:  {a.get('body', 'N/A')[:80]}...")
