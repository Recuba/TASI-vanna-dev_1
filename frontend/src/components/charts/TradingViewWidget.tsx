'use client';

import { useEffect, useRef, memo } from 'react';

export interface TradingViewWidgetProps {
  /** Stock symbol in TradingView format (e.g., "TADAWUL:2222" for Aramco) */
  symbol: string;
  /** Chart interval: "1" | "3" | "5" | "15" | "30" | "60" | "120" | "180" | "240" | "D" | "W" | "M" */
  interval?: string;
  /** Chart theme: "light" | "dark" */
  theme?: 'light' | 'dark';
  /** Chart height in pixels */
  height?: number;
  /** Enable symbol search/change */
  allowSymbolChange?: boolean;
  /** Hide top toolbar */
  hideTopToolbar?: boolean;
  /** Hide side toolbar */
  hideSideToolbar?: boolean;
  /** Hide volume indicator */
  hideVolume?: boolean;
  /** Enable save image button */
  enableSaveImage?: boolean;
  /** Custom container class */
  className?: string;
}

/**
 * TradingView Advanced Chart Widget
 * Free embeddable widget from TradingView with full candlestick charting capabilities.
 * Supports TADAWUL symbols (Saudi Stock Exchange).
 *
 * @see https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/
 */
function TradingViewWidget({
  symbol,
  interval = 'D',
  theme = 'dark',
  height = 600,
  allowSymbolChange = true,
  hideTopToolbar = false,
  hideSideToolbar = false,
  hideVolume = false,
  enableSaveImage = true,
  className = '',
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous content
    container.innerHTML = '';

    // Create widget container div
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    container.appendChild(widgetDiv);

    // Create configuration script
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;

    // Widget configuration
    const config = {
      autosize: true,
      symbol: symbol,
      interval: interval,
      timezone: 'Asia/Riyadh',
      theme: theme,
      style: '1', // Candlestick style
      locale: 'en',
      allow_symbol_change: allowSymbolChange,
      calendar: false,
      hide_top_toolbar: hideTopToolbar,
      hide_side_toolbar: hideSideToolbar,
      hide_volume: hideVolume,
      save_image: enableSaveImage,
      support_host: 'https://www.tradingview.com',
    };

    script.innerHTML = JSON.stringify(config);
    container.appendChild(script);

    scriptLoadedRef.current = true;

    // Cleanup function
    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [
    symbol,
    interval,
    theme,
    allowSymbolChange,
    hideTopToolbar,
    hideSideToolbar,
    hideVolume,
    enableSaveImage,
  ]);

  return (
    <div
      className={`tradingview-widget-container ${className}`}
      ref={containerRef}
      style={{ height: `${height}px`, width: '100%' }}
    />
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(TradingViewWidget);
