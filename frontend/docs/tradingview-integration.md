# TradingView Charts Integration

## Overview

Ra'd AI now integrates the **TradingView Advanced Chart Widget** (free tier) to provide professional-grade candlestick charts for all TASI-listed stocks. Users can search for any TASI stock by symbol or company name and view interactive daily charts with full technical analysis capabilities.

## Implementation

### Components

#### 1. **TradingViewWidget** ([src/components/charts/TradingViewWidget.tsx](../src/components/charts/TradingViewWidget.tsx))

The main widget component that embeds TradingView's Advanced Chart.

**Features:**
- Dynamic symbol switching
- Configurable intervals (1min to monthly)
- Dark/light theme support
- Candlestick style by default
- Interactive toolbar with drawing tools, indicators, and studies
- Image export capability
- Responsive sizing

**Props:**
```typescript
interface TradingViewWidgetProps {
  symbol: string;              // TradingView format: "TADAWUL:2222"
  interval?: string;           // "1" | "3" | "5" | "15" | "30" | "60" | "D" | "W" | "M"
  theme?: 'light' | 'dark';   // Chart theme
  height?: number;             // Chart height in pixels
  allowSymbolChange?: boolean; // Enable symbol search
  hideTopToolbar?: boolean;    // Hide drawing tools
  hideSideToolbar?: boolean;   // Hide watchlist/indicators
  hideVolume?: boolean;        // Hide volume bars
  enableSaveImage?: boolean;   // Enable chart export
  className?: string;          // Custom CSS classes
}
```

**Usage Example:**
```tsx
import TradingViewWidget from '@/components/charts/TradingViewWidget';
import { formatTASISymbol } from '@/lib/tradingview-utils';

<TradingViewWidget
  symbol={formatTASISymbol("2222")} // "TADAWUL:2222"
  interval="D"
  theme="dark"
  height={600}
  allowSymbolChange={false}
/>
```

#### 2. **TradingView Utilities** ([src/lib/tradingview-utils.ts](../src/lib/tradingview-utils.ts))

Helper functions for working with TASI stock symbols.

**Functions:**

- `formatTASISymbol(ticker: string): string`
  - Converts TASI ticker to TradingView format
  - Example: `"2222"` → `"TADAWUL:2222"`

- `extractTicker(symbol: string): string`
  - Extracts plain ticker from TradingView format
  - Example: `"TADAWUL:2222"` → `"2222"`

- `isValidTASITicker(ticker: string): boolean`
  - Validates TASI ticker format (4-digit number)
  - Example: `"2222"` → `true`, `"ABC"` → `false`

- `getTASIStockName(ticker: string): string`
  - Returns display name for popular TASI stocks
  - Example: `"2222"` → `"Saudi Aramco"`

### Pages

#### **Charts Page** ([src/app/charts/page.tsx](../src/app/charts/page.tsx))

The main charting interface accessible at `/charts`.

**Features:**
1. **Search Bar**
   - Real-time search for stocks by ticker or company name
   - Dropdown with matching results
   - Minimum 2 characters to trigger search

2. **Quick Pick Chips**
   - 10 popular TASI stocks (Aramco, Al Rajhi, SABIC, etc.)
   - One-click selection
   - Visual feedback for selected stock

3. **Default View**
   - Shows TASI Index chart when no stock selected
   - Full TradingView functionality

4. **Stock View**
   - Selected stock's candlestick chart
   - Stock header with current price and change
   - Sector information
   - Link to full stock detail page

5. **AI Chat CTA**
   - Link to Ra'd AI chat for deeper analysis

## Symbol Format

TradingView uses specific symbol formats for each exchange:

| Exchange | Format | Example |
|----------|--------|---------|
| TADAWUL (Saudi) | `TADAWUL:XXXX` | `TADAWUL:2222` (Aramco) |
| TASI Index | `TASI` | `TASI` (Tadawul All Share Index) |

**Note:** The widget automatically handles the symbol format conversion using `formatTASISymbol()`.

## Configuration

### Widget Settings

The current implementation uses these settings:

```javascript
{
  autosize: true,              // Responsive width
  symbol: "TADAWUL:2222",     // Dynamic based on selection
  interval: "D",               // Daily candlesticks
  timezone: "Asia/Riyadh",    // Saudi timezone
  theme: "dark",               // Matches Ra'd AI design
  style: "1",                  // Candlestick style
  locale: "en",                // English interface
  allow_symbol_change: false, // Disabled in stock view
  calendar: false,             // Hide earnings calendar
  hide_top_toolbar: false,    // Show drawing tools
  hide_side_toolbar: false,   // Show indicators
  hide_volume: false,          // Show volume bars
  save_image: true            // Enable chart export
}
```

### Customization

To customize the widget appearance or behavior, modify the config in [TradingViewWidget.tsx](../src/components/charts/TradingViewWidget.tsx):

