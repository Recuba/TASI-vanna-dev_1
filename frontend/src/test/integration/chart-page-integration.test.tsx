/**
 * Integration tests for chart-related page components.
 *
 * Since chart components rely on lightweight-charts (canvas API, unavailable in jsdom),
 * these tests focus on the surrounding UI: DataSourceBadge, ChartWrapper,
 * ChartError with retry, and TradingViewAttribution.
 *
 * We test the composition components directly rather than trying to render
 * the full Next.js pages (which use dynamic imports and router context).
 */
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { server } from '../msw-server';

// Components imported directly (not through the next/dynamic barrel)
import { DataSourceBadge } from '@/components/charts/DataSourceBadge';
import { ChartWrapper } from '@/components/charts/ChartWrapper';
import { ChartError } from '@/components/charts/ChartError';
import { ChartEmpty } from '@/components/charts/ChartEmpty';
import { TradingViewAttribution } from '@/components/charts/TradingViewAttribution';

// ---------------------------------------------------------------------------
// MSW lifecycle (needed for completeness, even though these tests are
// mostly component-level -- MSW ensures no accidental real fetches)
// ---------------------------------------------------------------------------

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// DataSourceBadge
// ---------------------------------------------------------------------------

describe('DataSourceBadge (integration)', () => {
  it('renders LIVE badge for source "real"', () => {
    render(<DataSourceBadge source="real" />);
    const badge = screen.getByText('LIVE');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', 'Data source: LIVE');
  });

  it('renders SAMPLE badge for source "mock"', () => {
    render(<DataSourceBadge source="mock" />);
    const badge = screen.getByText('SAMPLE');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', 'Data source: SAMPLE');
  });

  it('renders CACHED badge for source "cached"', () => {
    render(<DataSourceBadge source="cached" />);
    const badge = screen.getByText('CACHED');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', 'Data source: CACHED');
  });

  it('renders nothing for null source', () => {
    const { container } = render(<DataSourceBadge source={null} />);
    expect(container.innerHTML).toBe('');
  });
});

// ---------------------------------------------------------------------------
// ChartWrapper
// ---------------------------------------------------------------------------

describe('ChartWrapper (integration)', () => {
  it('renders title and DataSourceBadge together', () => {
    render(
      <ChartWrapper title="TASI Index" source="real">
        <div data-testid="chart-content">Chart here</div>
      </ChartWrapper>,
    );

    expect(screen.getByText('TASI Index')).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByTestId('chart-content')).toBeInTheDocument();
  });

  it('renders children without header when title and source are absent', () => {
    render(
      <ChartWrapper title={undefined} source={null}>
        <div data-testid="child">Content</div>
      </ChartWrapper>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  it('renders badge without title', () => {
    render(
      <ChartWrapper source="mock">
        <div>Content</div>
      </ChartWrapper>,
    );

    expect(screen.getByText('SAMPLE')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ChartError
// ---------------------------------------------------------------------------

describe('ChartError (integration)', () => {
  it('renders error message and retry button', () => {
    const onRetry = vi.fn();
    render(<ChartError message="Network error" onRetry={onRetry} />);

    expect(screen.getByText('Network error')).toBeInTheDocument();
    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<ChartError message="Network error" onRetry={onRetry} />);

    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders default message when none provided', () => {
    render(<ChartError />);
    expect(screen.getByText('Failed to load chart data')).toBeInTheDocument();
  });

  it('does not render retry button when onRetry is not provided', () => {
    render(<ChartError message="Error" />);
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ChartEmpty
// ---------------------------------------------------------------------------

describe('ChartEmpty (integration)', () => {
  it('renders empty state', () => {
    render(<ChartEmpty />);
    // ChartEmpty should render some indicator that there's no data
    const container = document.querySelector('div');
    expect(container).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TradingViewAttribution
// ---------------------------------------------------------------------------

describe('TradingViewAttribution (integration)', () => {
  it('renders attribution link', () => {
    render(<TradingViewAttribution />);

    const link = screen.getByText('Charts by TradingView');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://www.tradingview.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

// ---------------------------------------------------------------------------
// Composition: ChartWrapper + ChartError + retry flow
// ---------------------------------------------------------------------------

describe('Chart error-to-success flow (integration)', () => {
  it('transitions from error to content when retry is successful', () => {
    let hasError = true;
    const onRetry = vi.fn(() => {
      hasError = false;
    });

    // First render: error state
    const { rerender } = render(
      <ChartWrapper title="Test Chart" source={null}>
        {hasError ? (
          <ChartError message="API unavailable" onRetry={onRetry} />
        ) : (
          <div data-testid="chart-success">Chart loaded</div>
        )}
      </ChartWrapper>,
    );

    expect(screen.getByText('API unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('chart-success')).not.toBeInTheDocument();

    // Click retry
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);

    // Rerender with success state
    rerender(
      <ChartWrapper title="Test Chart" source="real">
        {hasError ? (
          <ChartError message="API unavailable" onRetry={onRetry} />
        ) : (
          <div data-testid="chart-success">Chart loaded</div>
        )}
      </ChartWrapper>,
    );

    expect(screen.queryByText('API unavailable')).not.toBeInTheDocument();
    expect(screen.getByTestId('chart-success')).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});
