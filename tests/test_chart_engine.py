"""Comprehensive tests for RaidChartGenerator chart engine."""

import base64
import json
import sqlite3
import struct
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Add project root to path
import sys
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from chart_engine import RaidChartGenerator


def _extract_y_values(y_field):
    """Extract numeric values from Plotly JSON y field (handles both list and bdata formats)."""
    if isinstance(y_field, list):
        return y_field
    if isinstance(y_field, dict) and "bdata" in y_field:
        raw = base64.b64decode(y_field["bdata"])
        dtype = y_field.get("dtype", "f8")
        fmt_map = {"i1": "b", "u1": "B", "i2": "<h", "u2": "<H",
                   "i4": "<i", "u4": "<I", "f4": "<f", "f8": "<d"}
        fmt = fmt_map.get(dtype, "<d")
        size = struct.calcsize(fmt)
        return [struct.unpack(fmt, raw[i:i+size])[0] for i in range(0, len(raw), size)]
    return []


@pytest.fixture
def gen():
    """Chart generator instance."""
    return RaidChartGenerator()


@pytest.fixture
def db_conn():
    """Connection to the real Saudi stocks database."""
    db_path = PROJECT_ROOT / "saudi_stocks.db"
    if not db_path.exists():
        pytest.skip("saudi_stocks.db not found")
    conn = sqlite3.connect(str(db_path))
    yield conn
    conn.close()


# ===================================================================
# Chart type detection tests
# ===================================================================

class TestBarChart:
    def test_1_text_1_numeric_produces_bar(self, gen):
        df = pd.DataFrame({"company": ["A", "B", "C"], "revenue": [100, 200, 300]})
        result = gen.generate_chart(df, "Test")
        assert result["data"][0]["type"] == "bar"

    def test_bar_has_dark_theme(self, gen):
        df = pd.DataFrame({"company": ["A", "B", "C"], "revenue": [100, 200, 300]})
        result = gen.generate_chart(df, "Test")
        assert result["layout"]["paper_bgcolor"] == "rgba(0,0,0,0)"

    def test_bar_with_real_data(self, gen, db_conn):
        df = pd.read_sql(
            "SELECT c.short_name, m.market_cap FROM companies c JOIN market_data m USING(ticker) ORDER BY m.market_cap DESC LIMIT 10",
            db_conn
        )
        result = gen.generate_chart(df, "Top 10")
        assert result["data"][0]["type"] == "bar"


class TestValueHeatmap:
    def test_1_text_3_numeric_produces_heatmap(self, gen):
        df = pd.DataFrame({
            "name": ["A", "B", "C"],
            "x": [1.0, 2.0, 3.0],
            "y": [4.0, 5.0, 6.0],
            "z": [7.0, 8.0, 9.0],
        })
        result = gen.generate_chart(df, "Heatmap Test")
        assert result["data"][0]["type"] == "heatmap"

    def test_heatmap_has_text_annotations(self, gen):
        df = pd.DataFrame({
            "name": ["A", "B", "C"],
            "x": [0.1, 0.2, 0.3],
            "y": [0.4, 0.5, 0.6],
            "z": [0.7, 0.8, 0.9],
        })
        result = gen.generate_chart(df, "Test")
        assert "text" in result["data"][0]
        assert "texttemplate" in result["data"][0]

    def test_heatmap_with_5_numeric_cols(self, gen):
        df = pd.DataFrame({
            "name": ["A", "B"],
            "a": [1, 2], "b": [3, 4], "c": [5, 6], "d": [7, 8], "e": [9, 10],
        })
        result = gen.generate_chart(df, "Test")
        assert result["data"][0]["type"] == "heatmap"

    def test_heatmap_with_real_profitability_data(self, gen, db_conn):
        df = pd.read_sql(
            """SELECT c.short_name, p.roe, p.roa, p.profit_margin
            FROM companies c JOIN profitability_metrics p USING(ticker)
            JOIN market_data m USING(ticker)
            WHERE p.roe IS NOT NULL
            ORDER BY m.market_cap DESC LIMIT 15""",
            db_conn
        )
        result = gen.generate_chart(df, "Profitability Heatmap")
        assert result["data"][0]["type"] == "heatmap"
        # Previously this was a TABLE due to 4-column cutoff

    def test_heatmap_uses_gold_colorscale(self, gen):
        df = pd.DataFrame({
            "name": ["A", "B", "C"],
            "x": [1.0, 2.0, 3.0],
            "y": [4.0, 5.0, 6.0],
            "z": [7.0, 8.0, 9.0],
        })
        result = gen.generate_chart(df, "Test")
        colorscale = result["data"][0].get("colorscale")
        assert colorscale is not None
        # Should contain gold colors
        colors = [c[1] for c in colorscale]
        assert "#D4A84B" in colors or "#E8C872" in colors


