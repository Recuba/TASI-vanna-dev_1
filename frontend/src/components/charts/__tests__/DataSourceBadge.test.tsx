import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataSourceBadge } from '../DataSourceBadge';

describe('DataSourceBadge', () => {
  it('renders "LIVE" text for source="real"', () => {
    render(<DataSourceBadge source="real" />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByLabelText('Data source: LIVE')).toBeInTheDocument();
  });

  it('renders "SAMPLE" text for source="mock"', () => {
    render(<DataSourceBadge source="mock" />);
    expect(screen.getByText('SAMPLE')).toBeInTheDocument();
    expect(screen.getByLabelText('Data source: SAMPLE')).toBeInTheDocument();
  });

  it('renders "CACHED" text for source="cached"', () => {
    render(<DataSourceBadge source="cached" />);
    expect(screen.getByText('CACHED')).toBeInTheDocument();
    expect(screen.getByLabelText('Data source: CACHED')).toBeInTheDocument();
  });

  it('renders nothing for source=null', () => {
    const { container } = render(<DataSourceBadge source={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('applies correct color for real source', () => {
    render(<DataSourceBadge source="real" />);
    const badge = screen.getByText('LIVE');
    expect(badge).toHaveStyle({ color: '#4CAF50' });
  });

  it('applies correct color for mock source', () => {
    render(<DataSourceBadge source="mock" />);
    const badge = screen.getByText('SAMPLE');
    expect(badge).toHaveStyle({ color: '#FFA726' });
  });
});
