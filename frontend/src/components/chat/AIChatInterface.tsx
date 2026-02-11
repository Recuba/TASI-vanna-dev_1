'use client';

import { useRef, useEffect, useState, FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSSEChat } from '@/lib/use-sse-chat';
import { MessageBubble } from './MessageBubble';
import { LoadingDots } from './LoadingDots';
import { useLanguage } from '@/providers/LanguageProvider';
import type { ChatMessage } from '@/lib/types';

const suggestions = [
  { label: 'ما هي أعلى 10 أسهم من حيث القيمة السوقية؟', query: 'ما هي أعلى 10 أسهم من حيث القيمة السوقية؟' },
  { label: 'ما هو سعر سهم أرامكو اليوم؟', query: 'ما هو سعر سهم أرامكو اليوم؟' },
  { label: 'أظهر لي أرباح البنوك السعودية', query: 'أظهر لي أرباح البنوك السعودية' },
  { label: 'ما هي الأسهم التي توزع أعلى أرباح؟', query: 'ما هي الأسهم التي توزع أعلى أرباح؟' },
  { label: 'قارن بين سهم الراجحي وسهم الأهلي', query: 'قارن بين سهم الراجحي وسهم الأهلي' },
  { label: 'ما هو أداء قطاع البتروكيماويات؟', query: 'ما هو أداء قطاع البتروكيماويات؟' },
  { label: 'أظهر رسم بياني لإيرادات أرامكو السنوية', query: 'Plot the annual revenue trend for Saudi Aramco (2222.SR) over all available periods' },
  { label: 'خريطة حرارية لأعلى 15 شركة', query: 'Show a heatmap of ROE, ROA, and profit margin for the top 15 companies by market cap' },
];

/** Follow-up suggestion templates based on response context */
function getFollowUpSuggestions(lastAssistant: ChatMessage | undefined): string[] {
  if (!lastAssistant || !lastAssistant.components || lastAssistant.isStreaming || lastAssistant.isError) return [];

  const hasTable = lastAssistant.components.some((c) => c.type === 'table');
  const hasChart = lastAssistant.components.some((c) => c.type === 'chart');
  const content = lastAssistant.content.toLowerCase();

  const followUps: string[] = [];

  // Stock-related follow-ups
  if (content.includes('أرامكو') || content.includes('aramco') || content.includes('2222')) {
    followUps.push('أظهر الرسم البياني لسهم أرامكو');
    followUps.push('قارن أرامكو مع قطاع الطاقة');
  } else if (content.includes('الراجحي') || content.includes('rajhi') || content.includes('1120')) {
    followUps.push('أظهر الرسم البياني لسهم الراجحي');
    followUps.push('قارن الراجحي مع البنوك الأخرى');
  }

  // Table-related follow-ups
  if (hasTable && followUps.length < 3) {
    followUps.push('رتب النتائج من الأعلى إلى الأدنى');
    if (!hasChart) {
      followUps.push('أظهر النتائج كرسم بياني');
    }
  }

  // Chart-related follow-ups
  if (hasChart && followUps.length < 3) {
    followUps.push('أظهر البيانات كجدول');
  }

  // Financial data follow-ups
  if ((content.includes('ربح') || content.includes('إيراد') || content.includes('revenue') || content.includes('profit')) && followUps.length < 3) {
    followUps.push('أظهر الاتجاه خلال الفترات المتاحة');
    followUps.push('قارن مع الشركات المنافسة');
  }

  // Generic follow-ups if we still have room
  if (followUps.length === 0) {
    followUps.push('أعطني المزيد من التفاصيل');
    followUps.push('ما هي أعلى 5 أسهم أداء اليوم؟');
  }

  return followUps.slice(0, 3);
}

