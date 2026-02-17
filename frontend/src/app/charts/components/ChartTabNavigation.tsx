'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { TABS, type TabId } from './types';

interface ChartTabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

function ChartTabNavigationInner({ activeTab, onTabChange }: ChartTabNavigationProps) {
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-0 rounded-lg overflow-x-auto dark:bg-[#2A2A2A] bg-gray-100">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'relative px-5 py-2.5 text-sm font-medium transition-colors duration-200 shrink-0 whitespace-nowrap',
            activeTab === tab.id
              ? 'text-gold'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
          )}
        >
          <span className="relative z-10">{t(tab.labelAr, tab.labelEn)}</span>
          {/* Active indicator with transition */}
          <span
            className={cn(
              'absolute bottom-0 left-0 right-0 h-[2px] bg-gold transition-all duration-300',
              activeTab === tab.id ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0',
            )}
          />
        </button>
      ))}
    </div>
  );
}

export const ChartTabNavigation = React.memo(ChartTabNavigationInner);
