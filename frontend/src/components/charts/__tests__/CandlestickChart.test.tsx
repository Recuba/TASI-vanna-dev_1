import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMockOHLCVData } from '@/test/chart-test-utils';

// Use vi.hoisted so the mock object is available when vi.mock factory runs
const { createChart } = vi.hoisted(() => {
  const seriesStub = {
    setData: vi.fn(),
    update: vi.fn(),
    applyOptions: vi.fn(),
    priceScale: vi.fn().mockReturnValue({ applyOptions: vi.fn() }),
  };

  const chartStub = {
    addCandlestickSeries: vi.fn().mockReturnValue(seriesStub),
    addAreaSeries: vi.fn().mockReturnValue(seriesStub),
    addLineSeries: vi.fn().mockReturnValue(seriesStub),
    addHistogramSeries: vi.fn().mockReturnValue(seriesStub),
    applyOptions: vi.fn(),
    timeScale: vi.fn().mockReturnValue({
      fitContent: vi.fn(),
      applyOptions: vi.fn(),
    }),
    priceScale: vi.fn().mockReturnValue({ applyOptions: vi.fn() }),
    subscribeCrosshairMove: vi.fn(),
    remove: vi.fn(),
    resize: vi.fn(),
  };

  const createChart = vi.fn().mockReturnValue(chartStub);

  return { createChart, chartStub, seriesStub };
});

// Mock lightweight-charts using the hoisted variable
vi.mock('lightweight-charts', () => ({
  createChart,
  ColorType: { Solid: 'Solid', VerticalGradient: 'VerticalGradient' },
  CrosshairMode: { Normal: 0, Magnet: 1 },
}));

// Mock next/dynamic to render the underlying component directly
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    let Component: React.ComponentType<Record<string, unknown>> | null = null;
    const promise = loader();
    promise.then((mod) => {
      const m = mod as { default?: React.ComponentType<Record<string, unknown>> };
      Component = m.default ?? (mod as unknown as React.ComponentType<Record<string, unknown>>);
    });
    return function DynamicWrapper(props: Record<string, unknown>) {
      if (!Component) return null;
      return <Component {...props} />;
    };
  },
}));

// Import the named export (not the dynamic default export) so we test the real component
import { CandlestickChart } from '../CandlestickChart';

describe('CandlestickChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ChartSkeleton when loading=true and no data', () => {
    const { container } = render(
      <CandlestickChart data={[]} loading={true} />,
    );
    // ChartSkeleton renders a shimmer animation container
    const skeleton = container.querySelector('[class*="overflow-hidden"]');
    expect(skeleton).toBeInTheDocument();
    // Should NOT render the toolbar or chart container
    expect(screen.queryByText('MA20')).not.toBeInTheDocument();
  });

  it('renders ChartError when error is provided', () => {
    render(
      <CandlestickChart data={[]} error="Connection failed" />,
    );
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
  });

  it('renders ChartError with Retry button when refetch is provided', () => {
    const refetch = vi.fn();
    render(
      <CandlestickChart data={[]} error="Server error" refetch={refetch} />,
    );
    expect(screen.getByText('Server error')).toBeInTheDocument();
    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeInTheDocument();
  });

  it('renders empty state when data=[] and no error', () => {
    render(<CandlestickChart data={[]} />);
    expect(screen.getByText('No chart data available')).toBeInTheDocument();
  });

  it('renders empty state with ticker name', () => {
    render(<CandlestickChart data={[]} ticker="2222.SR" />);
    expect(screen.getByText('No data available for 2222.SR')).toBeInTheDocument();
  });

  it('renders chart container div when data is present', () => {
    const data = createMockOHLCVData(30);
    const { container } = render(
      <CandlestickChart data={data} ticker="2222.SR" />,
    );
    // Should render the toolbar with MA20, MA50, Vol buttons
    expect(screen.getByText('MA20')).toBeInTheDocument();
    expect(screen.getByText('MA50')).toBeInTheDocument();
    expect(screen.getByText('Vol')).toBeInTheDocument();
    // Should render ticker
    expect(screen.getByText('2222.SR')).toBeInTheDocument();
    // Should have a div with dir="ltr" for the chart wrapper
    const chartWrapper = container.querySelector('[dir="ltr"]');
    expect(chartWrapper).toBeInTheDocument();
  });

  it('does not crash when error is unexpected shape', () => {
    render(
      <CandlestickChart data={[]} error={'Unexpected error object'} />,
    );
    expect(screen.getByText('Unexpected error object')).toBeInTheDocument();
  });

  it('renders time range buttons', () => {
    const data = createMockOHLCVData(30);
    render(<CandlestickChart data={data} />);
    expect(screen.getByText('1W')).toBeInTheDocument();
    expect(screen.getByText('1M')).toBeInTheDocument();
    expect(screen.getByText('3M')).toBeInTheDocument();
    expect(screen.getByText('6M')).toBeInTheDocument();
    expect(screen.getByText('1Y')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
  });
});
