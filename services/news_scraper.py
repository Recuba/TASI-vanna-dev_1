"""
News Scraper Engine
====================
Scrapes Arabic financial news from 5 Saudi market sources.
Each source has a dedicated scraper subclass that handles site-specific
HTML parsing. Articles are filtered for TASI/Saudi market relevance.

Sources 1 and 2 (Al Arabiya, Asharq Bloomberg) use Google News RSS as a
proxy because the original sites block non-browser requests (Cloudflare 403
and AWS WAF challenge respectively). The RSS approach yields the same
articles without requiring JavaScript rendering.

Usage:
    from services.news_scraper import fetch_all_news
    articles = fetch_all_news()
"""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime
from difflib import SequenceMatcher
from typing import List, Optional
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup

from services.news_paraphraser import paraphrase_article

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sentiment Analysis
# ---------------------------------------------------------------------------

POSITIVE_KEYWORDS = [
    "ارتفاع",
    "صعود",
    "مكاسب",
    "أرباح",
    "نمو",
    "تحسن",
    "إيجابي",
    "ارتفع",
    "صعد",
    "زيادة",
    "توزيعات",
    "فائض",
]

NEGATIVE_KEYWORDS = [
    "هبوط",
    "تراجع",
    "انخفاض",
    "خسائر",
    "خسارة",
    "سلبي",
    "انخفض",
    "تراجعت",
    "عجز",
    "ديون",
    "إفلاس",
]


def analyze_sentiment(title: str, body: str) -> tuple[float, str]:
    """Analyze Arabic text sentiment using keyword matching.

    Returns (score, label) where:
    - score: float in [-1, 1]
    - label: "إيجابي" / "سلبي" / "محايد"
    """
    text = f"{title} {body}".lower()
    positive_count = sum(1 for kw in POSITIVE_KEYWORDS if kw in text)
    negative_count = sum(1 for kw in NEGATIVE_KEYWORDS if kw in text)
    score = (positive_count - negative_count) / (positive_count + negative_count + 1)
    if score > 0.1:
        label = "إيجابي"
    elif score < -0.1:
        label = "سلبي"
    else:
        label = "محايد"
    return score, label


# ---------------------------------------------------------------------------
# Ticker Extraction
# ---------------------------------------------------------------------------

# Arabic company name -> ticker mapping (most traded TASI stocks)
COMPANY_TICKER_MAP: dict[str, str] = {
    "أرامكو": "2222",
    "الراجحي": "1120",
    "الأهلي": "1180",
    "سابك": "2010",
    "stc": "7010",
    "اس تي سي": "7010",
    "إس تي سي": "7010",
    "معادن": "1211",
    "الاتصالات السعودية": "7010",
    "مصرف الإنماء": "1150",
    "الإنماء": "1150",
    "بنك الرياض": "1010",
    "البلاد": "1140",
    "الجزيرة": "1020",
    "السعودي الفرنسي": "1050",
    "ساب": "1060",
    "العربي": "1080",
    "التصنيع": "2060",
    "ينساب": "2290",
    "المراعي": "2280",
    "إكسترا": "4003",
    "جرير": "4190",
    "الدريس": "4200",
    "كيان": "2350",
    "بترو رابغ": "2380",
    "أكوا باور": "2082",
    "علم": "7203",
    "بنك الجزيرة": "1020",
    "زين السعودية": "7030",
    "موبايلي": "7020",
    "دار الأركان": "4300",
    "إعمار": "4220",
    "طيبة": "4090",
    "الحكير": "4240",
}


def extract_ticker(title: str, body: str) -> str | None:
    """Extract a stock ticker from article text by matching company names.

    Returns the first matched ticker code or None.
    """
    text = f"{title} {body}"
    for name, ticker in COMPANY_TICKER_MAP.items():
        if name in text:
            return ticker
    return None


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
REQUEST_TIMEOUT = 10  # seconds
ARTICLE_FETCH_TIMEOUT = 5  # seconds for individual article fetches
INTER_REQUEST_DELAY = 1.5  # seconds between requests
MAX_ARTICLES_PER_SOURCE = 10
MAX_FULL_ARTICLE_FETCHES = 5  # limit full-article fetches per source

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ar,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}

