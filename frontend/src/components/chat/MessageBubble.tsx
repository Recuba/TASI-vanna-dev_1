'use client';

import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/types';
import { AssistantContent } from './AssistantContent';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 w-full',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <div className="w-8 h-8 flex-shrink-0 rounded-sm bg-gold-gradient flex items-center justify-center text-xs font-bold text-dark-bg">
          RA
        </div>
      )}

      <div
        className={cn(
          'max-w-[85%] rounded-lg px-4 py-3',
          isUser
            ? 'bg-gold/10 border border-gold/20 text-[var(--text-primary)]'
            : 'bg-[var(--bg-card)] border gold-border text-[var(--text-primary)]'
        )}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <AssistantContent message={message} />
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-8 h-8 flex-shrink-0 rounded-sm bg-[var(--bg-input)] flex items-center justify-center text-xs font-medium text-[var(--text-muted)]">
          U
        </div>
      )}
    </div>
  );
}
