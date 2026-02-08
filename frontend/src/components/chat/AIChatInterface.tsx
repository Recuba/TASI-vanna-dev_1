'use client';

import { useRef, useEffect, useState, FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { useSSEChat } from '@/lib/use-sse-chat';
import { MessageBubble } from './MessageBubble';
import { LoadingDots } from './LoadingDots';

const suggestions = [
  { icon: '\u{1F4CA}', label: 'Top 10 by market cap', query: 'Chart the top 10 companies by market cap' },
  { icon: '\u{1F525}', label: 'Profitability heatmap', query: 'Show a heatmap of ROE, ROA, and profit margin for the top 15 companies by market cap' },
  { icon: '\u{1F4C8}', label: 'Aramco revenue trend', query: 'Plot the annual revenue trend for Saudi Aramco (2222.SR) over all available periods' },
  { icon: '\u{1F504}', label: 'Sector valuation', query: 'Compare average P/E ratio, P/B ratio, and dividend yield across all sectors in a chart' },
  { icon: '\u2B50', label: 'Market cap vs P/E', query: 'Show a scatter plot of market cap vs trailing P/E for all companies that have both values' },
  { icon: '\u{1F4B0}', label: 'Dividend yields', query: 'Visualize the distribution of dividend yields across all companies that pay dividends' },
];

export function AIChatInterface() {
  const { messages, isLoading, sendMessage, clearMessages, stopStreaming } = useSSEChat();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSuggestionClick = (query: string) => {
    sendMessage(query);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!hasMessages ? (
          /* Empty state with suggestions */
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="text-center">
              <h3 className="text-xl font-bold gold-text mb-2">
                Ask about Saudi Stocks
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Query TASI data with natural language. Charts, tables, and analysis.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(s.query)}
                  className={cn(
                    'inline-flex items-center gap-1.5',
                    'bg-[var(--bg-card)] border gold-border',
                    'rounded-pill px-3 py-1.5',
                    'text-xs font-medium text-[var(--text-secondary)]',
                    'cursor-pointer whitespace-nowrap',
                    'transition-all duration-300',
                    'hover:bg-[var(--bg-card-hover)] hover:border-gold hover:text-[var(--text-primary)]',
                    'hover:-translate-y-0.5'
                  )}
                >
                  <span>{s.icon}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t gold-border px-4 py-3 bg-[var(--bg-card)]">
        <form
          onSubmit={handleSubmit}
          className="max-w-4xl mx-auto flex items-end gap-2"
        >
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about Saudi stocks..."
              disabled={isLoading}
              rows={1}
              className={cn(
                'w-full resize-none',
                'bg-[var(--bg-input)] text-[var(--text-primary)]',
                'border gold-border rounded-lg',
                'px-4 py-2.5 text-sm',
                'placeholder:text-[var(--text-muted)]',
                'focus:outline-none focus:border-gold',
                'disabled:opacity-50',
                'transition-colors',
                'font-arabic'
              )}
              style={{ maxHeight: '120px' }}
            />
          </div>

          {isLoading ? (
            <button
              type="button"
              onClick={stopStreaming}
              className={cn(
                'flex-shrink-0 p-2.5 rounded-lg',
                'bg-accent-red/20 text-accent-red',
                'hover:bg-accent-red/30',
                'transition-colors'
              )}
              aria-label="Stop streaming"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className={cn(
                'flex-shrink-0 p-2.5 rounded-lg',
                'bg-gold text-dark-bg font-medium',
                'hover:bg-gold-light',
                'disabled:opacity-30 disabled:cursor-not-allowed',
                'transition-colors'
              )}
              aria-label="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </form>

        {/* Controls */}
        {hasMessages && (
          <div className="max-w-4xl mx-auto mt-2 flex justify-between items-center">
            <button
              onClick={clearMessages}
              className="text-xs text-[var(--text-muted)] hover:text-gold transition-colors"
            >
              Clear conversation
            </button>
            {isLoading && (
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <LoadingDots />
                <span>Thinking...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