# Arabic keywords indicating Saudi/TASI market relevance
RELEVANCE_KEYWORDS = [
    "تاسي",
    "تداول",
    "سوق الأسهم",
    "سوق المال",
    "السوق السعودي",
    "البورصة",
    "الأسهم السعودية",
    "هيئة السوق",
    "نمو",
    "السوق المالية",
    "أرامكو",
    "سابك",
    "الراجحي",
    "الأهلي",
    "stc",
    "أسهم",
    "سهم",
    "أرباح",
    "توزيعات",
    "مؤشر",
    "نقطة",
    "إغلاق",
    "افتتاح",
    "صعود",
    "هبوط",
    "ارتفاع",
    "انخفاض",
    "تراجع",
    "مكاسب",
    "قطاع",
    "البنوك",
    "البتروكيماويات",
    "العقار",
    "التأمين",
    "ريال",
    "مليار",
    "مليون",
    "هللة",
    "صفقة",
    "تداولات",
    "الاكتتاب",
    "إدراج",
    "طرح",
    "السعودية",
    "المملكة",
]


# ---------------------------------------------------------------------------
# Base scraper
# ---------------------------------------------------------------------------
class BaseNewsScraper(ABC):
    """Abstract base class for news source scrapers."""

    source_name: str = ""
    source_url: str = ""
    priority: int = 0

    def __init__(self):
        self._session = requests.Session()
        self._session.headers.update(DEFAULT_HEADERS)

    def fetch_articles(self) -> List[dict]:
        """Fetch and parse articles from this source.

        Returns a list of article dicts. Never raises -- logs warnings on
        failure and returns an empty list.
        """
        try:
            logger.info(
                "Fetching articles from %s (%s)", self.source_name, self.source_url
            )
            resp = self._session.get(self.source_url, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            resp.encoding = resp.apparent_encoding or "utf-8"
            raw_articles = self._parse_page(resp.text)

            # Filter for Saudi market relevance
            relevant = [a for a in raw_articles if self._is_relevant(a)]
            limited = relevant[:MAX_ARTICLES_PER_SOURCE]

            # Fetch full article bodies for articles with empty/short body
            limited = self._enrich_bodies(limited)

            logger.info(
                "%s: parsed %d articles, %d relevant, returning %d",
                self.source_name,
                len(raw_articles),
                len(relevant),
                len(limited),
            )
            return limited

        except requests.exceptions.Timeout:
            logger.warning(
                "%s: request timed out after %ds", self.source_name, REQUEST_TIMEOUT
            )
            return []
        except requests.exceptions.ConnectionError:
            logger.warning("%s: connection error", self.source_name)
            return []
        except requests.exceptions.HTTPError as exc:
            logger.warning(
                "%s: HTTP error %s",
                self.source_name,
                exc.response.status_code if exc.response else exc,
            )
            return []
        except Exception:
            logger.warning(
                "%s: unexpected error during fetch", self.source_name, exc_info=True
            )
            return []

    @abstractmethod
    def _parse_page(self, html: str) -> List[dict]:
        """Parse HTML and extract article dicts.

        Each dict must contain:
            title, body, source_name, source_url, published_at, priority, language
        """

    def _fetch_full_article(self, url: str) -> str:
        """Fetch full article body from the article URL.

        Tries common article content selectors, falling back to paragraph
        extraction. Returns empty string on failure.
        """
        try:
            resp = self._session.get(url, timeout=ARTICLE_FETCH_TIMEOUT)
            resp.raise_for_status()
            resp.encoding = resp.apparent_encoding or "utf-8"
            soup = BeautifulSoup(resp.text, "lxml")

            # Try common article content selectors (most specific first)
            for selector in [
                "article .article-body",
                "article .entry-content",
                ".article-content",
                ".post-content",
                ".story-body",
                ".article__body",
                ".article-text",
                ".content-article",
                "article p",
                "main article",
                ".content-area",
            ]:
                content = soup.select(selector)
                if content:
                    text = " ".join(el.get_text(strip=True) for el in content)
                    if len(text) > 50:
                        return text

            # Fallback: get all paragraphs from article/main/content areas
            paragraphs = soup.select("article p, main p, .content p")
            if paragraphs:
                text = " ".join(p.get_text(strip=True) for p in paragraphs)
                if len(text) > 50:
                    return text

            return ""
        except Exception:
            logger.debug("Failed to fetch full article from %s", url)
            return ""

    def _enrich_bodies(self, articles: List[dict]) -> List[dict]:
        """Fetch full article bodies for articles with empty body.

        Fetches up to MAX_FULL_ARTICLE_FETCHES articles per source to avoid
        excessive requests. Respects INTER_REQUEST_DELAY between fetches.
        """
        fetched_count = 0
        for article in articles:
            if fetched_count >= MAX_FULL_ARTICLE_FETCHES:
                break
            body = article.get("body", "")
            url = article.get("source_url", "")
            if (not body or len(body) < 50) and url:
                time.sleep(INTER_REQUEST_DELAY)
                full_body = self._fetch_full_article(url)
                if full_body:
                    article["body"] = full_body
                fetched_count += 1
        return articles

    def _make_article(
        self,
        title: str,
        body: str,
        url: str,
        published_at: Optional[str] = None,
    ) -> dict:
        """Build a standardized article dict.

        Falls back to current UTC time when published_at is not available.
        """
        return {
            "title": title.strip(),
            "body": (body or "").strip(),
            "source_name": self.source_name,
            "source_url": url.strip(),
            "published_at": published_at or datetime.utcnow().isoformat(),
            "priority": self.priority,
            "language": "ar",
        }

    @staticmethod
    def _is_relevant(article: dict) -> bool:
        """Check if article text contains Saudi market keywords."""
        text = (article.get("title", "") + " " + article.get("body", "")).lower()
        return any(kw in text for kw in RELEVANCE_KEYWORDS)

    @staticmethod
    def _extract_text(soup_element) -> str:
        """Safely extract text from a BeautifulSoup element."""
        if soup_element is None:
            return ""
        return soup_element.get_text(strip=True)

    @staticmethod
    def _absolute_url(base: str, href: str) -> str:
        """Convert a relative URL to absolute."""
        if not href:
            return ""
        if href.startswith("http"):
            return href
        if href.startswith("//"):
            return "https:" + href
        if href.startswith("/"):
            from urllib.parse import urlparse

            parsed = urlparse(base)
            return f"{parsed.scheme}://{parsed.netloc}{href}"
        return base.rstrip("/") + "/" + href


# ---------------------------------------------------------------------------
# Google News RSS base scraper (used for sources that block direct scraping)
# ---------------------------------------------------------------------------
class GoogleNewsRssScraper(BaseNewsScraper):
    """Scraper that fetches articles via Google News RSS search.

    Both Al Arabiya and Asharq Bloomberg block direct HTTP requests with
    Cloudflare 403 and AWS WAF challenges respectively. Google News RSS
    indexes their articles and provides them in a standard RSS feed, making
    this a reliable proxy for otherwise inaccessible sources.

    Subclasses set ``_rss_queries`` (a list of search queries to try) and
    optionally ``_source_filter`` to filter results to a specific domain.
    """

    _rss_queries: List[str] = []
    _source_filter: str = ""  # domain substring to filter, e.g. "alarabiya"
    _google_rss_base = "https://news.google.com/rss/search"

    def fetch_articles(self) -> List[dict]:
        """Fetch articles from Google News RSS, trying each query in order."""
        all_articles: List[dict] = []
        seen_urls: set = set()

        for query in self._rss_queries:
            try:
                encoded_query = quote_plus(query)
                rss_url = (
                    f"{self._google_rss_base}?q={encoded_query}&hl=ar&gl=SA&ceid=SA:ar"
                )
                logger.info(
                    "Fetching %s articles via Google News RSS: %s",
                    self.source_name,
                    query,
                )
                resp = self._session.get(rss_url, timeout=REQUEST_TIMEOUT)
                resp.raise_for_status()
                resp.encoding = "utf-8"

                soup = BeautifulSoup(resp.text, "xml")
                items = soup.select("item")
                logger.info(
                    "%s: Google RSS returned %d items for query '%s'",
                    self.source_name,
                    len(items),
                    query,
                )

                for item in items:
                    title_el = item.select_one("title")
                    link_el = item.select_one("link")
                    pub_date_el = item.select_one("pubDate")
                    source_el = item.select_one("source")
                    description_el = item.select_one("description")

                    title = title_el.get_text(strip=True) if title_el else ""
                    link = link_el.get_text(strip=True) if link_el else ""
                    pub_date = pub_date_el.get_text(strip=True) if pub_date_el else None
                    source_text = source_el.get_text(strip=True) if source_el else ""
                    source_href = source_el.get("url", "") if source_el else ""
                    body = ""
                    if description_el:
                        # Google wraps description in HTML; extract text
                        desc_soup = BeautifulSoup(
                            description_el.get_text(), "html.parser"
                        )
                        body = desc_soup.get_text(strip=True)

                    if not title or len(title) < 10:
                        continue

                    # Filter by source domain if specified
                    if self._source_filter:
                        matches_source = (
                            self._source_filter in source_href.lower()
                            or self._source_filter in source_text.lower()
                            or self._source_filter in link.lower()
                        )
                        if not matches_source:
                            continue

                    if link in seen_urls:
                        continue
                    seen_urls.add(link)

                    # Parse RFC 2822 date from Google RSS
                    published_at = None
                    if pub_date:
                        try:
                            from email.utils import parsedate_to_datetime

                            dt = parsedate_to_datetime(pub_date)
                            published_at = dt.isoformat()
                        except Exception:
                            published_at = pub_date

                    all_articles.append(
                        self._make_article(title, body, link, published_at)
                    )

                if all_articles:
                    break  # Got results from this query, skip remaining

            except requests.exceptions.Timeout:
                logger.warning(
                    "%s: Google RSS timed out for query '%s'",
                    self.source_name,
                    query,
                )
            except requests.exceptions.ConnectionError:
                logger.warning(
                    "%s: Google RSS connection error for query '%s'",
                    self.source_name,
                    query,
                )
            except requests.exceptions.HTTPError as exc:
                logger.warning(
                    "%s: Google RSS HTTP error %s for query '%s'",
                    self.source_name,
                    exc.response.status_code if exc.response else exc,
                    query,
                )
            except Exception:
                logger.warning(
                    "%s: unexpected error fetching Google RSS for query '%s'",
                    self.source_name,
                    query,
                    exc_info=True,
                )

        # Filter for Saudi market relevance
        relevant = [a for a in all_articles if self._is_relevant(a)]
        limited = relevant[:MAX_ARTICLES_PER_SOURCE]

        logger.info(
            "%s: Google RSS total %d, relevant %d, returning %d",
            self.source_name,
            len(all_articles),
            len(relevant),
            len(limited),
        )
        return limited

    def _parse_page(self, html: str) -> List[dict]:
        """Not used for RSS scrapers -- fetch_articles is overridden."""
        return []


# ---------------------------------------------------------------------------
# Source 1: Al Arabiya Markets via Google News RSS (priority 1)
# ---------------------------------------------------------------------------
class AlarabiyaScraper(GoogleNewsRssScraper):
    """Fetches Al Arabiya market news via Google News RSS.

    Al Arabiya (alarabiya.net) blocks direct HTTP requests with Cloudflare 403.
    We use Google News RSS with ``site:alarabiya.net`` queries instead.
    """

    source_name = "العربية"
    source_url = "https://www.alarabiya.net/aswaq"
    priority = 1

    _source_filter = "alarabiya"
    _rss_queries = [
        "تاسي أسهم site:alarabiya.net",
        "سوق الأسهم السعودية site:alarabiya.net",
        "أسواق السعودية site:alarabiya.net",
    ]


# ---------------------------------------------------------------------------
# Source 2: Asharq Business / Bloomberg Saudi via Google News RSS (priority 2)
# ---------------------------------------------------------------------------
class AsharqBusinessScraper(GoogleNewsRssScraper):
    """Fetches Asharq Bloomberg business news via Google News RSS.

    Asharq Business (asharqbusiness.com) uses AWS WAF with a JavaScript
    challenge (HTTP 202) that cannot be bypassed with plain requests.
    We use Google News RSS with ``site:asharqbusiness.com`` queries instead.
    """

    source_name = "الشرق بلومبرغ"
    source_url = "https://www.asharqbusiness.com/"
    priority = 2

    _source_filter = "asharq"
    _rss_queries = [
        "أسهم سعودية site:asharqbusiness.com",
        "تاسي تداول site:asharqbusiness.com",
        "الأسهم السعودية اقتصاد الشرق",
    ]


# ---------------------------------------------------------------------------
# Source 3: Argaam (priority 3)
# ---------------------------------------------------------------------------
class ArgaamScraper(BaseNewsScraper):
    source_name = "أرقام"
    source_url = "https://www.argaam.com/"
    priority = 3

    def _parse_page(self, html: str) -> List[dict]:
        soup = BeautifulSoup(html, "lxml")
        articles = []
        seen_urls: set = set()

        # Strategy 1: structured containers
        for item in soup.select(
            ".articleList a, .newsItem a, article a, "
            "[class*='article'] a, [class*='news'] a, "
            "a[href*='/article/'], a[href*='/news/']"
        ):
            href = item.get("href", "")
            if not href or href == "#":
                continue

            url = self._absolute_url(self.source_url, href)
            if url in seen_urls:
                continue

            title_el = item.select_one("h2, h3, h4, [class*='title'], span")
            title = (
                self._extract_text(title_el) if title_el else self._extract_text(item)
            )
            if not title or len(title) < 10:
                continue

            seen_urls.add(url)
            summary_el = item.select_one("p, [class*='summary'], [class*='desc']")
            body = self._extract_text(summary_el) if summary_el else ""

            time_el = item.select_one("time, [class*='date'], [class*='time']")
            published = (
                time_el.get("datetime", self._extract_text(time_el))
                if time_el
                else None
            )

            articles.append(self._make_article(title, body, url, published))

        return articles


# ---------------------------------------------------------------------------
# Source 4: Maaal (priority 4)
# ---------------------------------------------------------------------------
class MaaalScraper(BaseNewsScraper):
    source_name = "معال"
    source_url = "https://maaal.com/"
    priority = 4

    # Try multiple paths since the /news path may have changed
    _alt_urls = [
        "https://maaal.com/",
        "https://maaal.com/news",
        "https://maaal.com/archives/category/news",
        "https://www.maaal.com/",
    ]

    def fetch_articles(self) -> List[dict]:
        """Override to try multiple URLs for Maaal."""
        for url in self._alt_urls:
            self.source_url = url
            articles = super().fetch_articles()
            if articles:
                return articles
        return []

    def _parse_page(self, html: str) -> List[dict]:
        soup = BeautifulSoup(html, "lxml")
        articles = []
        seen_urls: set = set()

        # Strategy 1: WordPress-style article/post containers
        for item in soup.select(
            "article, .post, .entry, [class*='news'], [class*='article'], [class*='post']"
        ):
            link = item.select_one("a[href]")
            if not link:
                continue

            href = link.get("href", "")
            if not href or href == "#" or href == "/":
                continue

            url = self._absolute_url(self.source_url, href)
            if url in seen_urls:
                continue

            title_el = item.select_one(
                "h1 a, h2 a, h3 a, h1, h2, h3, h4, "
                "[class*='title'] a, [class*='title'], "
                ".entry-title a, .post-title a"
            )
            title = (
                self._extract_text(title_el) if title_el else self._extract_text(link)
            )
            if not title or len(title) < 10:
                continue

            seen_urls.add(url)
            summary_el = item.select_one(
                ".entry-content p, .excerpt, .summary, p, "
                "[class*='excerpt'], [class*='desc']"
            )
            body = self._extract_text(summary_el) if summary_el else ""

            time_el = item.select_one(
                "time, [class*='date'], [class*='time'], [datetime]"
            )
            published = (
                time_el.get("datetime", self._extract_text(time_el))
                if time_el
                else None
            )

            articles.append(self._make_article(title, body, url, published))

        # Strategy 2: Fallback - plain links to article-like URLs
        if not articles:
            for link in soup.select(
                "a[href*='/news/'], a[href*='/2026/'], a[href*='/2025/'], "
                "a[href*='/archives/'], a[href*='/?p=']"
            ):
                href = link.get("href", "")
                url = self._absolute_url(self.source_url, href)
                if url in seen_urls:
                    continue
                title = self._extract_text(link)
                if title and len(title) >= 15:
                    seen_urls.add(url)
                    articles.append(self._make_article(title, "", url))

        return articles


# ---------------------------------------------------------------------------
# Source 5: Mubasher (priority 5)
# ---------------------------------------------------------------------------
class MubasherScraper(BaseNewsScraper):
    source_name = "مباشر"
    source_url = "https://www.mubasher.info/"
    priority = 5

    def _parse_page(self, html: str) -> List[dict]:
        soup = BeautifulSoup(html, "lxml")
        articles = []
        seen_urls: set = set()

        # Strategy 1: structured containers
        for item in soup.select(
            ".news-item, .article-item, article, .card, "
            "[class*='news'], [class*='article'], [class*='story']"
        ):
            if item.name == "a":
                href = item.get("href", "")
                title = self._extract_text(item)
                link = item
            else:
                link = item.select_one("a[href]")
                if not link:
                    continue
                href = link.get("href", "")
                title_el = item.select_one(
                    "h1, h2, h3, h4, [class*='title'], [class*='headline']"
                )
                title = (
                    self._extract_text(title_el)
                    if title_el
                    else self._extract_text(link)
                )

            if not title or len(title) < 10:
                continue
            if not href or href == "#" or href == "/":
                continue

            url = self._absolute_url(self.source_url, href)
            if url in seen_urls:
                continue
            seen_urls.add(url)

            summary_el = (
                item.select_one(
                    "p, [class*='summary'], [class*='excerpt'], [class*='desc']"
                )
                if item.name != "a"
                else None
            )
            body = self._extract_text(summary_el) if summary_el else ""

            time_el = (
                item.select_one("time, [class*='date'], [class*='time'], [datetime]")
                if item.name != "a"
                else None
            )
            published = (
                time_el.get("datetime", self._extract_text(time_el))
                if time_el
                else None
            )

            articles.append(self._make_article(title, body, url, published))

        # Strategy 2: direct news links
        if not articles:
            for link in soup.select("a[href*='/news/'], a[href*='/article/']"):
                href = link.get("href", "")
                url = self._absolute_url(self.source_url, href)
                if url in seen_urls:
                    continue
                title = self._extract_text(link)
                if title and len(title) >= 15:
                    seen_urls.add(url)
                    articles.append(self._make_article(title, "", url))

        return articles


# ---------------------------------------------------------------------------
# Registry of all scrapers
# ---------------------------------------------------------------------------
ALL_SCRAPERS: List[type] = [
    AlarabiyaScraper,
    AsharqBusinessScraper,
    ArgaamScraper,
    MaaalScraper,
    MubasherScraper,
]


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------
def _title_word_overlap(title_a: str, title_b: str) -> float:
    """Return the fraction of shared words between two titles (Jaccard-like).

    Computes ``|intersection| / |union|`` over whitespace-split word sets.
    Returns 0.0 when both titles are empty.
    """
    words_a = set(title_a.split())
    words_b = set(title_b.split())
    if not words_a and not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union)


