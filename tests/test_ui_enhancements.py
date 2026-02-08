"""Tests for Ra'd AI UI enhancements: chart engine, CSS, JS, WCAG, HTML integration, static serving.

Run with:
    python -m pytest tests/test_ui_enhancements.py -v
"""

import sys
from pathlib import Path

import pytest
import pandas as pd

# Ensure project root is on the path so we can import chart_engine
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from chart_engine.raid_chart_generator import RaidChartGenerator


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

TEMPLATES_DIR = PROJECT_ROOT / "templates"


@pytest.fixture(scope="module")
def generator():
    return RaidChartGenerator()


@pytest.fixture(scope="module")
def index_html_content():
    """Read index.html once for all HTML integration tests."""
    html_path = TEMPLATES_DIR / "index.html"
    assert html_path.exists(), f"index.html not found at {html_path}"
    return html_path.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def css_content():
    css_path = TEMPLATES_DIR / "raid-enhancements.css"
    assert css_path.exists(), f"raid-enhancements.css not found at {css_path}"
    return css_path.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def js_content():
    js_path = TEMPLATES_DIR / "raid-features.js"
    assert js_path.exists(), f"raid-features.js not found at {js_path}"
    return js_path.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# WCAG Helpers
# ---------------------------------------------------------------------------


def _relative_luminance(hex_color: str) -> float:
    """Calculate relative luminance per WCAG 2.0."""
    r = int(hex_color[1:3], 16) / 255
    g = int(hex_color[3:5], 16) / 255
    b = int(hex_color[5:7], 16) / 255

    def linearize(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = linearize(r), linearize(g), linearize(b)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast_ratio(fg: str, bg: str) -> float:
    l1 = _relative_luminance(fg)
    l2 = _relative_luminance(bg)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


# ===================================================================
# 1. Chart Engine Tests
# ===================================================================


class TestHumanizeHeader:
    def test_humanize_header_basic(self):
        assert RaidChartGenerator._humanize_header("market_cap") == "Market Cap (SAR)"

    def test_humanize_header_acronyms(self):
        assert RaidChartGenerator._humanize_header("roe") == "Return on Equity"
        result = RaidChartGenerator._humanize_header("trailing_pe")
        assert "P/E" in result

    def test_humanize_header_multi_word(self):
        assert (
            RaidChartGenerator._humanize_header("total_revenue")
            == "Total Revenue (SAR)"
        )


class TestIsPercentageColumn:
    @pytest.mark.parametrize(
        "col",
        [
            "profit_margin",
            "dividend_yield",
            "roe",
            "roa",
            "revenue_growth",
            "change_pct",
        ],
    )
    def test_percentage_columns_detected(self, col):
        assert RaidChartGenerator._is_percentage_column(col) is True

    @pytest.mark.parametrize(
        "col", ["market_cap", "total_revenue", "ticker", "company_name"]
    )
    def test_non_percentage_columns_rejected(self, col):
        assert RaidChartGenerator._is_percentage_column(col) is False


class TestFormatPercentage:
    def test_format_normal_value(self):
        assert RaidChartGenerator._format_percentage(0.2171) == "21.71%"

    def test_format_none(self):
        assert RaidChartGenerator._format_percentage(None) == "\u2014"

    def test_format_nan(self):
        assert RaidChartGenerator._format_percentage(float("nan")) == "\u2014"

    def test_format_zero(self):
        assert RaidChartGenerator._format_percentage(0.0) == "0.00%"

    def test_format_negative(self):
        assert RaidChartGenerator._format_percentage(-0.05) == "-5.00%"


class TestTableCreation:
    def test_table_uses_humanized_headers(self, generator):
        df = pd.DataFrame(
            {
                "company_name": ["ACME Corp", "Beta Inc"],
                "market_cap": [1e9, 2e9],
                "trailing_pe": [15.0, 20.0],
                "dividend_yield": [0.03, 0.05],
                "roe": [0.12, 0.18],
                "roa": [0.08, 0.10],
                "profit_margin": [0.15, 0.22],
                "total_revenue": [5e8, 8e8],
                "total_assets": [3e9, 5e9],
            }
        )
        # 9 columns >= 8, so generate_chart should create a table
        result = generator.generate_chart(df, "Test Table")
        # Result should be valid plotly JSON with data
        assert "data" in result
        table_data = result["data"][0]
        assert table_data["type"] == "table"
        header_values = table_data["header"]["values"]
        # Headers should be humanized
        assert "Company Name" in header_values
        assert "Market Cap (SAR)" in header_values
        assert "Return on Equity" in header_values
        assert "Return on Assets" in header_values


class TestBarChartLabelRotation:
    def test_long_labels_get_rotation(self, generator):
        df = pd.DataFrame(
            {
                "company_name": [
                    "Saudi Arabian Oil Co",
                    "Al Rajhi Banking Corp",
                    "Saudi National Bank",
                    "Saudi Telecom Company",
                    "Saudi Basic Industries",
                ],
                "market_cap": [1e12, 5e10, 4e10, 3e10, 2e10],
            }
        )
        result = generator.generate_chart(df, "Market Cap Comparison")
        layout = result.get("layout", {})
        xaxis = layout.get("xaxis", {})
        assert xaxis.get("tickangle") == -45


class TestValueHeatmap:
    def test_heatmap_uses_humanized_headers(self, generator):
        df = pd.DataFrame(
            {
                "company_name": ["ACME", "Beta", "Gamma"],
                "profit_margin": [0.15, 0.22, 0.10],
                "roe": [0.12, 0.18, 0.08],
                "roa": [0.08, 0.10, 0.06],
            }
        )
        # 1 categorical + 3 numeric -> value heatmap
        result = generator.generate_chart(df, "Profitability Heatmap")
        assert "data" in result
        heatmap_data = result["data"][0]
        assert heatmap_data["type"] == "heatmap"
        x_labels = heatmap_data["x"]
        assert "Profit Margin" in x_labels
        assert "Return on Equity" in x_labels
        assert "Return on Assets" in x_labels


# ===================================================================
# 2. File Existence and Content Tests
# ===================================================================


class TestFileExistence:
    def test_css_file_exists(self):
        css_path = TEMPLATES_DIR / "raid-enhancements.css"
        assert css_path.exists()
        assert css_path.stat().st_size > 0

    def test_js_file_exists(self):
        js_path = TEMPLATES_DIR / "raid-features.js"
        assert js_path.exists()
        assert js_path.stat().st_size > 0


class TestCSSKeySelectors:
    def test_focus_visible(self, css_content):
        assert ":focus-visible" in css_content

    def test_prefers_reduced_motion(self, css_content):
        assert "prefers-reduced-motion" in css_content

    def test_skip_to_content(self, css_content):
        assert "skip-to-content" in css_content

    def test_print_media(self, css_content):
        assert "@media print" in css_content


class TestJSKeyFunctions:
    def test_theme_toggle(self, js_content):
        assert "theme" in js_content.lower()

    def test_onboarding(self, js_content):
        assert "onboarding" in js_content.lower()

    def test_keyboard_shortcut(self, js_content):
        assert "Ctrl+K" in js_content or "keyboard" in js_content.lower()

    def test_new_chat(self, js_content):
        assert "New Chat" in js_content or "reload" in js_content


# ===================================================================
# 3. WCAG Contrast Ratio Tests
# ===================================================================


class TestWCAGContrast:
    def test_text_muted_contrast_on_card(self):
        """#999999 on #1A1A1A should pass WCAG AA 4.5:1."""
        ratio = _contrast_ratio("#999999", "#1A1A1A")
        assert ratio >= 4.5, f"Contrast ratio {ratio:.2f} < 4.5 (WCAG AA)"

    def test_text_muted_contrast_on_bg(self):
        """#999999 on #0E0E0E should pass WCAG AA 4.5:1."""
        ratio = _contrast_ratio("#999999", "#0E0E0E")
        assert ratio >= 4.5, f"Contrast ratio {ratio:.2f} < 4.5 (WCAG AA)"

    def test_footer_text_contrast(self):
        """#A0A0A0 on #0E0E0E should pass WCAG AA 4.5:1."""
        ratio = _contrast_ratio("#A0A0A0", "#0E0E0E")
        assert ratio >= 4.5, f"Contrast ratio {ratio:.2f} < 4.5 (WCAG AA)"

    def test_luminance_black(self):
        """Sanity check: black has luminance 0."""
        assert _relative_luminance("#000000") == pytest.approx(0.0, abs=1e-6)

    def test_luminance_white(self):
        """Sanity check: white has luminance 1."""
        assert _relative_luminance("#FFFFFF") == pytest.approx(1.0, abs=1e-6)

    def test_black_white_contrast(self):
        """Black on white should be 21:1."""
        ratio = _contrast_ratio("#000000", "#FFFFFF")
        assert ratio == pytest.approx(21.0, abs=0.1)


# ===================================================================
# 4. HTML Integration Tests
# ===================================================================


class TestHTMLIntegration:
    def test_css_link_in_html(self, index_html_content):
        assert "raid-enhancements.css" in index_html_content

    def test_js_script_in_html(self, index_html_content):
        assert "raid-features.js" in index_html_content

    def test_skip_to_content_link(self, index_html_content):
        assert "skip-to-content" in index_html_content

    def test_aria_role_banner(self, index_html_content):
        assert 'role="banner"' in index_html_content

    def test_aria_role_main(self, index_html_content):
        assert 'role="main"' in index_html_content

    def test_aria_role_contentinfo(self, index_html_content):
        assert 'role="contentinfo"' in index_html_content

    def test_main_content_id(self, index_html_content):
        assert 'id="main-content"' in index_html_content

    def test_suggestion_chips_data_query(self, index_html_content):
        """All 8 suggestion chips should have data-query attributes."""
        count = index_html_content.count("data-query=")
        assert count == 8, f"Expected 8 data-query attributes, found {count}"

    def test_text_muted_updated(self, index_html_content):
        """--text-muted should be #999999 (or #999) for WCAG compliance."""
        assert "#999999" in index_html_content or "#999" in index_html_content

    def test_onboarding_overlay_container(self, index_html_content):
        assert "raid-onboarding-overlay" in index_html_content

    def test_data_freshness_display(self, index_html_content):
        assert "data-freshness-display" in index_html_content

    def test_vanna_chat_element(self, index_html_content):
        assert "<vanna-chat" in index_html_content

    def test_module_script_type(self, index_html_content):
        assert 'type="module"' in index_html_content


# ===================================================================
# 5. Static File Serving Test
# ===================================================================


class TestStaticServing:
    def test_static_mount_serves_css(self):
        try:
            from httpx import ASGITransport, AsyncClient
            import asyncio
        except ImportError:
            pytest.skip("httpx not installed")

        from app import app

        async def _test():
            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.get("/static/raid-enhancements.css")
                assert resp.status_code == 200
                assert len(resp.text) > 0

        asyncio.run(_test())

    def test_static_mount_serves_js(self):
        try:
            from httpx import ASGITransport, AsyncClient
            import asyncio
        except ImportError:
            pytest.skip("httpx not installed")

        from app import app

        async def _test():
            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.get("/static/raid-features.js")
                assert resp.status_code == 200
                assert len(resp.text) > 0

        asyncio.run(_test())


# ===================================================================
# 6. Column Labels Tests
# ===================================================================


class TestColumnLabels:
    def test_column_labels_dict_exists(self):
        from chart_engine.raid_chart_generator import COLUMN_LABELS

        assert isinstance(COLUMN_LABELS, dict)
        assert "market_cap" in COLUMN_LABELS

    def test_humanize_uses_labels(self):
        result = RaidChartGenerator._humanize_header("market_cap")
        assert result == "Market Cap (SAR)"

    def test_humanize_roe_uses_label(self):
        result = RaidChartGenerator._humanize_header("roe")
        assert result == "Return on Equity"

    def test_humanize_fallback_for_unknown(self):
        result = RaidChartGenerator._humanize_header("unknown_column")
        assert result == "Unknown Column"


# ===================================================================
# 7. Null Handling Tests
# ===================================================================


class TestNullHandling:
    def test_format_number_nan_returns_dash(self):
        result = RaidChartGenerator._format_number(float("nan"))
        assert result == "\u2014"

    def test_format_percentage_none_returns_dash(self):
        result = RaidChartGenerator._format_percentage(None)
        assert result == "\u2014"

    def test_format_percentage_nan_returns_dash(self):
        result = RaidChartGenerator._format_percentage(float("nan"))
        assert result == "\u2014"


# ===================================================================
# 8. Horizontal Bar Tests
# ===================================================================


class TestHorizontalBar:
    def test_many_items_uses_horizontal(self, generator):
        df = pd.DataFrame(
            {
                "company": [f"Company {chr(65 + i)}" for i in range(10)],
                "market_cap": [i * 1e9 for i in range(10, 0, -1)],
            }
        )
        result = generator.generate_chart(df, "Top 10")
        trace = result["data"][0]
        assert trace.get("orientation") == "h"

    def test_few_items_uses_vertical(self, generator):
        df = pd.DataFrame(
            {
                "company": ["A", "B", "C"],
                "value": [100, 200, 300],
            }
        )
        result = generator.generate_chart(df, "Small")
        trace = result["data"][0]
        # Should NOT be horizontal (no orientation or orientation='v')
        assert trace.get("orientation") is None or trace.get("orientation") == "v"


# ===================================================================
# 9. No Duplicate Title Tests
# ===================================================================


class TestNoDuplicateTitle:
    def test_bar_chart_title_empty(self, generator):
        df = pd.DataFrame(
            {
                "company": ["A", "B", "C"],
                "value": [100, 200, 300],
            }
        )
        result = generator.generate_chart(df, "Test")
        layout = result.get("layout", {})
        title = layout.get("title", "")
        if isinstance(title, dict):
            assert title.get("text", "") == ""
        else:
            assert title == ""

    def test_table_title_empty(self, generator):
        df = pd.DataFrame(
            {
                "c1": ["A", "B"],
                "c2": [1, 2],
                "c3": [3, 4],
                "c4": [5, 6],
                "c5": [7, 8],
                "c6": [9, 10],
                "c7": [11, 12],
                "c8": [13, 14],
            }
        )
        result = generator.generate_chart(df, "Table Test")
        layout = result.get("layout", {})
        title = layout.get("title", "")
        if isinstance(title, dict):
            assert title.get("text", "") == ""
        else:
            assert title == ""


# ===================================================================
# 10. Shadow DOM Features Tests
# ===================================================================


class TestShadowDOMFeatures:
    def test_js_has_shadow_dom_polling(self, js_content):
        assert "shadowRoot" in js_content

    def test_js_has_mutation_observer(self, js_content):
        assert "MutationObserver" in js_content

    def test_js_hides_admin_messages(self, js_content):
        assert "Admin" in js_content

    def test_js_manages_tabindex(self, js_content):
        assert "tabindex" in js_content


# ===================================================================
# 11. Keyboard Trap Fix Tests
# ===================================================================


class TestKeyboardTrapFix:
    def test_askquestion_sets_aria_hidden(self, index_html_content):
        assert "aria-hidden" in index_html_content

    def test_askquestion_sets_tabindex(self, index_html_content):
        # The askQuestion function should set tabindex=-1 on collapsed chips
        assert "tabindex" in index_html_content


# ===================================================================
# 12. Responsive CSS Tests
# ===================================================================


class TestResponsiveCSS:
    def test_overflow_x_auto(self, css_content):
        assert "overflow-x" in css_content

    def test_word_wrap(self, css_content):
        assert "word-wrap" in css_content or "overflow-wrap" in css_content

    def test_pre_wrap(self, css_content):
        assert "pre-wrap" in css_content

    def test_plotly_max_width(self, css_content):
        assert "max-width: 100%" in css_content

    def test_sr_only_utility(self, css_content):
        assert ".sr-only" in css_content


# ===================================================================
# 13. Format Number Tests
# ===================================================================


class TestFormatNumber:
    def test_format_billions(self):
        assert RaidChartGenerator._format_number(1.5e9) == "1.5B"

    def test_format_millions(self):
        assert RaidChartGenerator._format_number(2.3e6) == "2.3M"

    def test_format_thousands(self):
        assert RaidChartGenerator._format_number(5.7e3) == "5.7K"

    def test_format_trillions(self):
        assert RaidChartGenerator._format_number(1.2e12) == "1.2T"

    def test_format_small_decimal(self):
        assert RaidChartGenerator._format_number(0.2171) == "0.2171"

    def test_format_regular(self):
        assert RaidChartGenerator._format_number(42.5) == "42.50"
