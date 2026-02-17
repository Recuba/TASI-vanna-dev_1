/**
 * API client module tests: charts, entities, market, health.
 *
 * Uses vi.fn() to mock global fetch and localStorage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock fetch globally before any imports
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockLocalStorage = {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
vi.stubGlobal('localStorage', mockLocalStorage);

// ---------------------------------------------------------------------------
// Helper: create a mock fetch response
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText:
      status === 200
        ? 'OK'
        : status === 404
          ? 'Not Found'
          : status === 500
            ? 'Internal Server Error'
            : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function networkError() {
  return Promise.reject(new TypeError('Failed to fetch'));
}

// ---------------------------------------------------------------------------
// charts module
// ---------------------------------------------------------------------------

describe('charts module: getChartSectorMarketCap', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  const SAMPLE_CHART: unknown = {
    chart_type: 'bar',
    title: 'Sector Market Cap',
    data: [
      { label: 'Energy', value: 7000000000 },
      { label: 'Banking', value: 5000000000 },
    ],
  };

  it('calls correct URL for sector market cap chart', async () => {
    const { getChartSectorMarketCap } = await import('@/lib/api/charts');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_CHART));
    const result = await getChartSectorMarketCap();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/charts/sector-market-cap');
    expect(result.chart_type).toBe('bar');
    expect(result.data).toHaveLength(2);
  });

  it('returns chart data with correct shape', async () => {
    const { getChartSectorMarketCap } = await import('@/lib/api/charts');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_CHART));
    const result = await getChartSectorMarketCap();
    expect(result.title).toBe('Sector Market Cap');
    expect(result.data[0].label).toBe('Energy');
    expect(result.data[0].value).toBe(7000000000);
  });

  it('throws ApiError on server error', async () => {
    const { getChartSectorMarketCap } = await import('@/lib/api/charts');
    const { ApiError } = await import('@/lib/api/client-base');
    mockFetch.mockReturnValue(jsonResponse({ detail: 'Internal error' }, 500));
    await expect(getChartSectorMarketCap()).rejects.toThrow(ApiError);
  });
});

describe('charts module: getChartTopCompanies', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  const SAMPLE_CHART: unknown = {
    chart_type: 'horizontal_bar',
    title: 'Top Companies by Market Cap',
    data: [{ label: 'Aramco', value: 6500000000 }],
  };

  it('calls correct URL for top companies chart', async () => {
    const { getChartTopCompanies } = await import('@/lib/api/charts');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_CHART));
    await getChartTopCompanies();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/charts/top-companies');
  });

  it('appends limit and sector query params when provided', async () => {
    const { getChartTopCompanies } = await import('@/lib/api/charts');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_CHART));
    await getChartTopCompanies({ limit: 5, sector: 'Energy' });
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('limit=5');
    expect(url).toContain('sector=Energy');
  });
});

describe('charts module: getChartSectorPE', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('calls correct URL for sector P/E chart', async () => {
    const { getChartSectorPE } = await import('@/lib/api/charts');
    mockFetch.mockReturnValue(
      jsonResponse({ chart_type: 'bar', title: 'Sector P/E', data: [] }),
    );
    await getChartSectorPE();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/charts/sector-pe');
  });
});

describe('charts module: getChartDividendYieldTop', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('calls correct URL for dividend yield chart', async () => {
    const { getChartDividendYieldTop } = await import('@/lib/api/charts');
    mockFetch.mockReturnValue(
      jsonResponse({ chart_type: 'bar', title: 'Top Dividend Yield', data: [] }),
    );
    await getChartDividendYieldTop();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/charts/dividend-yield-top');
  });

  it('appends limit query param when provided', async () => {
    const { getChartDividendYieldTop } = await import('@/lib/api/charts');
    mockFetch.mockReturnValue(
      jsonResponse({ chart_type: 'bar', title: 'Top Dividend Yield', data: [] }),
    );
    await getChartDividendYieldTop({ limit: 10 });
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('limit=10');
  });
});

// ---------------------------------------------------------------------------
// entities module
// ---------------------------------------------------------------------------

describe('entities module: getEntities', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  const SAMPLE_ENTITIES: unknown = {
    items: [
      {
        ticker: '2222',
        short_name: 'Saudi Aramco',
        sector: 'Energy',
        industry: 'Oil & Gas',
        current_price: 30.5,
        market_cap: 6500000000000,
        change_pct: 1.2,
      },
    ],
    count: 1,
  };

  it('calls correct URL and returns entity list', async () => {
    const { getEntities } = await import('@/lib/api/entities');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_ENTITIES));
    const result = await getEntities();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/entities');
    expect(result.items).toHaveLength(1);
    expect(result.count).toBe(1);
  });

  it('appends query params when provided', async () => {
    const { getEntities } = await import('@/lib/api/entities');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_ENTITIES));
    await getEntities({ limit: 20, offset: 40, sector: 'Energy', search: 'aramco' });
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('limit=20');
    expect(url).toContain('offset=40');
    expect(url).toContain('sector=Energy');
    expect(url).toContain('search=aramco');
  });

  it('handles empty entity list response', async () => {
    const { getEntities } = await import('@/lib/api/entities');
    mockFetch.mockReturnValue(jsonResponse({ items: [], count: 0 }));
    const result = await getEntities({ search: 'nonexistent' });
    expect(result.items).toHaveLength(0);
    expect(result.count).toBe(0);
  });
});

describe('entities module: getEntityDetail', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  const SAMPLE_DETAIL: unknown = {
    ticker: '2222',
    short_name: 'Saudi Aramco',
    sector: 'Energy',
    industry: 'Oil & Gas',
    exchange: 'TADAWUL',
    currency: 'SAR',
    current_price: 30.5,
    previous_close: 30.1,
    day_high: 31.0,
    day_low: 29.8,
    week_52_high: 35.0,
    week_52_low: 26.0,
    volume: 5000000,
    market_cap: 6500000000000,
    beta: 0.9,
    trailing_pe: 12.5,
    forward_pe: 11.0,
    price_to_book: 4.2,
    trailing_eps: 2.44,
    roe: 0.32,
    profit_margin: 0.28,
    revenue_growth: 0.05,
    recommendation: 'buy',
    target_mean_price: 34.5,
    analyst_count: 15,
  };

  it('calls correct URL with ticker', async () => {
    const { getEntityDetail } = await import('@/lib/api/entities');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_DETAIL));
    const result = await getEntityDetail('2222');
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/entities/2222');
    expect(result.ticker).toBe('2222');
    expect(result.short_name).toBe('Saudi Aramco');
  });

  it('URL-encodes special characters in ticker', async () => {
    const { getEntityDetail } = await import('@/lib/api/entities');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_DETAIL));
    await getEntityDetail('1120.SR');
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('1120');
  });

  it('throws ApiError on 404 for unknown entity', async () => {
    const { getEntityDetail } = await import('@/lib/api/entities');
    const { ApiError } = await import('@/lib/api/client-base');
    mockFetch.mockReturnValue(jsonResponse({ detail: 'Not found' }, 404));
    await expect(getEntityDetail('UNKNOWN')).rejects.toThrow(ApiError);
    try {
      await getEntityDetail('UNKNOWN');
    } catch (err) {
      expect((err as InstanceType<typeof ApiError>).status).toBe(404);
    }
  });
});

describe('entities module: getSectors', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('calls correct URL and returns sector list', async () => {
    const { getSectors } = await import('@/lib/api/entities');
    const sectors = [
      { sector: 'Energy', company_count: 10 },
      { sector: 'Banking', company_count: 12 },
    ];
    mockFetch.mockReturnValue(jsonResponse(sectors));
    const result = await getSectors();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/entities/sectors');
    expect(result).toHaveLength(2);
    expect(result[0].sector).toBe('Energy');
  });
});

// ---------------------------------------------------------------------------
// market module
// ---------------------------------------------------------------------------

describe('market module: getMarketSummary', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  const SAMPLE_SUMMARY: unknown = {
    total_market_cap: 10000000000000,
    total_volume: 500000000,
    gainers_count: 120,
    losers_count: 80,
    unchanged_count: 20,
    top_gainers: [
      {
        ticker: '2222',
        company_name_ar: 'أرامكو',
        company_name_en: 'Aramco',
        current_price: 30.5,
        previous_close: 29.0,
        change_pct: 5.17,
        volume: 5000000,
        sector: 'Energy',
      },
    ],
    top_losers: [],
  };

  it('calls correct URL and returns market summary', async () => {
    const { getMarketSummary } = await import('@/lib/api/market');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_SUMMARY));
    const result = await getMarketSummary();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/v1/market/summary');
    expect(result.gainers_count).toBe(120);
    expect(result.top_gainers).toHaveLength(1);
  });

  it('throws ApiError on server error', async () => {
    const { getMarketSummary } = await import('@/lib/api/market');
    const { ApiError } = await import('@/lib/api/client-base');
    mockFetch.mockReturnValue(jsonResponse({ detail: 'Service error' }, 500));
    await expect(getMarketSummary()).rejects.toThrow(ApiError);
  });
});

describe('market module: getMarketMovers', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  const GAINERS: unknown = [
    {
      ticker: '2222',
      company_name_ar: 'أرامكو',
      company_name_en: 'Aramco',
      current_price: 30.5,
      previous_close: 29.0,
      change_pct: 5.17,
      volume: 5000000,
      sector: 'Energy',
    },
  ];

  it('calls correct URL for gainers', async () => {
    const { getMarketMovers } = await import('@/lib/api/market');
    mockFetch.mockReturnValue(jsonResponse(GAINERS));
    const result = await getMarketMovers('gainers');
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/v1/market/movers');
    expect(url).toContain('type=gainers');
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('2222');
  });

  it('calls correct URL for losers', async () => {
    const { getMarketMovers } = await import('@/lib/api/market');
    mockFetch.mockReturnValue(jsonResponse([]));
    await getMarketMovers('losers');
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('type=losers');
  });

  it('appends limit query param when provided', async () => {
    const { getMarketMovers } = await import('@/lib/api/market');
    mockFetch.mockReturnValue(jsonResponse(GAINERS));
    await getMarketMovers('gainers', 5);
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('limit=5');
  });
});

describe('market module: getSectorPerformance', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('calls correct URL and returns sector breakdown', async () => {
    const { getSectorPerformance } = await import('@/lib/api/market');
    const sectors = [
      {
        sector: 'Energy',
        avg_change_pct: 2.1,
        total_volume: 10000000,
        total_market_cap: 7000000000000,
        company_count: 10,
        gainers: 7,
        losers: 3,
      },
    ];
    mockFetch.mockReturnValue(jsonResponse(sectors));
    const result = await getSectorPerformance();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/v1/market/sectors');
    expect(result).toHaveLength(1);
    expect(result[0].sector).toBe('Energy');
  });
});

describe('market module: getMarketHeatmap', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('calls correct URL and returns heatmap data', async () => {
    const { getMarketHeatmap } = await import('@/lib/api/market');
    const heatmap = [
      { ticker: '2222', name: 'Aramco', sector: 'Energy', market_cap: 6500000000000, change_pct: 1.5 },
    ];
    mockFetch.mockReturnValue(jsonResponse(heatmap));
    const result = await getMarketHeatmap();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/v1/market/heatmap');
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('2222');
  });
});

describe('market module: getMarketOverview', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  const SAMPLE_OVERVIEW: unknown = {
    instruments: [
      {
        key: 'BTC',
        ticker: 'BTC-USD',
        nameAr: 'بيتكوين',
        nameEn: 'Bitcoin',
        category: 'crypto',
        value: 95000,
        change: 2.5,
        sparkline: [90000, 92000, 95000],
        historical_closes: [90000, 92000, 95000],
        currency: 'USD',
        error: null,
      },
    ],
    timestamp: '2026-02-18T10:00:00',
    count: 1,
  };

  it('calls correct URL and returns market overview', async () => {
    const { getMarketOverview } = await import('@/lib/api/market');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_OVERVIEW));
    const result = await getMarketOverview();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/api/v1/market-overview');
    expect(result.count).toBe(1);
    expect(result.instruments).toHaveLength(1);
    expect(result.instruments[0].nameEn).toBe('Bitcoin');
  });

  it('throws ApiError on network error', async () => {
    const { getMarketOverview } = await import('@/lib/api/market');
    const { ApiError } = await import('@/lib/api/client-base');
    mockFetch.mockImplementation(networkError);
    await expect(getMarketOverview()).rejects.toThrow(ApiError);
    try {
      await getMarketOverview();
    } catch (err) {
      expect((err as InstanceType<typeof ApiError>).status).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// health module
// ---------------------------------------------------------------------------

describe('health module: getHealth', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  const SAMPLE_HEALTH: unknown = {
    status: 'healthy',
    components: [
      { name: 'database', status: 'healthy', latency_ms: 5, message: 'Connected' },
      { name: 'llm', status: 'healthy', latency_ms: 120, message: 'Available' },
    ],
  };

  it('calls correct URL and returns health status', async () => {
    const { getHealth } = await import('@/lib/api/health');
    mockFetch.mockReturnValue(jsonResponse(SAMPLE_HEALTH));
    const result = await getHealth();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('/health');
    expect(result.status).toBe('healthy');
    expect(result.components).toHaveLength(2);
  });

  it('returns degraded status when a component is unhealthy', async () => {
    const { getHealth } = await import('@/lib/api/health');
    const degraded: unknown = {
      status: 'degraded',
      components: [
        { name: 'database', status: 'healthy', latency_ms: 5, message: 'Connected' },
        { name: 'llm', status: 'unhealthy', latency_ms: null, message: 'Timeout' },
      ],
    };
    mockFetch.mockReturnValue(jsonResponse(degraded));
    const result = await getHealth();
    expect(result.status).toBe('degraded');
    expect(result.components[1].status).toBe('unhealthy');
    expect(result.components[1].latency_ms).toBeNull();
  });

  it('throws ApiError when server is unavailable', async () => {
    const { getHealth } = await import('@/lib/api/health');
    const { ApiError } = await import('@/lib/api/client-base');
    mockFetch.mockImplementation(networkError);
    await expect(getHealth()).rejects.toThrow(ApiError);
    try {
      await getHealth();
    } catch (err) {
      expect((err as InstanceType<typeof ApiError>).status).toBe(0);
      expect((err as InstanceType<typeof ApiError>).statusText).toBe('Network error');
    }
  });

  it('throws ApiError on 500 response', async () => {
    const { getHealth } = await import('@/lib/api/health');
    const { ApiError } = await import('@/lib/api/client-base');
    mockFetch.mockReturnValue(jsonResponse({ detail: 'Server error' }, 500));
    await expect(getHealth()).rejects.toThrow(ApiError);
    try {
      await getHealth();
    } catch (err) {
      expect((err as InstanceType<typeof ApiError>).status).toBe(500);
    }
  });
});