def _deduplicate(articles: List[dict], threshold: float = 0.55) -> List[dict]:
    """Remove near-duplicate articles based on title similarity.

    Two-pass deduplication:
    1. SequenceMatcher on full titles with a 0.55 threshold (lowered from 0.7
       to catch paraphrased duplicates that share most of the same phrasing).
    2. Word-overlap check on titles: if >50% of the words are shared between
       two article titles, they are considered duplicates.

    Keeps the article from the higher-priority source (lower priority number).
    """
    unique: List[dict] = []
    for article in articles:
        is_dup = False
        for existing in unique:
            # Check 1: SequenceMatcher ratio
            seq_similarity = SequenceMatcher(
                None,
                article["title"],
                existing["title"],
            ).ratio()
            # Check 2: word overlap in titles
            word_overlap = _title_word_overlap(article["title"], existing["title"])

            if seq_similarity >= threshold or word_overlap > 0.50:
                is_dup = True
                # Keep the one with higher priority (lower number)
                if article["priority"] < existing["priority"]:
                    unique.remove(existing)
                    unique.append(article)
                break
        if not is_dup:
            unique.append(article)
    return unique


# ---------------------------------------------------------------------------
# Top-level aggregator
# ---------------------------------------------------------------------------
def fetch_all_news() -> List[dict]:
    """Run all scrapers, paraphrase, deduplicate, and sort results.

    Returns articles sorted by priority (ascending) then published_at
    (descending, most recent first).
    """
    all_articles: List[dict] = []

    for scraper_cls in ALL_SCRAPERS:
        scraper = scraper_cls()
        articles = scraper.fetch_articles()
        all_articles.extend(articles)
        if articles:
            time.sleep(INTER_REQUEST_DELAY)

    logger.info("Total raw articles fetched: %d", len(all_articles))

    # Paraphrase each article and enrich with sentiment + ticker
    paraphrased = []
    for article in all_articles:
        try:
            article = paraphrase_article(article)
        except Exception:
            logger.warning(
                "Paraphrase failed for article: %s",
                article.get("title", "")[:50],
                exc_info=True,
            )

        # Sentiment analysis
        title = article.get("title", "")
        body = article.get("body", "")
        score, label = analyze_sentiment(title, body)
        article["sentiment_score"] = score
        article["sentiment_label"] = label

        # Ticker extraction
        ticker = extract_ticker(title, body)
        if ticker:
            article["ticker"] = ticker

        paraphrased.append(article)

    # Deduplicate by title similarity
    unique = _deduplicate(paraphrased)
    logger.info("After deduplication: %d articles", len(unique))

    # Sort by priority (asc), then articles with dates before those without
    def _sort_key(a):
        pri = a.get("priority", 99)
        pub = a.get("published_at") or ""
        # Articles with published_at sort before those without (0 < 1)
        has_date = 0 if pub else 1
        # Reverse date order: newer dates (lexicographically larger) first
        return (pri, has_date, "" if not pub else pub)

    unique.sort(key=_sort_key)

    return unique
