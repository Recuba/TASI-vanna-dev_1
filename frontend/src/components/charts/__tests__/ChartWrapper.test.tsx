import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartWrapper } from '../ChartWrapper';

describe('ChartWrapper', () => {
  it('renders title when provided', () => {
    render(
      <ChartWrapper title="TASI Performance" source={null}>
        <div>chart content</div>
      </ChartWrapper>,
    );
    expect(screen.getByText('TASI Performance')).toBeInTheDocument();
  });

  it('renders DataSourceBadge with correct source', () => {
    render(
      <ChartWrapper title="Test" source="real">
        <div>chart content</div>
      </ChartWrapper>,
    );
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <ChartWrapper title="Test" source={null}>
        <div data-testid="child">chart content</div>
      </ChartWrapper>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('chart content')).toBeInTheDocument();
  });

  it('renders mock badge', () => {
    render(
      <ChartWrapper source="mock">
        <div>content</div>
      </ChartWrapper>,
    );
    expect(screen.getByText('SAMPLE')).toBeInTheDocument();
  });

  it('does not render header when no title and no source', () => {
    const { container } = render(
      <ChartWrapper source={null}>
        <div>content only</div>
      </ChartWrapper>,
    );
    // Should not have the header flex row
    expect(container.querySelector('.flex.items-center.justify-between.mb-2')).not.toBeInTheDocument();
    // But children still render
    expect(screen.getByText('content only')).toBeInTheDocument();
  });
});
