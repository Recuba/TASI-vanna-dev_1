'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/types';
import { AssistantContent } from './AssistantContent';

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [showTime, setShowTime] = useState(false);

  const timeStr = message.timestamp.toLocaleTimeString('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={cn(
        'flex gap-3 w-full animate-fade-in-up',
        isUser ? 'justify-end' : 'justify-start'
      )}
      onMouseEnter={() => setShowTime(true)}
      onMouseLeave={() => setShowTime(false)}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-gold-gradient flex items-center justify-center text-xs font-bold text-[#0E0E0E]">
          RA
        </div>
      )}

      <div className="flex flex-col gap-1 max-w-[85%]">
        <div
          className={cn(
            'rounded-xl px-4 py-3 transition-all duration-200',
            isUser
              ? 'bg-gold/10 border border-gold/20 text-[var(--text-primary)]'
              : message.isError
                ? 'bg-accent-red/5 border border-accent-red/20 text-[var(--text-primary)]'
                : 'bg-[var(--bg-card)] border gold-border text-[var(--text-primary)]'
          )}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
            <AssistantContent message={message} />
          )}
        </div>

        {/* Retry button for error messages */}
        {message.isError && onRetry && (
          <div className="flex justify-center mt-1">
            <button
              onClick={onRetry}
              className={cn(
                'inline-flex items-center gap-1.5',
                'text-xs px-4 py-1.5 rounded-lg',
                'border border-gold/40 text-gold',
                'hover:bg-gold/10 hover:border-gold',
                'transition-all duration-200'
              )}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Timestamp on hover */}
        <div
          className={cn(
            'text-[10px] text-[var(--text-muted)] transition-all duration-200 px-1',
            isUser ? 'text-end' : 'text-start',
            showTime ? 'opacity-100' : 'opacity-0'
          )}
        >
          {timeStr}
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-gold/20 border border-gold/30 flex items-center justify-center text-xs font-medium text-gold">
          أنت
        </div>
      )}
    </div>
  );
}
