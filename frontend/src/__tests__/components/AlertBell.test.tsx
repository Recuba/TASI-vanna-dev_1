/**
 * Tests for AlertBell component.
 *
 * Covers:
 * - Badge shows newTriggeredCount when > 0
 * - Badge hidden when newTriggeredCount === 0
 * - Badge shows "9+" when count > 9
 * - Dropdown renders on click
 * - markAllSeen called on click when count > 0
 * - Dropdown shows "No alerts created yet" when no alerts
 * - Dropdown shows triggered alerts list
 * - "No alerts triggered currently" shown when active alerts but none triggered
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMarkAllSeen = vi.fn();
const mockUseAlerts = vi.fn();

vi.mock('@/lib/hooks/use-alerts', () => ({
  useAlerts: () => mockUseAlerts(),
}));

vi.mock('@/providers/LanguageProvider', () => ({
  useLanguage: () => ({
    t: (_ar: string, en: string) => en,
    language: 'en',
  }),
}));

// Next.js Link mock
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, className }: { href: string; children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <a href={href} onClick={onClick} className={className}>{children}</a>
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | undefined | false | null)[]) => args.filter(Boolean).join(' '),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { AlertBell } from '@/components/alerts/AlertBell';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAlerts(overrides: Partial<ReturnType<typeof mockUseAlerts>> = {}) {
  return {
    activeAlerts: [],
    triggeredAlerts: [],
    newTriggeredCount: 0,
    markAllSeen: mockMarkAllSeen,
    alerts: [],
    addAlert: vi.fn(),
    removeAlert: vi.fn(),
    toggleAlert: vi.fn(),
    clearAll: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AlertBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAlerts.mockReturnValue(makeAlerts());
  });

  it('renders bell button with aria-label', () => {
    render(<AlertBell />);
    expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
  });

  it('does not show badge when newTriggeredCount is 0', () => {
    mockUseAlerts.mockReturnValue(makeAlerts({ newTriggeredCount: 0 }));
    render(<AlertBell />);
    // badge should not exist
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows badge with count when newTriggeredCount > 0', () => {
    mockUseAlerts.mockReturnValue(makeAlerts({ newTriggeredCount: 3 }));
    render(<AlertBell />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows "9+" badge when newTriggeredCount > 9', () => {
    mockUseAlerts.mockReturnValue(makeAlerts({ newTriggeredCount: 12 }));
    render(<AlertBell />);
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('shows "9" badge when newTriggeredCount === 9', () => {
    mockUseAlerts.mockReturnValue(makeAlerts({ newTriggeredCount: 9 }));
    render(<AlertBell />);
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('opens dropdown on button click', () => {
    render(<AlertBell />);
    expect(screen.queryByText('Price Alerts')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
    expect(screen.getByText('Price Alerts')).toBeInTheDocument();
  });

  it('calls markAllSeen when opening with pending triggers', () => {
    mockUseAlerts.mockReturnValue(makeAlerts({ newTriggeredCount: 2 }));
    render(<AlertBell />);
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
    expect(mockMarkAllSeen).toHaveBeenCalledOnce();
  });

  it('does not call markAllSeen when opening with no pending triggers', () => {
    mockUseAlerts.mockReturnValue(makeAlerts({ newTriggeredCount: 0 }));
    render(<AlertBell />);
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
    expect(mockMarkAllSeen).not.toHaveBeenCalled();
  });

  it('shows "No alerts created yet" when no active alerts', () => {
    mockUseAlerts.mockReturnValue(makeAlerts({ activeAlerts: [], triggeredAlerts: [] }));
    render(<AlertBell />);
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
    expect(screen.getByText('No alerts created yet')).toBeInTheDocument();
  });

  it('shows "No alerts triggered currently" when active but none triggered', () => {
    const activeAlert = { id: '1', ticker: '2222.SR', alert_type: 'price_above' as const, threshold_value: 50, is_active: true, last_triggered_at: null, created_at: '' };
    mockUseAlerts.mockReturnValue(makeAlerts({ activeAlerts: [activeAlert], triggeredAlerts: [] }));
    render(<AlertBell />);
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
    expect(screen.getByText('No alerts triggered currently')).toBeInTheDocument();
  });

  it('shows triggered alert ticker in dropdown', () => {
    const triggered = { id: '1', ticker: '2222.SR', alert_type: 'price_above' as const, threshold_value: 50, is_active: true, last_triggered_at: null, created_at: '' };
    mockUseAlerts.mockReturnValue(makeAlerts({
      activeAlerts: [triggered],
      triggeredAlerts: [triggered],
    }));
    render(<AlertBell />);
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
    expect(screen.getByText('Triggered Alerts')).toBeInTheDocument();
    // Ticker stripped of .SR
    expect(screen.getByText('2222')).toBeInTheDocument();
  });

  it('shows active count in dropdown header', () => {
    const activeAlert = { id: '1', ticker: '2222.SR', alert_type: 'price_above' as const, threshold_value: 50, is_active: true, last_triggered_at: null, created_at: '' };
    mockUseAlerts.mockReturnValue(makeAlerts({ activeAlerts: [activeAlert], triggeredAlerts: [] }));
    render(<AlertBell />);
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
    expect(screen.getByText('(1 active)')).toBeInTheDocument();
  });

  it('shows Manage All Alerts link in dropdown', () => {
    render(<AlertBell />);
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
    const link = screen.getByRole('link', { name: 'Manage All Alerts' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/alerts');
  });

  it('closes dropdown when Manage All Alerts link is clicked', () => {
    render(<AlertBell />);
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));
    expect(screen.getByText('Price Alerts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Manage All Alerts' }));
    expect(screen.queryByText('Price Alerts')).not.toBeInTheDocument();
  });
});
