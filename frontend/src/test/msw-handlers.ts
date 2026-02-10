/**
 * MSW (Mock Service Worker) request handlers for integration tests.
 *
 * Provides realistic mock responses for the Ra'd AI backend chart APIs.
 */
import { http, HttpResponse, delay } from 'msw';

// ---------------------------------------------------------------------------
// Realistic mock data
// ---------------------------------------------------------------------------

function generateTasiIndexData(count: number = 20) {
  const data = [];
  const baseDate = new Date('2025-06-01');
  let price = 11800;
  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    const change = (Math.random() - 0.48) * 50;
    const open = price;
    price = Math.max(11000, price + change);
    const close = price;
    data.push({
      time: date.toISOString().split('T')[0],
      open: +open.toFixed(2),
      high: +(Math.max(open, close) + Math.random() * 20).toFixed(2),
      low: +(Math.min(open, close) - Math.random() * 20).toFixed(2),
      close: +close.toFixed(2),
      volume: Math.round(100000 + Math.random() * 5000000),
    });
  }
  return data;
}

function generateOHLCVData(ticker: string, count: number = 30) {
  const data = [];
  const baseDate = new Date('2025-06-01');
  let price = 50 + ticker.charCodeAt(0);
  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    const change = (Math.random() - 0.48) * 2;
    const open = price;
    price = Math.max(10, price + change);
    const close = price;
    data.push({
      time: date.toISOString().split('T')[0],
      open: +open.toFixed(2),
      high: +(Math.max(open, close) + Math.random() * 1).toFixed(2),
      low: +(Math.min(open, close) - Math.random() * 1).toFixed(2),
      close: +close.toFixed(2),
      volume: Math.round(50000 + Math.random() * 2000000),
    });
  }
  return data;
}

// ---------------------------------------------------------------------------
// Success handlers (default)
// ---------------------------------------------------------------------------

export const successHandlers = [
  // TASI index
  http.get('*/api/v1/charts/tasi/index', () => {
    const data = generateTasiIndexData(20);
    return HttpResponse.json({
      data,
      source: 'real',
      last_updated: new Date().toISOString(),
      symbol: '^TASI',
      period: '1y',
      count: data.length,
    });
  }),

  // OHLCV per ticker
  http.get('*/api/v1/charts/:ticker/ohlcv', ({ params }) => {
    const ticker = params.ticker as string;
    const data = generateOHLCVData(ticker, 30);
    return HttpResponse.json({
      data,
      source: 'real',
      last_updated: new Date().toISOString(),
      symbol: ticker,
      period: '1y',
      count: data.length,
    });
  }),

  // Sectors
  http.get('*/api/entities/sectors', () => {
    return HttpResponse.json([
      { sector: 'Banks', company_count: 12 },
      { sector: 'Energy', company_count: 8 },
    ]);
  }),

  // Entities
  http.get('*/api/entities', () => {
    return HttpResponse.json({
      items: [
        {
          ticker: '2222.SR',
          short_name: 'Saudi Aramco',
          sector: 'Energy',
          industry: 'Oil & Gas',
          current_price: 32.5,
          market_cap: 7200000000000,
          change_pct: 1.2,
        },
      ],
      count: 1,
    });
  }),
];

// ---------------------------------------------------------------------------
// Error handlers (override for error scenarios)
// ---------------------------------------------------------------------------

export const errorHandlers = {
  tasiIndex500: http.get('*/api/v1/charts/tasi/index', () => {
    return HttpResponse.json(
      { detail: 'Internal server error' },
      { status: 500 },
    );
  }),

  tasiIndexTimeout: http.get('*/api/v1/charts/tasi/index', async () => {
    await delay(30000);
    return HttpResponse.json({ data: [] });
  }),

  tasiIndexEmpty: http.get('*/api/v1/charts/tasi/index', () => {
    return HttpResponse.json({
      data: [],
      source: 'real',
      last_updated: null,
      symbol: '^TASI',
      period: '1y',
      count: 0,
    });
  }),

  ohlcv404: http.get('*/api/v1/charts/:ticker/ohlcv', () => {
    return HttpResponse.json(
      { detail: 'Ticker not found' },
      { status: 404 },
    );
  }),

  ohlcv500: http.get('*/api/v1/charts/:ticker/ohlcv', () => {
    return HttpResponse.json(
      { detail: 'Internal server error' },
      { status: 500 },
    );
  }),
};

// ---------------------------------------------------------------------------
// Combined default handlers
// ---------------------------------------------------------------------------

export const handlers = [...successHandlers];