export function AIChatInterface() {
  const { messages, isLoading, sendMessage, clearMessages, stopStreaming, retryLast } = useSSEChat();
  const { t } = useLanguage();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prefillSentRef = useRef(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle ?q= pre-fill from URL
  useEffect(() => {
    if (prefillSentRef.current) return;
    const q = searchParams.get('q');
    if (q && q.trim()) {
      prefillSentRef.current = true;
      sendMessage(q.trim());
      // Remove the param from URL without navigation
      router.replace('/chat', { scroll: false });
    }
  }, [searchParams, sendMessage, router]);

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

  // Get follow-up suggestions from the last assistant message
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const followUps = !isLoading ? getFollowUpSuggestions(lastAssistant) : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header with clear button */}
      {hasMessages && (
        <div className="flex items-center justify-between px-4 py-2 border-b gold-border bg-[var(--bg-card)]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-sm bg-gold-gradient flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#0E0E0E]">RA</span>
            </div>
            <span className="text-sm font-medium text-[var(--text-primary)]">{t('محادثة رائد', 'Ra\'d Chat')}</span>
          </div>
          <button
            onClick={clearMessages}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-accent-red transition-colors px-2 py-1 rounded hover:bg-accent-red/10"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {t('مسح المحادثة', 'Clear Chat')}
          </button>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!hasMessages ? (
          /* Welcome screen */
          <div className="flex flex-col items-center justify-center h-full gap-8 animate-fade-in-up">
            {/* Logo / avatar */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-gold-gradient flex items-center justify-center gold-glow">
                <span className="text-2xl font-bold text-[#0E0E0E]">RA</span>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold gold-text mb-2">
                  {t('مرحبا بك في رائد', 'Welcome to Ra\'d')}
                </h2>
                <p className="text-sm text-[var(--text-secondary)] max-w-md">
                  {t('مساعدك الذكي لتحليل سوق الأسهم السعودي. اسأل عن أي سهم أو قطاع أو مؤشر.', 'Your AI assistant for Saudi stock market analysis. Ask about any stock, sector, or index.')}
                </p>
              </div>
            </div>

            {/* Suggestion chips */}
            <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(s.query)}
                  className={cn(
                    'inline-flex items-center gap-1.5',
                    'bg-[var(--bg-card)] border gold-border',
                    'rounded-pill px-4 py-2',
                    'text-xs font-medium text-[var(--text-secondary)]',
                    'cursor-pointer',
                    'transition-all duration-300',
                    'hover:bg-[var(--bg-card-hover)] hover:border-gold hover:text-[var(--text-primary)]',
                    'hover:-translate-y-0.5 hover:gold-glow-sm'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onRetry={msg.isError ? retryLast : undefined} />
            ))}

            {/* Follow-up suggestions */}
            {followUps.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-start pr-11 animate-fade-in-up">
                {followUps.map((text, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(text)}
                    className={cn(
                      'inline-flex items-center',
                      'bg-gold/10 border border-gold/20',
                      'rounded-full px-3 py-1.5',
                      'text-xs text-[var(--text-secondary)]',
                      'hover:bg-gold/20 hover:text-[var(--text-primary)]',
                      'transition-all duration-200'
                    )}
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}

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
              placeholder={t('اسأل عن الأسهم السعودية...', 'Ask about Saudi stocks...')}
              disabled={isLoading}
              rows={1}
              className={cn(
                'w-full resize-none',
                'bg-[var(--bg-input)] text-[var(--text-primary)]',
                'border gold-border rounded-xl',
                'px-4 py-3 text-sm',
                'placeholder:text-[var(--text-muted)]',
                'focus:outline-none focus:border-gold focus:gold-glow-sm',
                'disabled:opacity-50',
                'transition-all duration-300',
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
                'flex-shrink-0 p-3 rounded-xl',
                'bg-accent-red/20 text-accent-red',
                'hover:bg-accent-red/30',
                'transition-colors'
              )}
              aria-label={t('إيقاف', 'Stop')}
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
                'flex-shrink-0 p-3 rounded-xl',
                'bg-gold text-dark-bg font-medium',
                'hover:bg-gold-light hover:gold-glow-sm',
                'disabled:opacity-30 disabled:cursor-not-allowed',
                'transition-all duration-300'
              )}
              aria-label={t('إرسال', 'Send')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </form>

        {/* Loading indicator */}
        {isLoading && (
          <div className="max-w-4xl mx-auto mt-2 flex justify-center items-center">
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <LoadingDots />
              <span>{t('جاري التفكير...', 'Thinking...')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
