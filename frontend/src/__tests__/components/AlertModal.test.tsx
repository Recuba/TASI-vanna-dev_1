/**
 * Tests for AlertModal component.
 *
 * Covers:
 * - Returns null when open=false
 * - Renders form when open=true
 * - Pre-fills ticker from defaultTicker (strips .SR)
 * - Shows current price reference text
 * - Appends .SR suffix to ticker on submit
 * - Does not append .SR if already present
 * - Calls onAdd with correct AlertCreate shape
 * - Calls onClose after submit
 * - Calls onClose when Cancel button clicked
 * - Does not call onAdd when ticker is empty
 * - Switches alert type to price_below
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/providers/LanguageProvider', () => ({
  useLanguage: () => ({
    t: (_ar: string, en: string) => en,
    language: 'en',
  }),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | undefined | false | null)[]) => args.filter(Boolean).join(' '),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { AlertModal } from '@/components/alerts/AlertModal';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AlertModal', () => {
  const onClose = vi.fn();
  const onAdd = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open=false', () => {
    const { container } = render(<AlertModal open={false} onClose={onClose} onAdd={onAdd} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the form when open=true', () => {
    render(<AlertModal open={true} onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText('Create Price Alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Alert' })).toBeInTheDocument();
  });

  it('pre-fills ticker without .SR suffix', () => {
    render(<AlertModal open={true} onClose={onClose} onAdd={onAdd} defaultTicker="2222.SR" />);
    const input = screen.getByPlaceholderText('e.g. 2222');
    expect((input as HTMLInputElement).value).toBe('2222');
  });

  it('shows current price reference text', () => {
    render(<AlertModal open={true} onClose={onClose} onAdd={onAdd} currentPrice={35.50} />);
    expect(screen.getByText(/Current price:/)).toBeInTheDocument();
    expect(screen.getByText(/35.50/)).toBeInTheDocument();
  });

  it('calls onAdd with .SR appended to ticker and correct fields', () => {
    render(<AlertModal open={true} onClose={onClose} onAdd={onAdd} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. 2222'), { target: { value: '2222' } });
    // threshold input
    const thresholdInput = screen.getByRole('spinbutton');
    fireEvent.change(thresholdInput, { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Alert' }));

    expect(onAdd).toHaveBeenCalledWith({
      ticker: '2222.SR',
      alert_type: 'price_above',
      threshold_value: 50,
    });
  });

  it('does not duplicate .SR if ticker already ends with .SR', () => {
    render(<AlertModal open={true} onClose={onClose} onAdd={onAdd} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. 2222'), { target: { value: '2222.sr' } });
    const thresholdInput = screen.getByRole('spinbutton');
    fireEvent.change(thresholdInput, { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Alert' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: '2222.SR' }),
    );
  });

  it('calls onClose after successful submit', () => {
    render(<AlertModal open={true} onClose={onClose} onAdd={onAdd} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. 2222'), { target: { value: '2222' } });
    const thresholdInput = screen.getByRole('spinbutton');
    fireEvent.change(thresholdInput, { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Alert' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<AlertModal open={true} onClose={onClose} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('does not call onAdd when ticker is empty', () => {
    render(<AlertModal open={true} onClose={onClose} onAdd={onAdd} />);
    // threshold only
    const thresholdInput = screen.getByRole('spinbutton');
    fireEvent.change(thresholdInput, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Alert' }));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('uses price_above as default alert type', () => {
    render(<AlertModal open={true} onClose={onClose} onAdd={onAdd} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. 2222'), { target: { value: '1010' } });
    const thresholdInput = screen.getByRole('spinbutton');
    fireEvent.change(thresholdInput, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Alert' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ alert_type: 'price_above' }));
  });

  it('switches to price_below when "Price Below" button clicked', () => {
    render(<AlertModal open={true} onClose={onClose} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Price Below' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. 2222'), { target: { value: '1010' } });
    const thresholdInput = screen.getByRole('spinbutton');
    fireEvent.change(thresholdInput, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Alert' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ alert_type: 'price_below' }));
  });
});