class TestScatterPlot:
    def test_2_numeric_produces_scatter(self, gen):
        df = pd.DataFrame({"x": [1, 2, 3], "y": [4, 5, 6]})
        result = gen.generate_chart(df, "Test")
        assert result["data"][0]["type"] == "scatter"

    def test_scatter_with_real_data(self, gen, db_conn):
        df = pd.read_sql(
            "SELECT m.market_cap, v.trailing_pe FROM market_data m JOIN valuation_metrics v USING(ticker) WHERE v.trailing_pe IS NOT NULL AND m.market_cap IS NOT NULL LIMIT 50",
            db_conn
        )
        result = gen.generate_chart(df, "Market Cap vs PE")
        assert result["data"][0]["type"] == "scatter"


class TestHistogram:
    def test_1_numeric_produces_histogram(self, gen):
        df = pd.DataFrame({"value": [1, 2, 2, 3, 3, 3, 4, 4, 5]})
        result = gen.generate_chart(df, "Test")
        assert result["data"][0]["type"] == "histogram"

    def test_histogram_with_real_data(self, gen, db_conn):
        df = pd.read_sql(
            "SELECT dividend_yield FROM dividend_data WHERE dividend_yield IS NOT NULL AND dividend_yield > 0",
            db_conn
        )
        result = gen.generate_chart(df, "Dividend Distribution")
        assert result["data"][0]["type"] == "histogram"


class TestTimeSeries:
    def test_string_dates_detected(self, gen):
        df = pd.DataFrame({
            "date": ["2024-01-01", "2024-06-01", "2024-12-01"],
            "revenue": [100, 200, 300],
        })
        result = gen.generate_chart(df, "Test")
        # Should be line chart (scatter type with mode=lines)
        assert result["data"][0]["type"] == "scatter"
        assert result["data"][0].get("mode") == "lines"

    def test_datetime64_column(self, gen):
        df = pd.DataFrame({
            "date": pd.to_datetime(["2024-01-01", "2024-06-01"]),
            "value": [10, 20],
        })
        result = gen.generate_chart(df, "Test")
        assert result["data"][0]["type"] == "scatter"

    def test_time_series_with_real_data(self, gen, db_conn):
        df = pd.read_sql(
            """SELECT period_date, total_revenue FROM income_statement
            WHERE ticker='2222.SR' AND period_type='annual' ORDER BY period_date""",
            db_conn
        )
        result = gen.generate_chart(df, "Aramco Revenue")
        assert result["data"][0]["type"] == "scatter"


class TestCorrelationHeatmap:
    def test_3_numeric_no_text_produces_correlation(self, gen):
        df = pd.DataFrame({
            "a": [1, 2, 3, 4, 5],
            "b": [5, 4, 3, 2, 1],
            "c": [1, 3, 2, 4, 5],
        })
        result = gen.generate_chart(df, "Test")
        assert result["data"][0]["type"] == "heatmap"


class TestTable:
    def test_8_columns_produces_table(self, gen):
        df = pd.DataFrame({f"col_{i}": range(3) for i in range(8)})
        result = gen.generate_chart(df, "Test")
        assert result["data"][0]["type"] == "table"

    def test_7_columns_does_NOT_produce_table(self, gen):
        # 7 columns should NOT trigger table (old engine was 4+)
        df = pd.DataFrame({
            "name": ["A", "B"],
            "v1": [1, 2], "v2": [3, 4], "v3": [5, 6],
            "v4": [7, 8], "v5": [9, 10], "v6": [11, 12],
        })
        result = gen.generate_chart(df, "Test")
        # Should be value heatmap, NOT table
        assert result["data"][0]["type"] != "table"

    def test_table_has_dark_theme(self, gen):
        df = pd.DataFrame({f"col_{i}": range(3) for i in range(8)})
        result = gen.generate_chart(df, "Test")
        header = result["data"][0]["header"]
        assert header["fill"]["color"] == "#1a1a1a"


# ===================================================================
# Edge cases
# ===================================================================

class TestEdgeCases:
    def test_empty_dataframe_raises(self, gen):
        with pytest.raises(ValueError, match="empty"):
            gen.generate_chart(pd.DataFrame(), "Test")

    def test_single_row(self, gen):
        df = pd.DataFrame({"name": ["A"], "value": [42]})
        result = gen.generate_chart(df, "Test")
        assert "data" in result
        assert "layout" in result

    def test_nan_values_dont_crash(self, gen):
        df = pd.DataFrame({
            "name": ["A", "B", "C"],
            "x": [1.0, float("nan"), 3.0],
            "y": [float("nan"), 5.0, 6.0],
            "z": [7.0, 8.0, float("nan")],
        })
        result = gen.generate_chart(df, "Test")
        assert "data" in result

    def test_large_dataset(self, gen):
        df = pd.DataFrame({
            "company": [f"Company_{i}" for i in range(100)],
            "revenue": range(100),
        })
        result = gen.generate_chart(df, "Test")
        assert result["data"][0]["type"] == "bar"


