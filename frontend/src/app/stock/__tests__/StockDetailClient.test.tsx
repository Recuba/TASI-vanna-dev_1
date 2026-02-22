/**
 * Tests for StockDetailClient component.
 *
 * The component uses multiple hooks (useStockDetail, useStockFinancials,
 * useStockDividends, useStockFinancialSummary, useNewsByTicker, useReportsByTicker)
 * and several sub-components (CandlestickChart, ChartWrapper, etc.).
 *
 * We mock the hooks via vi.mock() so tests are deterministic and don't
 * depend on MSW or network state. We also mock heavy chart components that
 * rely on canvas / ResizeObserver APIs unavailable in jsdom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock next/navigation so useRouter doesn't crash in jsdom
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

// Mock chart components -- they use canvas APIs unavailable in jsdom
vi.mock('@/components/charts', () => ({
  CandlestickChart: () => <div data-testid="candlestick-chart" />,
  ChartWrapper: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="chart-wrapper">
      {title && <span>{title}</span>}
      {children}
    </div>
  ),
  TradingViewWidget: ({ symbol }: { symbol: string }) => <div data-testid="tradingview-widget">{symbol}</div>,
  TradingViewAttribution: () => <span data-testid="tv-attribution">Charts by TradingView</span>,
  ChartErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock OHLCV chart data hook
vi.mock('@/lib/hooks/use-chart-data', () => ({
  useOHLCVData: () => ({ data: [], loading: false, source: 'mock' }),
}));

// Mock Toast hook
vi.mock('@/components/common/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// Mock Tooltip component
vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock stock translations
vi.mock('@/lib/stock-translations', () => ({
  translateSector: (sector: string) => sector,
}));

// ---------------------------------------------------------------------------
// Mock domain hooks
// ---------------------------------------------------------------------------

import * as useApiModule from '@/lib/hooks/use-api';

// Default mock implementations (will be overridden per test as needed)
const mockUseStockDetail = vi.spyOn(useApiModule, 'useStockDetail');
const mockUseStockFinancials = vi.spyOn(useApiModule, 'useStockFinancials');
const mockUseStockDividends = vi.spyOn(useApiModule, 'useStockDividends');
const mockUseStockFinancialSummary = vi.spyOn(useApiModule, 'useStockFinancialSummary');
const mockUseNewsByTicker = vi.spyOn(useApiModule, 'useNewsByTicker');
const mockUseReportsByTicker = vi.spyOn(useApiModule, 'useReportsByTicker');
const mockUseStockPeers = vi.spyOn(useApiModule, 'useStockPeers');
const mockUseStockOwnership = vi.spyOn(useApiModule, 'useStockOwnership');
const mockUseFinancialTrend = vi.spyOn(useApiModule, 'useFinancialTrend');

// ---------------------------------------------------------------------------
// Sample data fixtures
// ---------------------------------------------------------------------------

const sampleDetail = {
  ticker: '2222.SR',
  short_name: 'Saudi Aramco',
  sector: 'Energy',
  industry: 'Oil & Gas',
  current_price: 30.5,
  previous_close: 30.0,
  day_low: 29.8,
  day_high: 31.0,
  week_52_low: 25.0,
  week_52_high: 35.0,
  volume: 5000000,
  market_cap: 7_200_000_000_000,
  beta: 0.85,
  trailing_pe: 16.2,
  forward_pe: 14.8,
  price_to_book: 3.4,
  trailing_eps: 1.88,
  roe: 0.28,
  profit_margin: 0.24,
  revenue_growth: 0.05,
  recommendation: 'buy',
  target_mean_price: 35.0,
  analyst_count: 15,
  currency: 'SAR',
};

const sampleFinancials = {
  ticker: '2222.SR',
  statement: 'income_statement',
  period_type: 'annual',
  periods: [
    {
      period_index: 0,
      period_date: '2024',
      data: { total_revenue: 500_000_000, net_income: 120_000_000 },
    },
    {
      period_index: 1,
      period_date: '2023',
      data: { total_revenue: 480_000_000, net_income: 110_000_000 },
    },
  ],
};

const sampleDividends = {
  ticker: '2222.SR',
  dividend_rate: 1.84,
  dividend_yield: 0.0604,
  payout_ratio: 0.47,
  five_year_avg_dividend_yield: 4.5,
  ex_dividend_date: '2024-06-10',
  last_dividend_value: 0.46,
  last_dividend_date: '2024-06-15',
  trailing_annual_dividend_rate: 1.84,
  trailing_annual_dividend_yield: 0.0604,
};

const sampleFinancialSummary = {
  ticker: '2222.SR',
  total_revenue: 500_000_000,
  revenue_per_share: 24.5,
  total_cash: 80_000_000,
  total_debt: 120_000_000,
  debt_to_equity: 0.35,
  current_ratio: 1.8,
  quick_ratio: 1.2,
  ebitda: 200_000_000,
  gross_profit: 250_000_000,
  free_cashflow: 75_000_000,
  operating_cashflow: 95_000_000,
};

const sampleNewsData = {
  items: [
    {
      id: 1,
      title: 'Aramco quarterly profits rise',
      source_name: 'العربية',
      published_at: '2024-10-01T10:00:00Z',
      sentiment_label: 'positive',
    },
  ],
  total: 1,
  page: 1,
  page_size: 5,
};

const sampleReportsData = {
  items: [
    {
      id: 1,
      title: 'Aramco 2024 Annual Report',
      summary: 'Strong performance',
      recommendation: 'buy',
      target_price: 35.0,
      author: 'Al Rajhi Capital',
      published_at: '2024-10-01T10:00:00Z',
      source_url: 'https://example.com/report',
    },
  ],
  total: 1,
  page: 1,
  page_size: 5,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAsyncResult<T>(overrides: Partial<{ data: T | null; loading: boolean; error: string | null }> = {}) {
  return {
    data: null as T | null,
    loading: false,
    isRefreshing: false,
    error: null as string | null,
    lastUpdated: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

// Wrap renders in LanguageProvider so useLanguage() works
import { LanguageProvider } from '@/providers/LanguageProvider';

function renderWithProviders(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

// ---------------------------------------------------------------------------
// Import component under test (after mocks are declared)
// ---------------------------------------------------------------------------

import { StockDetailClient } from '../[ticker]/StockDetailClient';

// ---------------------------------------------------------------------------
// beforeEach: set default (success) mock returns for all hooks
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockUseStockDetail.mockReturnValue(makeAsyncResult({ data: sampleDetail }));
  mockUseStockFinancials.mockReturnValue(makeAsyncResult({ data: sampleFinancials }));
  mockUseStockDividends.mockReturnValue(makeAsyncResult({ data: sampleDividends }));
  mockUseStockFinancialSummary.mockReturnValue(makeAsyncResult({ data: sampleFinancialSummary }));
  mockUseNewsByTicker.mockReturnValue(makeAsyncResult({ data: sampleNewsData }));
  mockUseReportsByTicker.mockReturnValue(makeAsyncResult({ data: sampleReportsData }));
  mockUseStockPeers.mockReturnValue(makeAsyncResult({ data: null }));
  mockUseStockOwnership.mockReturnValue(makeAsyncResult({ data: null }));
  mockUseFinancialTrend.mockReturnValue(makeAsyncResult({ data: null }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StockDetailClient', () => {
  // ---- Loading state -------------------------------------------------------

  it('renders loading spinner when stock detail is loading', () => {
    mockUseStockDetail.mockReturnValue(makeAsyncResult({ data: null, loading: true }));

    renderWithProviders(<StockDetailClient ticker="2222" />);

    // LoadingSpinner renders a message containing the ticker
    expect(screen.getByText(/2222\.SR/i)).toBeInTheDocument();
  });

  // ---- Error state ---------------------------------------------------------

  it('renders error display when stock detail returns an error', () => {
    mockUseStockDetail.mockReturnValue(
      makeAsyncResult({ data: null, error: 'Stock not found' }),
    );

    renderWithProviders(<StockDetailClient ticker="2222" />);

    // ErrorDisplay shows "Something went wrong." with a Retry button
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  // ---- Empty / not found state ---------------------------------------------

  it('renders not-available state when detail is null and not loading', () => {
    mockUseStockDetail.mockReturnValue(makeAsyncResult({ data: null }));

    renderWithProviders(<StockDetailClient ticker="2222" />);

    // The component shows the ticker and "Stock data not available"
    expect(screen.getByText('2222.SR')).toBeInTheDocument();
  });

  // ---- Stock header --------------------------------------------------------

  it('renders company name and ticker badge in header', () => {
    renderWithProviders(<StockDetailClient ticker="2222" />);

    // Multiple headings may match (visible + print-only), so use getAllByRole
    const headings = screen.getAllByRole('heading', { name: /Saudi Aramco/i });
    expect(headings.length).toBeGreaterThanOrEqual(1);
    // Ticker appears in the badge next to the name
    const tickerBadges = screen.getAllByText('2222.SR');
    expect(tickerBadges.length).toBeGreaterThanOrEqual(1);
  });

  // ---- Price display -------------------------------------------------------

  it('displays current price and positive change percentage', () => {
    renderWithProviders(<StockDetailClient ticker="2222" />);

    // Price: 30.50 SAR
    expect(screen.getByText(/30\.50/)).toBeInTheDocument();
    // Change: +0.50 (1.67%)
    expect(screen.getByText(/\+0\.50/)).toBeInTheDocument();
    expect(screen.getByText(/1\.67%/)).toBeInTheDocument();
  });

  it('displays negative change with red indicator when price is down', () => {
    mockUseStockDetail.mockReturnValue(
      makeAsyncResult({
        data: {
          ...sampleDetail,
          current_price: 29.0,
          previous_close: 30.0,
        },
      }),
    );

    renderWithProviders(<StockDetailClient ticker="2222" />);

    expect(screen.getByText(/-1\.00/)).toBeInTheDocument();
  });

  // ---- Ticker normalization ------------------------------------------------

  it('normalizes numeric ticker by appending .SR', () => {
    renderWithProviders(<StockDetailClient ticker="2222" />);

    // useStockDetail should be called with "2222.SR"
    expect(mockUseStockDetail).toHaveBeenCalledWith('2222.SR');
  });

  it('does not modify ticker that already has a suffix', () => {
    renderWithProviders(<StockDetailClient ticker="2222.SR" />);

    expect(mockUseStockDetail).toHaveBeenCalledWith('2222.SR');
  });

  // ---- Financial metrics cards ---------------------------------------------

  it('shows financial metric cards in the overview tab', () => {
    renderWithProviders(<StockDetailClient ticker="2222" />);

    // These labels are rendered in English (default language is 'ar' but the
    // LanguageProvider falls back based on stored prefs; we can check for
    // SAR currency label which is always present)
    expect(screen.getByText('SAR')).toBeInTheDocument();
    // Volume card appears in the summary row
    // formatNumber(5_000_000) -> "5.0M"
    expect(screen.getByText('5.0M')).toBeInTheDocument();
  });

  // ---- Tab switching -------------------------------------------------------

  it('switches to Financials tab and shows financial statements section', async () => {
    renderWithProviders(<StockDetailClient ticker="2222" />);

    // Find the "Financials" tab (English label)
    const financialsTab = screen.getByRole('tab', { name: /Financials/i });
    fireEvent.click(financialsTab);

    await waitFor(() => {
      expect(financialsTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('switches to Dividends tab when clicked', async () => {
    renderWithProviders(<StockDetailClient ticker="2222" />);

    const dividendsTab = screen.getByRole('tab', { name: /Dividends/i });
    fireEvent.click(dividendsTab);

    await waitFor(() => {
      expect(dividendsTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('switches to News & Reports tab when clicked', async () => {
    renderWithProviders(<StockDetailClient ticker="2222" />);

    const newsTab = screen.getByRole('tab', { name: /News & Reports/i });
    fireEvent.click(newsTab);

    await waitFor(() => {
      expect(newsTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  // ---- Watchlist toggle ----------------------------------------------------

  it('renders watchlist star button and toggles on click', () => {
    renderWithProviders(<StockDetailClient ticker="2222" />);

    // The button has an aria-label referencing watchlist
    const watchlistBtn = screen.getByRole('button', { name: /watchlist/i });
    expect(watchlistBtn).toBeInTheDocument();

    // Click to add
    fireEvent.click(watchlistBtn);

    // After clicking, aria-label should change to "Remove from watchlist"
    const updatedBtn = screen.getByRole('button', { name: /Remove from watchlist/i });
    expect(updatedBtn).toBeInTheDocument();
  });

  // ---- AI chat CTA ---------------------------------------------------------

  it('renders AI chat call-to-action link with ticker', () => {
    renderWithProviders(<StockDetailClient ticker="2222" />);

    // The CTA link is always visible and references the stock name or ticker
    const ctaLink = screen.getByRole('link', {
      name: (name) => name.includes('Saudi Aramco') || name.includes('2222.SR'),
    });
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink.getAttribute('href')).toContain('/chat');
  });

  // ---- Breadcrumbs ---------------------------------------------------------

  it('renders breadcrumb navigation with Home and Market links', () => {
    renderWithProviders(<StockDetailClient ticker="2222" />);

    expect(screen.getByRole('link', { name: /Home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Market/i })).toHaveAttribute('href', '/market');
  });

  // ---- Analyst recommendation section --------------------------------------

  it('renders analyst consensus section when recommendation is present', () => {
    renderWithProviders(<StockDetailClient ticker="2222" />);

    // "BUY" recommendation label is uppercased in the component
    expect(screen.getByText('BUY')).toBeInTheDocument();
  });

  it('hides analyst consensus section when recommendation is missing', () => {
    mockUseStockDetail.mockReturnValue(
      makeAsyncResult({
        data: { ...sampleDetail, recommendation: undefined },
      }),
    );

    renderWithProviders(<StockDetailClient ticker="2222" />);

    expect(screen.queryByText('BUY')).not.toBeInTheDocument();
  });
});
