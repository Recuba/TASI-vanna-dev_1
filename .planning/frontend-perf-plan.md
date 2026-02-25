# Frontend Performance Optimization Plan

## Task #3 - 5 subtasks across 3 phases

### Current State Analysis
- Bundle analyzer already configured in `next.config.mjs` (withBundleAnalyzer wrapping nextConfig)
- `@next/bundle-analyzer` v16.1.6 already in devDependencies
- Charts already lazy-loaded in `frontend/src/components/charts/index.tsx` using `next/dynamic` with `ssr: false`
- Existing `ChartSkeleton.tsx` in charts/ with dark-gold theme and shimmer animation
- SWR already in dependencies
- TypeScript strict mode enabled
- No `frontend/scripts/`, `frontend/src/lib/performance/`, `frontend/src/components/performance/`, or `frontend/src/config/cdn.ts` exist yet

### Phase 1: Bundle Analysis Setup

**TASK 1 - Bundle Analysis Script**
- Create `frontend/scripts/analyze-bundle.js`: Node script that sets ANALYZE=true and spawns `next build`
- Add `"analyze"` npm script to package.json: `"cross-env ANALYZE=true next build"` (or use process.env in the script itself since cross-env may not be installed)
- The script approach works on Windows + Unix without cross-env dependency

Files to create:
- `frontend/scripts/analyze-bundle.js`

Files to modify:
- `frontend/package.json` (add "analyze" script)

### Phase 2: Integration

**TASK 2 - Dynamic Import Strategy**

Charts are ALREADY lazy-loaded in `charts/index.tsx`. I will NOT duplicate that. Instead, I'll create lazy wrappers for OTHER heavy components that aren't yet lazy-loaded:
- PreBuiltCharts (fetches data + renders SVG charts)
- StockComparisonChart (uses lightweight-charts)
- Other heavy page-level components (chat, data tables, admin panels)

Create `frontend/src/lib/performance/lazy-components.ts`:
- Re-export existing chart lazy imports from charts/index.tsx for convenience
- Add new lazy wrappers for: PreBuiltCharts, StockComparisonChart
- Export type-safe lazy loaders with appropriate skeletons

Create `frontend/src/components/performance/Skeletons.tsx`:
- `TableSkeleton` - for data tables (dark-gold theme, pulse animation)
- `DashboardSkeleton` - for admin/dashboard views
- `ChatSkeleton` - for chat interface
- Reuse existing `ChartSkeleton` from charts/ (import and re-export)
- All match the existing dark-gold design (#D4A84B, #1A1A1A backgrounds)

**TASK 3 - Image Optimization**

Create `frontend/src/components/performance/OptimizedImage.tsx`:
- Wrapper around `next/image`
- Props: src, alt, width, height, priority, className, quality (default 80)
- loading="lazy" by default (override with priority=true)
- Blur placeholder support via blurDataURL prop
- Responsive breakpoints via sizes prop with sensible defaults

Create `frontend/src/lib/performance/image-config.ts`:
- Export image domain configuration for next.config.mjs `images` section
- Domains: TradingView CDN, potential stock logo sources
- Device sizes and image sizes arrays

### Phase 3: Final

**TASK 4 - Performance Utilities**

Create `frontend/src/lib/performance/utils.ts`:
- `debounce<T>(fn, ms)` - generic debounce
- `throttle<T>(fn, ms)` - generic throttle
- `prefetchRoute(path)` - wrapper around next/router prefetch
- `measureRender(label)` - performance.mark/measure wrapper

Create `frontend/src/lib/performance/cache-headers.ts`:
- SWR configuration presets as typed objects:
  - `MARKET_DATA_SWR`: revalidateOnFocus=true, refreshInterval=60000 (real-time market data)
  - `STATIC_DATA_SWR`: revalidateOnFocus=false, dedupingInterval=600000 (stock metadata, sectors)
  - `USER_DATA_SWR`: revalidateOnFocus=true, refreshInterval=0 (watchlists, settings)

**TASK 5 - CDN Preparation**

Create `frontend/src/config/cdn.ts`:
- CDN configuration object: assetPrefix, static file cache headers
- Export helpers for building CDN-prefixed URLs

Create `frontend/next-cdn.config.md`:
- Documentation for CloudFlare/CloudFront CDN setup
- Cache-Control header recommendations per asset type
- Steps to configure assetPrefix in next.config.mjs

### Files Created (all new, no modifications to existing chart components)
1. `frontend/scripts/analyze-bundle.js`
2. `frontend/src/lib/performance/lazy-components.ts`
3. `frontend/src/lib/performance/image-config.ts`
4. `frontend/src/lib/performance/utils.ts`
5. `frontend/src/lib/performance/cache-headers.ts`
6. `frontend/src/components/performance/Skeletons.tsx`
7. `frontend/src/components/performance/OptimizedImage.tsx`
8. `frontend/src/config/cdn.ts`
9. `frontend/next-cdn.config.md`

### Files Modified
1. `frontend/package.json` - add "analyze" script

### Testing
- Run `npx vitest run` to verify no regressions
- All new files are TypeScript with strict mode compliance
- No existing chart components are modified
