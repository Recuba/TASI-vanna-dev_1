"""
Arabic News Paraphraser
========================
Simple Arabic text paraphraser that applies minor modifications to news articles:
- Replaces common financial Arabic terms with synonyms
- Adds slight variations to sentence openings
- Keeps meaning identical -- this is NOT creative rewriting

Usage:
    from services.news_paraphraser import paraphrase_article
    modified = paraphrase_article(article_dict)
"""

from __future__ import annotations

import random
import re
from typing import Dict, List, Tuple

# ---------------------------------------------------------------------------
# Synonym pairs: (original, replacement)
# Each pair can be applied in either direction.
# ---------------------------------------------------------------------------
SYNONYM_PAIRS: List[Tuple[str, str]] = [
    ("ارتفع", "صعد"),
    ("انخفض", "تراجع"),
    ("سوق الأسهم", "سوق المال"),
    ("أعلنت", "كشفت"),
    ("أرباح", "عوائد"),
    ("خسائر", "تراجعات"),
    ("نمو", "زيادة"),
    ("انكماش", "تقلص"),
    ("استقرار", "ثبات"),
    ("تذبذب", "تقلب"),
    ("صفقة", "عملية"),
    ("مستثمرين", "متداولين"),
    ("إيرادات", "مداخيل"),
    ("توقعات", "تقديرات"),
    ("أداء", "نتائج"),
    ("قوي", "متين"),
    ("ضعيف", "محدود"),
    ("ملحوظ", "واضح"),
    ("كبير", "ضخم"),
    ("طفيف", "بسيط"),
    ("سجل", "حقق"),
    ("بلغ", "وصل إلى"),
    ("تجاوز", "فاق"),
    ("قفز", "ارتفع بشكل حاد"),
    ("هوى", "انخفض بشكل حاد"),
    ("مكاسب", "أرباح"),
    ("تراجعات", "خسائر"),
    ("إغلاق", "ختام"),
    ("افتتاح", "بداية"),
    ("جلسة", "حصة تداول"),
]

# Build a flat lookup dict: word -> replacement
_SYNONYM_MAP: Dict[str, str] = {}
for a, b in SYNONYM_PAIRS:
    _SYNONYM_MAP[a] = b
    _SYNONYM_MAP[b] = a

# Sentence opening variations (prepended alternatives)
OPENING_VARIATIONS: List[Tuple[str, str]] = [
    ("أعلنت", "صرّحت"),
    ("قالت", "ذكرت"),
    ("أشار", "لفت"),
    ("أكد", "شدد على أن"),
    ("أوضح", "بيّن"),
    ("كشف", "أظهر"),
    ("أفاد", "نقل"),
]


def _apply_synonyms(text: str) -> str:
    """Replace financial terms with their synonyms.

    Applies replacements with ~50% probability per occurrence to avoid
    making the text feel mechanically transformed.
    """
    if not text:
        return text

    result = text
    for original, replacement in _SYNONYM_MAP.items():
        if original in result and random.random() < 0.5:
            # Replace only the first occurrence to keep changes minimal
            result = result.replace(original, replacement, 1)

    return result


def _vary_openings(text: str) -> str:
    """Apply slight variations to sentence openings."""
    if not text:
        return text

    result = text
    for original, replacement in OPENING_VARIATIONS:
        # Only modify if it appears at the start of a sentence
        # (beginning of text or after a period/newline)
        pattern = rf"(^|[.\n]\s*){re.escape(original)}"
        if re.search(pattern, result) and random.random() < 0.4:
            result = re.sub(pattern, rf"\1{replacement}", result, count=1)

    return result


def paraphrase_text(text: str) -> str:
    """Apply minor paraphrasing to Arabic text.

    Returns the modified text with synonym replacements and
    opening variations applied.
    """
    if not text:
        return text

    result = _apply_synonyms(text)
    result = _vary_openings(result)
    return result


def paraphrase_article(article: dict) -> dict:
    """Paraphrase the title and body of an article dict.

    Returns a new dict (does not modify the original).
    Handles None/empty body gracefully -- always returns a string for body.
    """
    modified = dict(article)
    title = article.get("title") or ""
    body = article.get("body") or ""

    modified["title"] = paraphrase_text(title) if title else ""
    modified["body"] = paraphrase_text(body) if body else ""
    return modified
