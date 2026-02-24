# Ra'd AI Frontend

Next.js 14 frontend for the Ra'd AI Saudi Stock Market platform.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with RTL logical properties
- **UI Library**: Recharts (heatmap, treemap), lightweight-charts (TASI index), TradingView (stock charts)
- **Fonts**: IBM Plex Sans Arabic, Inter
- **Testing**: Vitest

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
# Edit .env.local and set NEXT_PUBLIC_API_URL to your backend URL

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm test` | Run Vitest unit tests |
| `npm run lint` | ESLint |
| `npm run lint:rtl` | Check for RTL direction violations (physical margin/padding classes) |

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (home)/             # Homepage: heatmap, movers, news, breadth
│   ├── charts/             # TradingView + TASI index charts
│   ├── market/             # Market overview
│   ├── screener/           # Stock screener with filters and CSV export
│   ├── calendar/           # Financial calendar (grid + list views)
│   ├── news/               # Arabic news feed
│   ├── chat/               # AI chat interface (Vanna SSE)
│   ├── portfolio/          # Portfolio tracker
│   ├── alerts/             # Price alerts
│   └── stock/[ticker]/     # Individual stock detail pages
├── components/
│   ├── layout/             # AppShell, Header, Sidebar, Footer
│   ├── charts/             # Chart wrappers and TradingView widget
│   ├── widgets/            # LiveMarketWidgets (SSE ticker)
│   ├── common/             # ConnectionStatusBadge, BackToTop, CommandPalette
│   └── alerts/             # AlertBell, AlertModal
├── lib/
│   ├── api/                # Domain API modules (stocks, news, screener, alerts, calendar)
│   ├── api-client.ts       # Backward-compatible shim re-exporting from api/
│   ├── config.ts           # Runtime config (NEXT_PUBLIC_* env vars)
│   ├── hooks/              # use-api, use-alerts, use-portfolio, use-auth, use-keyboard-nav
│   └── utils.ts            # Utility functions
├── providers/              # ThemeProvider, LanguageProvider
└── styles/
    └── design-system.ts    # Design tokens (colors, spacing, typography, layout)
```

## Key Patterns

### RTL Support
All horizontal spacing uses Tailwind logical properties. Do NOT use `ml-*`, `mr-*`, `pl-*`, `pr-*`.
Use `ms-*`, `me-*`, `ps-*`, `pe-*` instead. Run `npm run lint:rtl` to verify.

### SSE Connections
SSE endpoints (`/api/v1/news/stream`, `/api/v1/widgets/stream`) use exponential backoff reconnection
and `request.is_disconnected()` checks server-side. All fetch calls include `AbortController`.

### localStorage with useSyncExternalStore
Portfolio, alerts, and watchlist use the `rad-ai-*` key prefix with the `useSyncExternalStore`
pattern (`subscribe`, `emitChange`, `getSnapshot`, `getServerSnapshot`) for cross-component reactivity.

### Design Tokens
Global tokens live in `src/styles/design-system.ts`. Several luxury-themed pages (screener, calendar,
sector heatmap) define local `P` and `F` variant token objects — see that file for documentation.

### Anti-Flash Scripts
Two inline scripts in `layout.tsx` prevent flash-of-wrong-theme and flash-of-wrong-direction by
reading `rad-ai-theme` and `rad-ai-lang` from localStorage before React hydrates.
