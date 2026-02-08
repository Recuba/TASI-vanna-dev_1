"""Validate that all 8 suggestion chip queries produce the correct chart types.

Runs representative SQL queries against the real SQLite database
and verifies the RaidChartGenerator selects the expected chart type.
"""

import sqlite3
import sys
from pathlib import Path

# Ensure project root on path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
from chart_engine import RaidChartGenerator

DB_PATH = PROJECT_ROOT / "saudi_stocks.db"


def main():
    if not DB_PATH.exists():
        print(f"ERROR: {DB_PATH} not found")
        sys.exit(1)

    conn = sqlite3.connect(str(DB_PATH))
    gen = RaidChartGenerator()

    tests = [
        {
            "chip": "Bar chart: Top 10 by market cap",
            "sql": "SELECT c.short_name, m.market_cap FROM companies c JOIN market_data m USING(ticker) ORDER BY m.market_cap DESC LIMIT 10",
            "expected_type": "bar",
        },
        {
            "chip": "Heatmap: Profitability metrics",
            "sql": """SELECT c.short_name, p.roe, p.roa, p.profit_margin
                      FROM companies c JOIN profitability_metrics p USING(ticker)
                      JOIN market_data m USING(ticker)
                      WHERE p.roe IS NOT NULL ORDER BY m.market_cap DESC LIMIT 15""",
            "expected_type": "heatmap",
        },
        {
            "chip": "Line chart: Aramco revenue trend",
            "sql": """SELECT period_date, total_revenue FROM income_statement
                      WHERE ticker='2222.SR' AND period_type='annual' ORDER BY period_date""",
            "expected_type": "scatter",  # Plotly line chart = scatter with mode=lines
        },
        {
            "chip": "Chart: Sector valuation comparison",
            "sql": """SELECT c.sector, AVG(v.trailing_pe) as avg_pe, AVG(v.price_to_book) as avg_pb, AVG(d.dividend_yield) as avg_div_yield
                      FROM companies c
                      JOIN valuation_metrics v USING(ticker)
                      JOIN dividend_data d USING(ticker)
                      WHERE v.trailing_pe IS NOT NULL
                      GROUP BY c.sector
                      HAVING COUNT(*) > 5""",
            "expected_type": "heatmap",  # 1 text + 3 numeric = value heatmap
        },
        {
            "chip": "Scatter: Market cap vs P/E",
            "sql": """SELECT m.market_cap, v.trailing_pe FROM market_data m
                      JOIN valuation_metrics v USING(ticker)
                      WHERE v.trailing_pe IS NOT NULL AND m.market_cap IS NOT NULL""",
            "expected_type": "scatter",
        },
        {
            "chip": "Histogram: Dividend yield distribution",
            "sql": "SELECT dividend_yield FROM dividend_data WHERE dividend_yield IS NOT NULL AND dividend_yield > 0",
            "expected_type": "histogram",
        },
        {
            "chip": "Chart: Sectors by company count",
            "sql": """SELECT c.sector, COUNT(*) as company_count
                      FROM companies c GROUP BY c.sector
                      ORDER BY company_count DESC""",
            "expected_type": "bar",
        },
        {
            "chip": "Heatmap: Bank balance sheets",
            "sql": """SELECT c.short_name,
                             CAST(fs.total_debt AS REAL) as total_debt,
                             CAST(bs.total_assets AS REAL) as total_assets,
                             CAST(bs.stockholders_equity AS REAL) as stockholders_equity
                      FROM companies c
                      JOIN financial_summary fs USING(ticker)
                      JOIN balance_sheet bs USING(ticker)
                      WHERE c.sector = 'Financial Services'
                      AND bs.period_type = 'annual' AND bs.period_index = 0
                      AND fs.total_debt IS NOT NULL
                      ORDER BY bs.total_assets DESC LIMIT 10""",
            "expected_type": "heatmap",
        },
    ]

    passed = 0
    failed = 0

    print("=" * 70)
    print("  SUGGESTION CHIP CHART VALIDATION")
    print("=" * 70)

    for i, test in enumerate(tests, 1):
        try:
            df = pd.read_sql(test["sql"], conn)
            result = gen.generate_chart(df, test["chip"])
            actual_type = result["data"][0]["type"]
            ok = actual_type == test["expected_type"]

            status = "PASS" if ok else "FAIL"
            if ok:
                passed += 1
            else:
                failed += 1

            print(f"\n{i}. [{status}] {test['chip']}")
            print(f"   Shape: {df.shape}  Cols: {df.columns.tolist()}")
            print(f"   Expected: {test['expected_type']}  Got: {actual_type}")

        except Exception as e:
            failed += 1
            print(f"\n{i}. [ERROR] {test['chip']}")
            print(f"   Error: {e}")

    conn.close()

    print(f"\n{'=' * 70}")
    print(f"  RESULTS: {passed} passed, {failed} failed out of {len(tests)}")
    print(f"{'=' * 70}")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
