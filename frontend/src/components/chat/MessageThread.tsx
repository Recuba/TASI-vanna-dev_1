'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '@/lib/types';

// ---------------------------------------------------------------------------
// Follow-up suggestion logic
// ---------------------------------------------------------------------------

function getFollowUpSuggestions(lastAssistant: ChatMessage | undefined, language: string): string[] {
  if (!lastAssistant || !lastAssistant.components || lastAssistant.isStreaming || lastAssistant.isError) return [];
  const isAr = language === 'ar';
  const hasTable = lastAssistant.components.some((c) => c.type === 'table');
  const hasChart = lastAssistant.components.some((c) => c.type === 'chart');
  const content = lastAssistant.content.toLowerCase();
  const followUps: string[] = [];

  if (content.includes('أرامكو') || content.includes('aramco') || content.includes('2222')) {
    followUps.push(isAr ? 'ما هي إيرادات أرامكو السنوية؟' : 'What is Aramco annual revenue across all periods?');
    followUps.push(isAr ? 'قارن أرامكو مع سابك من حيث الربحية' : 'Compare Aramco vs SABIC on profitability metrics');
  } else if (content.includes('الراجحي') || content.includes('rajhi') || content.includes('1120')) {
    followUps.push(isAr ? 'ما هو العائد على حقوق ملكية الراجحي؟' : 'What is Al Rajhi ROE and profit margin?');
    followUps.push(isAr ? 'قارن الراجحي مع بنك الأهلي' : 'Compare Al Rajhi with SNB (Al Ahli)');
  }

  if (hasTable && followUps.length < 3 && !hasChart) {
    followUps.push(isAr ? 'أظهر النتائج كرسم بياني' : 'Plot these results as a chart');
  }
  if (hasChart && followUps.length < 3) {
    followUps.push(isAr ? 'أظهر البيانات كجدول' : 'Show the underlying data as a table');
  }
  if ((content.includes('ربح') || content.includes('إيراد') || content.includes('revenue') || content.includes('profit')) && followUps.length < 3) {
    followUps.push(isAr ? 'أظهر الاتجاه خلال الفترات المتاحة' : 'Show the trend over available periods');
  }
  if ((content.includes('sector') || content.includes('قطاع')) && followUps.length < 3) {
    followUps.push(isAr ? 'ما هي أكبر 5 شركات في هذا القطاع؟' : 'What are the top 5 companies in this sector by market cap?');
  }
  if (followUps.length === 0) {
    followUps.push(isAr ? 'ما هي أعلى 5 شركات من حيث العائد على حقوق الملكية؟' : 'What are the top 5 companies by ROE?');
    followUps.push(isAr ? 'أظهر توزيع القيمة السوقية حسب القطاع' : 'Show market cap distribution by sector');
  }

  return followUps.slice(0, 3);
}

// ---------------------------------------------------------------------------
// MessageThread component
// ---------------------------------------------------------------------------

interface MessageThreadProps {
  messages: ChatMessage[];
  isLoading: boolean;
  progressText?: string;
  onSuggestionClick: (query: string) => void;
  onRetryLast: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const MessageThread = memo(function MessageThread({
  messages,
  isLoading,
  progressText,
  onSuggestionClick,
  onRetryLast,
  messagesEndRef,
}: MessageThreadProps) {
  const { language } = useLanguage();
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const followUps = !isLoading ? getFollowUpSuggestions(lastAssistant, language) : [];

  return (
    <div className="space-y-4 max-w-4xl mx-auto" role="log" aria-live="polite">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          onRetry={msg.isError ? onRetryLast : undefined}
          progressText={msg.isStreaming ? progressText : undefined}
        />
      ))}

      {/* Follow-up suggestions */}
      {followUps.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-start pe-11 animate-fade-in-up">
          {followUps.map((text, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(text)}
              className={cn(
                'inline-flex items-center',
                'bg-gold/10 border border-gold/20',
                'rounded-full px-3 py-1.5',
                'text-xs text-[var(--text-secondary)]',
                'hover:bg-gold/20 hover:text-[var(--text-primary)]',
                'transition-all duration-200',
              )}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
});
