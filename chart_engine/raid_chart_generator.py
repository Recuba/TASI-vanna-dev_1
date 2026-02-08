"""Ra'd AI custom chart generator with dark gold theme and improved heuristics.

Subclasses Vanna's PlotlyChartGenerator to fix:
1. 4-column table cutoff (raised to 8+)
2. Missing value heatmap (1 label + 3+ numeric)
3. Grouped bar chart using count instead of values
4. String dates not detected as datetime
5. Dark gold theme matching Ra'd AI design
"""

from typing import Dict, Any, List

import json
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import plotly.io as pio

from vanna.integrations.plotly.chart_generator import PlotlyChartGenerator


# Ra'd AI gold color scale for heatmaps
GOLD_COLORSCALE = [
    [0, "#1a1a1a"],
    [0.25, "#3d2e10"],
    [0.5, "#B8860B"],
    [0.75, "#D4A84B"],
    [1.0, "#E8C872"],
]

# Ra'd AI brand palette
RAID_COLORWAY = [
    "#D4A84B",
    "#4CAF50",
    "#4A9FFF",
    "#FF6B6B",
    "#E8C872",
    "#FFA726",
    "#AB47BC",
]

# Human-friendly column labels with units where applicable
COLUMN_LABELS = {
    "market_cap": "Market Cap (SAR)",
    "roe": "Return on Equity",
    "roa": "Return on Assets",
    "profit_margin": "Profit Margin",
    "operating_margin": "Operating Margin",
    "gross_margin": "Gross Margin",
    "ebitda_margin": "EBITDA Margin",
    "short_name": "Company",
    "trailing_pe": "Trailing P/E",
    "forward_pe": "Forward P/E",
    "price_to_book": "Price to Book",
    "price_to_sales": "Price to Sales",
    "dividend_yield": "Dividend Yield",
    "dividend_rate": "Dividend Rate (SAR)",
    "total_revenue": "Total Revenue (SAR)",
    "total_assets": "Total Assets (SAR)",
    "total_debt": "Total Debt (SAR)",
    "total_liabilities_net_minority_interest": "Total Liabilities (SAR)",
    "stockholders_equity": "Stockholders' Equity (SAR)",
    "net_income_to_common": "Net Income (SAR)",
    "free_cashflow": "Free Cash Flow (SAR)",
    "operating_cashflow": "Operating Cash Flow (SAR)",
    "enterprise_value": "Enterprise Value (SAR)",
    "earnings_growth": "Earnings Growth",
    "revenue_growth": "Revenue Growth",
    "earnings_quarterly_growth": "Quarterly Earnings Growth",
    "beta": "Beta",
    "current_ratio": "Current Ratio",
    "quick_ratio": "Quick Ratio",
    "debt_to_equity": "Debt to Equity",
    "peg_ratio": "PEG Ratio",
    "ev_to_revenue": "EV / Revenue",
    "ev_to_ebitda": "EV / EBITDA",
    "sector": "Sector",
    "industry": "Industry",
    "ticker": "Ticker",
    "current_price": "Current Price (SAR)",
    "volume": "Volume",
    "payout_ratio": "Payout Ratio",
}


