'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { SOURCE_FILTERS } from '../utils';
import { SearchInput } from './SearchInput';

export interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeSource: string | null;
  showSaved: boolean;
  isSearching: boolean;
  bookmarkCount: number;
  sourceCounts: Record<string, number>;
  showAdvancedFilters: boolean;
  advancedFilterCount: number;
  activeSentiment: string | null;
  dateFrom: string;
  dateTo: string;
  isSticky: boolean;
  onSourceChange: (source: string | null) => void;
  onShowSaved: () => void;
  onToggleAdvancedFilters: () => void;
  onSentimentChange: (sentiment: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClearAdvancedFilters: () => void;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  activeSource,
  showSaved,
  isSearching,
  bookmarkCount,
  sourceCounts,
  showAdvancedFilters,
  advancedFilterCount,
  activeSentiment,
  dateFrom,
  dateTo,
  isSticky,
  onSourceChange,
  onShowSaved,
  onToggleAdvancedFilters,
  onSentimentChange,
  onDateFromChange,
  onDateToChange,
  onClearAdvancedFilters,
}: FilterBarProps) {
  const { t } = useLanguage();

  return (
    <div
      className={cn(
        'sticky top-0 z-20 space-y-3 pb-3 -mx-4 sm:-mx-6 px-4 sm:px-6 transition-shadow duration-200',
        isSticky && 'pt-3 bg-[#0E0E0E]/95 backdrop-blur-sm shadow-md shadow-black/30 border-b border-[#D4A84B]/10',
      )}
    >
      {/* Search input */}
      <SearchInput value={searchQuery} onChange={onSearchChange} placeholder={t('ابحث في الأخبار...', 'Search news...')} />

      {/* Source filter chips + saved tab */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        role="group"
        aria-label={t('تصفية المصادر', 'Filter by source')}
      >
        {SOURCE_FILTERS.map((source) => {
          const isActive = !showSaved && !isSearching && activeSource === source.key;
          const count = source.key ? sourceCounts[source.key] : undefined;
          return (
            <button
              key={source.label}
              onClick={() => {
                onSearchChange('');
                onSourceChange(source.key);
              }}
              aria-pressed={isActive}
              className={cn(
                'px-3.5 py-2 min-h-[44px] rounded-full text-xs font-medium snap-start shrink-0',
                'border transition-all duration-200 active:scale-95',
                'focus-visible:ring-2 focus-visible:ring-[#D4A84B]/40 focus-visible:outline-none',
                isActive && 'scale-[1.02] ring-1 ring-offset-1 ring-offset-[#0E0E0E]',
              )}
              style={
                isActive
                  ? {
                      backgroundColor: `${source.color}20`,
                      borderColor: source.color,
                      color: source.color,
                      ['--tw-ring-color' as string]: `${source.color}60`,
                    }
                  : {
                      backgroundColor: 'var(--bg-input)',
                      borderColor: 'var(--bg-input)',
                      color: 'var(--text-secondary)',
                    }
              }
            >
              {source.label}
              {count !== undefined && (
                <span className="me-1 opacity-60">({count})</span>
              )}
            </button>
          );
        })}

        {/* Saved articles tab */}
        <button
          onClick={onShowSaved}
          aria-pressed={showSaved}
          className={cn(
            'px-3.5 py-2 min-h-[44px] rounded-full text-xs font-medium snap-start shrink-0',
            'border transition-all duration-200 active:scale-95',
            'focus-visible:ring-2 focus-visible:ring-[#D4A84B]/40 focus-visible:outline-none',
            showSaved && 'scale-[1.02] ring-1 ring-offset-1 ring-offset-[#0E0E0E] ring-[#D4A84B]/60',
          )}
          style={
            showSaved
              ? {
                  backgroundColor: '#D4A84B20',
                  borderColor: '#D4A84B',
                  color: '#D4A84B',
                }
              : {
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--bg-input)',
                  color: 'var(--text-secondary)',
                }
          }
        >
          <svg className="w-3 h-3 inline-block ms-1" viewBox="0 0 24 24" fill={showSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          {t('المحفوظات', 'Saved')}
          {bookmarkCount > 0 && (
            <span className="me-1 opacity-60">({bookmarkCount})</span>
          )}
        </button>

        {/* Advanced filters toggle */}
        <button
          onClick={onToggleAdvancedFilters}
          aria-expanded={showAdvancedFilters}
          aria-controls="advanced-filters-panel"
          className={cn(
            'px-3.5 py-2 min-h-[44px] rounded-full text-xs font-medium snap-start shrink-0',
            'border transition-all duration-200 active:scale-95',
            'flex items-center gap-1',
            'focus-visible:ring-2 focus-visible:ring-[#D4A84B]/40 focus-visible:outline-none',
            (showAdvancedFilters || advancedFilterCount > 0) && 'scale-[1.02] ring-1 ring-offset-1 ring-offset-[#0E0E0E] ring-[#D4A84B]/60',
          )}
          style={
            showAdvancedFilters || advancedFilterCount > 0
              ? {
                  backgroundColor: '#D4A84B20',
                  borderColor: '#D4A84B',
                  color: '#D4A84B',
                }
              : {
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--bg-input)',
                  color: 'var(--text-secondary)',
                }
          }
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          {t('فلاتر متقدمة', 'Advanced Filters')}
          {advancedFilterCount > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#D4A84B] text-[#0E0E0E] text-[13.5px] font-bold">
              {advancedFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Advanced filters panel */}
      <div
        id="advanced-filters-panel"
        className={cn(
          'overflow-hidden transition-all duration-300',
          showAdvancedFilters
            ? 'max-h-48 opacity-100 translate-y-0 ease-out'
            : 'max-h-0 opacity-0 -translate-y-2 ease-in',
        )}
      >
        <div className="rounded-lg border border-[#2A2A2A] bg-[var(--bg-card)] p-4 space-y-3">
          {/* Sentiment chips */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[var(--text-muted)] min-w-[60px]">
              {t('المشاعر', 'Sentiment')}:
            </span>
            {([
              { key: 'إيجابي', label: 'إيجابي', labelEn: 'Positive', activeColor: '#22C55E', bgColor: 'rgba(34,197,94,0.15)' },
              { key: 'سلبي', label: 'سلبي', labelEn: 'Negative', activeColor: '#EF4444', bgColor: 'rgba(239,68,68,0.15)' },
              { key: 'محايد', label: 'محايد', labelEn: 'Neutral', activeColor: '#9CA3AF', bgColor: 'rgba(156,163,175,0.15)' },
            ] as const).map((s) => {
              const isActive = activeSentiment === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => onSentimentChange(s.key)}
                  aria-pressed={isActive}
                  className={cn(
                    'px-3 py-2 min-h-[44px] rounded-full text-xs font-medium',
                    'border transition-all duration-200',
                    'focus-visible:ring-2 focus-visible:ring-[#D4A84B]/40 focus-visible:outline-none',
                  )}
                  style={
                    isActive
                      ? { backgroundColor: s.bgColor, borderColor: s.activeColor, color: s.activeColor }
                      : { backgroundColor: 'var(--bg-input)', borderColor: '#2A2A2A', color: 'var(--text-secondary)' }
                  }
                >
                  {t(s.label, s.labelEn)}
                </button>
              );
            })}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[var(--text-muted)] min-w-[60px]">
              {t('الفترة', 'Period')}:
            </span>
            <div className="flex items-center gap-2">
              <label htmlFor="news-date-from" className="text-xs text-[var(--text-muted)]">{t('من', 'From')}</label>
              <input
                id="news-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                className={cn(
                  'px-2 py-1 rounded text-xs',
                  'bg-[var(--bg-input)] border border-[#2A2A2A]',
                  'text-[var(--text-primary)]',
                  'focus-visible:outline-none focus-visible:border-[#D4A84B]/50 focus-visible:ring-2 focus-visible:ring-[#D4A84B]/40',
                  '[color-scheme:dark]',
                )}
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="news-date-to" className="text-xs text-[var(--text-muted)]">{t('إلى', 'To')}</label>
              <input
                id="news-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                className={cn(
                  'px-2 py-1 rounded text-xs',
                  'bg-[var(--bg-input)] border border-[#2A2A2A]',
                  'text-[var(--text-primary)]',
                  'focus-visible:outline-none focus-visible:border-[#D4A84B]/50 focus-visible:ring-2 focus-visible:ring-[#D4A84B]/40',
                  '[color-scheme:dark]',
                )}
              />
            </div>
          </div>

          {/* Clear filters */}
          {advancedFilterCount > 0 && (
            <div className="flex justify-end">
              <button
                onClick={onClearAdvancedFilters}
                className="text-xs text-gold hover:text-gold-light hover:underline transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[#D4A84B]/40 focus-visible:outline-none rounded py-1"
              >
                {t('مسح الفلاتر', 'Clear filters')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
