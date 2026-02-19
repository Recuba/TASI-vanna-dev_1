'use client';

import { cn } from '@/lib/utils';

export type ViewMode = 'chart' | 'table' | 'split';

interface ResultToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onExport?: () => void;
  onFullscreen?: () => void;
  isFullscreen?: boolean;
}

const VIEW_OPTIONS: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: 'chart',
    label: 'Chart',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    ),
  },
  {
    mode: 'table',
    label: 'Table',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    ),
  },
  {
    mode: 'split',
    label: 'Split',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M12 3v18" />
      </svg>
    ),
  },
];

export function ResultToolbar({
  viewMode,
  onViewModeChange,
  onExport,
  onFullscreen,
  isFullscreen,
}: ResultToolbarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-[#2A2A2A] rounded-t-xl border-b border-gold/10">
      {/* View mode toggle */}
      <div className="flex items-center gap-1 bg-[#1A1A1A] rounded-lg p-0.5">
        {VIEW_OPTIONS.map(({ mode, label, icon }) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors',
              viewMode === mode
                ? 'bg-gold/20 text-gold'
                : 'text-[#B0B0B0] hover:text-white hover:bg-white/5',
            )}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {onExport && (
          <button
            onClick={onExport}
            className="p-1.5 rounded text-[#B0B0B0] hover:text-gold hover:bg-gold/10 transition-colors"
            title="Export"
            aria-label="Export data"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        )}
        {onFullscreen && (
          <button
            onClick={onFullscreen}
            className="p-1.5 rounded text-[#B0B0B0] hover:text-gold hover:bg-gold/10 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