class RaidChartGenerator(PlotlyChartGenerator):
    """Chart generator with Ra'd AI dark gold theme and smarter heuristics."""

    def generate_chart(self, df: pd.DataFrame, title: str = "Chart") -> Dict[str, Any]:
        if df.empty:
            raise ValueError("Cannot visualize empty DataFrame")

        # Step 1: Detect and convert date-like string columns
        for col in df.select_dtypes(include=["object"]).columns:
            sample = df[col].dropna().astype(str)
            if len(sample) > 0 and sample.str.match(r"^\d{4}-\d{2}-\d{2}").all():
                try:
                    df[col] = pd.to_datetime(df[col])
                except Exception:
                    pass

        # Step 2: Classify columns
        numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
        categorical_cols = df.select_dtypes(
            include=["object", "category"]
        ).columns.tolist()
        datetime_cols = df.select_dtypes(include=["datetime64"]).columns.tolist()

        # Step 3: Table fallback only for very wide results (8+ columns)
        if len(df.columns) >= 8:
            fig = self._create_table(df, title)
            # Remove Plotly title to avoid duplication with the card-level title
            fig.update_layout(title="")
            return json.loads(pio.to_json(fig))

        # Step 4: Apply heuristics (order matters)

        # Time series (date + numeric)
        if len(datetime_cols) > 0 and len(numeric_cols) > 0:
            fig = self._create_time_series_chart(
                df, datetime_cols[0], numeric_cols, title
            )

        # Value heatmap: 1 text label + 3+ numeric columns
        elif len(categorical_cols) == 1 and len(numeric_cols) >= 3:
            fig = self._create_value_heatmap(
                df, categorical_cols[0], numeric_cols, title
            )

        # Single numeric: histogram
        elif len(numeric_cols) == 1 and len(categorical_cols) == 0:
            fig = self._create_histogram(df, numeric_cols[0], title)

        # 1 categorical + 1 numeric: bar chart
        elif len(numeric_cols) == 1 and len(categorical_cols) == 1:
            fig = self._create_bar_chart(
                df, categorical_cols[0], numeric_cols[0], title
            )

        # 2 numeric: scatter
        elif len(numeric_cols) == 2 and len(categorical_cols) == 0:
            fig = self._create_scatter_plot(df, numeric_cols[0], numeric_cols[1], title)

        # 1 categorical + 2 numeric: bar chart with first numeric
        elif len(numeric_cols) == 2 and len(categorical_cols) == 1:
            fig = self._create_bar_chart(
                df, categorical_cols[0], numeric_cols[0], title
            )

        # Only numeric (3+): correlation heatmap
        elif len(numeric_cols) >= 3 and len(categorical_cols) == 0:
            fig = self._create_correlation_heatmap(df, numeric_cols, title)

        # Multiple categorical: grouped bar (fixed)
        elif len(categorical_cols) >= 2:
            fig = self._create_grouped_bar_chart(df, categorical_cols, title)

        # Fallback
        elif len(df.columns) >= 2:
            fig = self._create_generic_chart(df, df.columns[0], df.columns[1], title)
        else:
            raise ValueError("Cannot determine appropriate visualization")

        # Remove Plotly title to avoid duplication with the card-level title
        fig.update_layout(title="")
        return json.loads(pio.to_json(fig))

    # ------------------------------------------------------------------
    # Dark gold theme
    # ------------------------------------------------------------------

    def _apply_standard_layout(self, fig: go.Figure) -> go.Figure:
        fig.update_layout(
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(26,26,26,0.9)",
            font=dict(color="#E0E0E0", family="Tajawal, sans-serif", size=14),
            colorway=RAID_COLORWAY,
            title_font=dict(color="#D4A84B", size=16),
            legend=dict(
                bgcolor="rgba(26,26,26,0.8)",
                bordercolor="rgba(212,168,75,0.2)",
                font=dict(color="#B0B0B0"),
            ),
            xaxis=dict(
                gridcolor="rgba(212,168,75,0.08)",
                zerolinecolor="rgba(212,168,75,0.15)",
                tickfont=dict(color="#B0B0B0", size=13),
            ),
            yaxis=dict(
                gridcolor="rgba(212,168,75,0.08)",
                zerolinecolor="rgba(212,168,75,0.15)",
                tickfont=dict(color="#B0B0B0", size=13),
                automargin=True,
            ),
            autosize=True,
            margin=dict(l=60, r=30, t=50, b=60),
        )
        return fig

    # ------------------------------------------------------------------
    # New: value heatmap
    # ------------------------------------------------------------------

    def _create_value_heatmap(
        self,
        df: pd.DataFrame,
        label_col: str,
        numeric_cols: List[str],
        title: str,
    ) -> go.Figure:
        """Heatmap where each cell shows the actual metric value, color-scaled via z-score."""
        labels = df[label_col].astype(str).tolist()
        raw_values = df[numeric_cols].values.astype(float)

        # Z-score normalize each column independently for comparable color mapping
        with np.errstate(invalid="ignore"):
            means = np.nanmean(raw_values, axis=0)
            stds = np.nanstd(raw_values, axis=0)
            stds[stds == 0] = 1.0  # avoid division by zero
            z_values = (raw_values - means) / stds
        # Replace any remaining NaN in z_values with 0 (neutral color)
        z_values = np.nan_to_num(z_values, nan=0.0)

        # Build text annotations with formatted actual values
        # Use percentage formatting for percentage columns
        pct_flags = [self._is_percentage_column(c) for c in numeric_cols]
        text_matrix = []
        for row in raw_values:
            text_row = []
            for j, v in enumerate(row):
                if pct_flags[j]:
                    text_row.append(self._format_percentage(v))
                else:
                    text_row.append(self._format_number(v))
            text_matrix.append(text_row)

        humanized_cols = [self._humanize_header(c) for c in numeric_cols]

        fig = go.Figure(
            data=go.Heatmap(
                z=z_values,
                x=humanized_cols,
                y=labels,
                text=text_matrix,
                texttemplate="%{text}",
                textfont=dict(size=14, color="#FFFFFF", family="Tajawal, sans-serif"),
                colorscale=GOLD_COLORSCALE,
                showscale=True,
                colorbar=dict(
                    title=dict(text="Z-Score", font=dict(color="#D4A84B", size=14)),
                    tickfont=dict(color="#B0B0B0", size=12),
                    thickness=15,
                ),
                hovertemplate="%{y}<br>%{x}: %{text}<extra></extra>",
            )
        )
        fig.update_layout(
            title=title,
            xaxis=dict(tickfont=dict(size=13, color="#B0B0B0")),
            yaxis=dict(tickfont=dict(size=13, color="#B0B0B0"), automargin=True),
            margin=dict(l=10, r=80, t=50, b=60),
        )
        self._apply_standard_layout(fig)
        return fig

    # ------------------------------------------------------------------
    # Fix: grouped bar chart using actual values when numeric col exists
    # ------------------------------------------------------------------

    def _create_grouped_bar_chart(
        self, df: pd.DataFrame, categorical_cols: List[str], title: str
    ) -> go.Figure:
        numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()

        if len(categorical_cols) >= 2 and len(numeric_cols) > 0:
            # Use actual numeric values instead of counting
            value_col = numeric_cols[0]
            grouped = df.groupby(categorical_cols[:2])[value_col].sum().reset_index()
            fig = go.Figure()
            for name, group in grouped.groupby(categorical_cols[1]):
                fig.add_trace(
                    go.Bar(
                        x=group[categorical_cols[0]], y=group[value_col], name=str(name)
                    )
                )
            fig.update_layout(title=title, barmode="group", yaxis_title=value_col)
            self._apply_standard_layout(fig)
            return fig

        # Fall back to parent behaviour for purely categorical data
        return super()._create_grouped_bar_chart(df, categorical_cols, title)

    # ------------------------------------------------------------------
    # Override table with dark theme
    # ------------------------------------------------------------------

    def _create_table(self, df: pd.DataFrame, title: str) -> go.Figure:
        df = df.fillna(pd.NA)  # normalize NaN types
        header_values = [self._humanize_header(col) for col in df.columns]

        # Build per-column cell values with formatting, and per-column fill colors
        cell_values = []
        fill_colors = []
        font_colors = []
        base_stripe = ["#141414" if i % 2 == 0 else "#1a1a1a" for i in range(len(df))]
        base_font = ["#E0E0E0"] * len(df)

        for col in df.columns:
            raw = df[col].tolist()
            is_pct = self._is_percentage_column(col)
            is_change = self._is_change_column(col)

            if is_pct:
                cell_values.append([self._format_percentage(v) for v in raw])
            else:
                # Format numeric values nicely
                formatted = []
                for v in raw:
                    if v is None or (isinstance(v, float) and pd.isna(v)):
                        formatted.append("\u2014")
                    elif isinstance(v, (int, float)):
                        formatted.append(self._format_number(v))
                    else:
                        s = str(v)
                        formatted.append(
                            "\u2014" if s in ("None", "nan", "NaN", "") else s
                        )
                cell_values.append(formatted)

            if is_change:
                # Conditional coloring: green for positive, red for negative
                col_fills = []
                col_fonts = []
                for i, v in enumerate(raw):
                    try:
                        fv = float(v) if v is not None else None
                    except (ValueError, TypeError):
                        fv = None
                    if fv is not None and not pd.isna(fv):
                        if fv > 0:
                            col_fonts.append("#4CAF50")
                        elif fv < 0:
                            col_fonts.append("#FF6B6B")
                        else:
                            col_fonts.append("#E0E0E0")
                    else:
                        col_fonts.append("#E0E0E0")
                    col_fills.append(base_stripe[i])
                fill_colors.append(col_fills)
                font_colors.append(col_fonts)
            else:
                fill_colors.append(list(base_stripe))
                font_colors.append(list(base_font))

        fig = go.Figure(
            data=[
                go.Table(
                    header=dict(
                        values=header_values,
                        fill_color="#1a1a1a",
                        font=dict(
                            color="#D4A84B", size=14, family="Tajawal, sans-serif"
                        ),
                        align="left",
                        line_color="rgba(212,168,75,0.2)",
                    ),
                    cells=dict(
                        values=cell_values,
                        fill_color=fill_colors,
                        font=dict(
                            color=font_colors, size=13, family="Tajawal, sans-serif"
                        ),
                        align="left",
                        line_color="rgba(212,168,75,0.1)",
                    ),
                )
            ]
        )
        fig.update_layout(
            title=title,
            title_font=dict(color="#D4A84B", size=16),
            paper_bgcolor="rgba(0,0,0,0)",
            font=dict(color="#E0E0E0"),
            margin=dict(l=20, r=20, t=50, b=20),
        )
        return fig

    # ------------------------------------------------------------------
    # Override: bar chart with label rotation and theme
    # ------------------------------------------------------------------

    def _create_bar_chart(
        self, df: pd.DataFrame, x_col: str, y_col: str, title: str
    ) -> go.Figure:
        """Bar chart with horizontal orientation for 8+ items, label rotation for medium sets."""
        labels = df[x_col].astype(str).tolist()

        if len(df) >= 8:
            # Horizontal bar chart for ranked lists - prevents label overlap
            fig = go.Figure(
                data=[
                    go.Bar(
                        y=labels,
                        x=df[y_col],
                        orientation="h",
                        marker_color="#D4A84B",
                    )
                ]
            )
            fig.update_layout(
                title=title,
                xaxis_title=self._humanize_header(y_col),
                yaxis_title=self._humanize_header(x_col),
                yaxis=dict(autorange="reversed"),  # Keep original order (first = top)
            )
            self._apply_standard_layout(fig)
            return fig

        # For smaller datasets, use vertical bar with rotation if needed
        fig = super()._create_bar_chart(df, x_col, y_col, title)
        avg_len = sum(len(lbl) for lbl in labels) / max(len(labels), 1)
        if avg_len > 10:
            fig.update_layout(xaxis_tickangle=-45)
        fig.update_layout(
            xaxis_title=self._humanize_header(x_col),
            yaxis_title=self._humanize_header(y_col),
        )
        self._apply_standard_layout(fig)
        return fig

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    # Common financial acronyms that should stay uppercase
    _ACRONYMS = {"roe", "roa", "pe", "eps", "ebitda", "ebit", "ppe", "cfo", "cfi"}

    # Keywords that indicate a percentage column
    _PCT_KEYWORDS = {
        "margin",
        "yield",
        "ratio",
        "roe",
        "roa",
        "growth",
        "pct",
        "return",
    }

    # Keywords that indicate a value-change column (for conditional coloring)
    _CHANGE_KEYWORDS = {"growth", "change", "return"}

    @staticmethod
    def _humanize_header(col_name: str) -> str:
        """Convert snake_case column names to human-friendly labels."""
        if col_name in COLUMN_LABELS:
            return COLUMN_LABELS[col_name]
        parts = col_name.split("_")
        result = []
        for part in parts:
            if part.lower() in RaidChartGenerator._ACRONYMS:
                result.append(part.upper())
            else:
                result.append(part.capitalize())
        return " ".join(result)

    @staticmethod
    def _is_percentage_column(col_name: str) -> bool:
        """Return True if column name suggests percentage data."""
        lower = col_name.lower()
        return any(kw in lower for kw in RaidChartGenerator._PCT_KEYWORDS)

    @staticmethod
    def _is_change_column(col_name: str) -> bool:
        """Return True if column name suggests a growth/change value."""
        lower = col_name.lower()
        return any(kw in lower for kw in RaidChartGenerator._CHANGE_KEYWORDS)

    @staticmethod
    def _format_percentage(val) -> str:
        """Format a decimal value as percentage string. 0.2171 -> '21.71%'."""
        if val is None or (isinstance(val, float) and pd.isna(val)):
            return "\u2014"  # em dash
        try:
            return f"{float(val) * 100:.2f}%"
        except (ValueError, TypeError):
            return str(val)

    @staticmethod
    def _format_number(val: float) -> str:
        """Format numbers nicely: 1500000000 -> '1.5B', 0.2171 -> '0.2171'."""
        if pd.isna(val):
            return "\u2014"  # em dash
        if abs(val) >= 1e12:
            return f"{val / 1e12:.1f}T"
        if abs(val) >= 1e9:
            return f"{val / 1e9:.1f}B"
        if abs(val) >= 1e6:
            return f"{val / 1e6:.1f}M"
        if abs(val) >= 1e3:
            return f"{val / 1e3:.1f}K"
        if abs(val) < 1:
            return f"{val:.4f}"
        return f"{val:.2f}"
