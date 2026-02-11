"""Test news store and API readiness"""
import sys, os
sys.path.insert(0, '.')
# Force UTF-8 output on Windows
if sys.platform == 'win32':
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

os.environ.setdefault('DB_BACKEND', 'sqlite')

from services.news_store import NewsStore
from services.news_scraper import fetch_all_news
from pathlib import Path

db_path = str(Path(__file__).resolve().parent.parent / "saudi_stocks.db")
store = NewsStore(db_path)

# Fetch and store
articles = fetch_all_news()
stored = store.store_articles(articles)
print(f"Stored {stored} of {len(articles)} articles")

# Read back
latest = store.get_latest_news(limit=5)
print(f"\nLatest {len(latest)} articles:")
for a in latest:
    print(f"  [{a['source_name']}] {a['title'][:60]}")

sources = store.get_sources()
print(f"\nSources: {sources}")
total = store.count_articles()
print(f"Total articles in DB: {total}")
