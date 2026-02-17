'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { POPULAR_STOCKS } from './types';

interface PopularStocksProps {
  selectedTicker: string | null;
  onSelect: (ticker: string, name: string) => void;
}

function PopularStocksInner({ selectedTicker, onSelect }: PopularStocksProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {POPULAR_STOCKS.map((stock) => (
        <button
          key={stock.ticker}
          onClick={() => onSelect(stock.ticker, stock.name)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium',
            'border transition-all duration-200',
            selectedTicker === stock.ticker
              ? 'bg-gold/20 border-gold text-gold'
              : 'bg-[var(--bg-input)] border-[var(--bg-input)] text-[var(--text-secondary)] hover:border-gold/40 hover:text-gold',
          )}
        >
          {stock.name}
        </button>
      ))}
    </div>
  );
}

export const PopularStocks = React.memo(PopularStocksInner);