# ===================================================================
# Dark theme verification
# ===================================================================

class TestDarkTheme:
    def test_transparent_background(self, gen):
        df = pd.DataFrame({"x": [1, 2, 3], "y": [4, 5, 6]})
        result = gen.generate_chart(df, "Test")
        assert result["layout"]["paper_bgcolor"] == "rgba(0,0,0,0)"

    def test_gold_title(self, gen):
        """Verify _apply_standard_layout sets gold title font color.
        Note: generate_chart() intentionally clears title text to avoid
        duplication with the card-level title, so we test the layout method directly."""
        import plotly.graph_objects as go
        fig = go.Figure(data=[go.Bar(x=[1, 2, 3], y=[4, 5, 6])])
        fig.update_layout(title="Test Title")
        gen._apply_standard_layout(fig)
        assert fig.layout.title.font.color == "#D4A84B"

    def test_light_text_color(self, gen):
        df = pd.DataFrame({"x": [1, 2, 3], "y": [4, 5, 6]})
        result = gen.generate_chart(df, "Test")
        font_color = result["layout"]["font"]["color"]
        assert font_color == "#E0E0E0"


# ===================================================================
# Number formatting
# ===================================================================

class TestNumberFormatting:
    def test_format_billions(self):
        assert RaidChartGenerator._format_number(1_500_000_000) == "1.5B"

    def test_format_millions(self):
        assert RaidChartGenerator._format_number(2_500_000) == "2.5M"

    def test_format_thousands(self):
        assert RaidChartGenerator._format_number(3_500) == "3.5K"

    def test_format_trillions(self):
        assert RaidChartGenerator._format_number(7_000_000_000_000) == "7.0T"

    def test_format_small_decimal(self):
        assert RaidChartGenerator._format_number(0.2171) == "0.2171"

    def test_format_nan(self):
        assert RaidChartGenerator._format_number(float("nan")) == "\u2014"

    def test_format_regular_number(self):
        assert RaidChartGenerator._format_number(42.5) == "42.50"


# ===================================================================
# Regression: Prove old engine bugs are fixed
# ===================================================================

class TestRegressions:
    """Verify that bugs in the original PlotlyChartGenerator are fixed."""

    def test_4_columns_NOT_table(self, gen):
        """Original engine: 4 columns = table. RaidChartGenerator: heatmap."""
        df = pd.DataFrame({
            "name": ["A", "B", "C"],
            "roe": [0.2, 0.15, 0.1],
            "roa": [0.1, 0.05, 0.03],
            "margin": [0.3, 0.4, 0.5],
        })
        result = gen.generate_chart(df, "Test")
        assert result["data"][0]["type"] == "heatmap"  # NOT "table"

    def test_grouped_bar_not_count(self, gen):
        """Original engine: grouped bar used .size() = count. Should use values."""
        df = pd.DataFrame({
            "sector": ["Energy", "Energy", "Finance"],
            "rating": ["A", "B", "A"],
            "score": [90, 80, 70],
        })
        # With 2 categorical + 1 numeric, should use actual score values
        result = gen.generate_chart(df, "Test")
        # Collect all y values across all bar traces
        all_y = []
        for trace in result["data"]:
            if trace["type"] == "bar":
                all_y.extend(_extract_y_values(trace.get("y", [])))
        assert any(v != 1 for v in all_y if v is not None), "Should use actual values, not counts"

    def test_string_dates_converted(self, gen):
        """Original engine: string dates not detected. Should be line chart."""
        df = pd.DataFrame({
            "period_date": ["2022-12-31", "2023-12-31", "2024-12-31"],
            "revenue": [1e9, 1.5e9, 2e9],
        })
        result = gen.generate_chart(df, "Test")
        # Should be time series (scatter with lines), not bar chart
        assert result["data"][0]["type"] == "scatter"


# ===================================================================
# Integration with VisualizeDataTool
# ===================================================================

class TestVisualizeDataToolIntegration:
    def test_custom_generator_injected(self):
        """Verify VisualizeDataTool accepts RaidChartGenerator."""
        from vanna.tools import VisualizeDataTool
        tool = VisualizeDataTool(plotly_generator=RaidChartGenerator())
        assert isinstance(tool.plotly_generator, RaidChartGenerator)
