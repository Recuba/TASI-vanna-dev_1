import { cn } from '@/lib/utils';

interface TradingViewAttributionProps {
  className?: string;
}

export function TradingViewAttribution({ className }: TradingViewAttributionProps) {
  return (
    <a
      href="https://www.tradingview.com/"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-block text-xs',
        'text-[#B0B0B0] hover:text-gold',
        'transition-colors duration-200',
        className,
      )}
      style={{
        outline: '2px solid transparent',
        outlineOffset: '2px',
        transition: 'color 0.2s, outline-color 0.2s',
      }}
      onFocus={(e) => (e.currentTarget.style.outlineColor = '#D4A84B')}
      onBlur={(e) => (e.currentTarget.style.outlineColor = 'transparent')}
    >
      Charts by TradingView
    </a>
  );
}