```tsx
const config = {
  // ... modify settings here
};
```

Available customization options:
- Chart type (candlestick, line, area, bars, etc.)
- Technical indicators (RSI, MACD, Bollinger Bands, etc.)
- Drawing tools (trendlines, fibonacci, etc.)
- Time intervals (1min, 5min, 1hr, daily, weekly, monthly)
- Color schemes and styles

See [TradingView Widget Documentation](https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/) for full options.

## Testing

### Unit Tests

**TradingView Utilities** ([src/lib/__tests__/tradingview-utils.test.ts](../src/lib/__tests__/tradingview-utils.test.ts))

9 tests covering:
- Symbol formatting (plain ticker → TADAWUL format)
- Ticker extraction (TADAWUL format → plain ticker)
- Ticker validation (4-digit format check)
- Stock name lookup (ticker → display name)

```bash
cd frontend
npm test tradingview-utils
```

### Manual Testing

1. **Navigate to Charts page**
   - Click "Charts" tab in sidebar
   - Should load TASI Index by default

2. **Search for stock**
   - Type "Aramco" or "2222" in search bar
   - Select from dropdown
   - Chart should update to Aramco candlestick

3. **Quick pick selection**
   - Click any quick pick chip (e.g., "Al Rajhi")
   - Chart should switch immediately
   - Chip should highlight

4. **Verify chart functionality**
   - Chart should be interactive (zoom, pan)
   - Drawing tools should be accessible
   - Volume bars should display below price
   - Indicators menu should work

5. **Test responsiveness**
   - Resize browser window
   - Chart should resize automatically
   - All controls should remain accessible

## Navigation

The Charts page is accessible through:
1. **Sidebar** - "Charts" tab
2. **Direct URL** - `/charts`
3. **Stock detail page** - "View full details" link

## Performance

- **Bundle Size**: 4.13 kB (page), 109 kB (First Load JS)
- **Loading**: Skeleton loader shown during script load
- **Rendering**: Client-side only (dynamic import with SSR disabled)
- **Caching**: TradingView handles data caching internally

## Limitations

### Free Tier Restrictions

The TradingView Advanced Chart Widget (free tier) has these limitations:

1. **No commercial use** - Only for personal/non-commercial projects
2. **Branding required** - "Powered by TradingView" attribution mandatory
3. **Data delays** - May have 15-minute delayed data for some symbols
4. **No custom datafeed** - Uses TradingView's data exclusively
5. **No whitelabeling** - TradingView branding cannot be removed

### TASI Symbol Coverage

- TradingView may not have data for all 500+ TASI stocks
- Newly listed stocks may have delayed addition
- If a symbol is not found, widget will show "Symbol not found" message

### Alternatives Considered

For production/commercial use, consider:

1. **TradingView Charting Library** (Paid)
   - Self-hosted with custom datafeed
   - No branding requirements
   - Full customization
   - Requires license (contact TradingView)

2. **Lightweight Charts** (Free, Open Source)
   - Already integrated in Ra'd AI
   - Used for sparklines and mini charts
   - Limited compared to TradingView
   - Custom data from backend required

## Troubleshooting

### Chart not loading

1. Check browser console for script loading errors
2. Verify symbol format is correct: `TADAWUL:XXXX`
3. Ensure internet connection (widget loads from TradingView CDN)
4. Try different stock symbol to rule out data availability

### Symbol not found

1. Verify ticker exists on TADAWUL
2. Check symbol format: `formatTASISymbol("2222")` → `"TADAWUL:2222"`
3. Try searching on [TradingView website](https://www.tradingview.com/) directly
4. Some stocks may not have coverage on TradingView

### Chart appears blank

1. Check height prop is set: `height={600}`
2. Verify container has dimensions
3. Check theme prop matches your design system
4. Clear browser cache and reload

## References

- [TradingView Advanced Chart Widget Documentation](https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/)
- [TradingView Widget Constructor](https://www.tradingview.com/charting-library-docs/latest/core_concepts/Widget-Constructor/)
- [TradingView Free Charting Libraries](https://www.tradingview.com/free-charting-libraries/)
- [Next.js Dynamic Imports](https://nextjs.org/docs/advanced-features/dynamic-import)

## Future Enhancements

Potential improvements for future iterations:

1. **Multiple timeframes** - Quick switcher for 1D, 1W, 1M, 3M, 1Y
2. **Comparison mode** - Compare multiple stocks on same chart
3. **Watchlist integration** - Show all watchlist stocks in side panel
4. **Custom indicators** - Pre-configured technical analysis setups
5. **Chart templates** - Save and load user chart preferences
6. **Mobile optimization** - Simplified interface for mobile devices
7. **Fullscreen mode** - Dedicated fullscreen chart view
8. **Share charts** - Generate shareable chart links or images

---

**Last Updated**: 2026-02-10
**Version**: 1.0.0
**Maintainer**: Ra'd AI Development Team
