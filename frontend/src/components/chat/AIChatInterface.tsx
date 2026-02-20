'use client';

import { useRef, useEffect, useState, useCallback, FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSSEChat } from '@/lib/use-sse-chat';
import { LoadingDots } from './LoadingDots';
import { HelpPanel } from './HelpPanel';
import { MessageThread } from './MessageThread';
import { useLanguage } from '@/providers/LanguageProvider';
import { useConversationHistory, getActiveConvId, setActiveConvId } from './hooks/useConversationHistory';

export function AIChatInterface() {
  const { messages, isLoading, progressText, sendMessage, clearMessages, stopStreaming, retryLast } = useSSEChat();
  const { t, language } = useLanguage();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prefillSentRef = useRef(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  const {
    conversations,
    historyOpen,
    setHistoryOpen,
    handleLoadConversation,
    handleDeleteConversation,
    handleNewConversation,
  } = useConversationHistory(messages, clearMessages);

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
      router.replace('/chat', { scroll: false });
    }
  }, [searchParams, sendMessage, router]);

  // M-23: Auto-expanding textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  const handleSuggestionClick = useCallback((query: string) => { sendMessage(query); }, [sendMessage]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header with clear button */}
      {hasMessages && (
        <div className="flex items-center justify-between px-4 py-2 border-b gold-border bg-[var(--bg-card)]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-sm bg-gold-gradient flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#0E0E0E]">RA</span>
            </div>
            <span className="text-sm font-medium text-[var(--text-primary)]">{t('محادثة رعد', 'Ra\'d Chat')}</span>
          </div>
          <div className="flex items-center gap-1">
            {/* History toggle */}
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className={cn('flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors', historyOpen ? 'text-gold bg-gold/10' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]')}
              title={t('سجل المحادثات', 'Chat History')}
              aria-label={t('سجل المحادثات', 'Chat History')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
            {/* Clear chat */}
            <button
              onClick={() => { clearMessages(); setActiveConvId(null); }}
              className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-accent-red transition-colors px-2 py-1 rounded hover:bg-accent-red/10"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              {t('مسح المحادثة', 'Clear Chat')}
            </button>
          </div>
        </div>
      )}

      {/* Conversation history dropdown */}
      {historyOpen && (
        <div className="border-b gold-border bg-[var(--bg-card)] px-4 py-3 max-h-[300px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t('المحادثات السابقة', 'Past Conversations')}</h3>
            <button onClick={handleNewConversation} className="text-xs text-gold hover:text-gold-light transition-colors flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {t('محادثة جديدة', 'New Chat')}
            </button>
          </div>
          {conversations.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-4 text-center">{t('لا توجد محادثات سابقة', 'No past conversations')}</p>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <div key={conv.id} role="button" tabIndex={0} onClick={() => handleLoadConversation(conv.id)} onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleLoadConversation(conv.id);
                    }
                  }} className={cn('flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer', 'hover:bg-[var(--bg-input)] transition-colors group/conv', getActiveConvId() === conv.id && 'bg-gold/10 border border-gold/20')}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">{conv.title}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {new Date(conv.timestamp).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {' '}&middot;{' '}{conv.messageCount} {t('رسائل', 'messages')}
                    </p>
                  </div>
                  <button onClick={(e) => handleDeleteConversation(conv.id, e)} className="opacity-0 group-hover/conv:opacity-100 p-1 rounded text-[var(--text-muted)] hover:text-accent-red transition-all" title={t('حذف', 'Delete')} aria-label={t('حذف المحادثة', 'Delete conversation')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!hasMessages ? (
          /* Welcome screen */
          <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in-up">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-gold-gradient flex items-center justify-center gold-glow">
                <span className="text-2xl font-bold text-[#0E0E0E]">RA</span>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold gold-text mb-2">{t('مرحبا بك في رعد', 'Welcome to Ra\'d')}</h2>
                <p className="text-sm text-[var(--text-secondary)] max-w-md">
                  {t('مساعدك الذكي لتحليل سوق الأسهم السعودي. اسأل عن أي سهم أو قطاع أو مؤشر.', 'Your AI assistant for Saudi stock market analysis. Ask about any stock, sector, or index.')}
                </p>
              </div>
            </div>
            <HelpPanel onSuggestionClick={handleSuggestionClick} />
          </div>
        ) : (
          <MessageThread
            messages={messages}
            isLoading={isLoading}
            progressText={progressText}
            onSuggestionClick={handleSuggestionClick}
            onRetryLast={retryLast}
            messagesEndRef={messagesEndRef}
          />
        )}
      </div>

      {/* Input area */}
      <div className="border-t gold-border px-4 py-3 bg-[var(--bg-card)]">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t('اسأل عن الأسهم السعودية...', 'Ask about Saudi stocks...')}
              disabled={isLoading}
              rows={1}
              className={cn('w-full resize-none overflow-hidden', 'bg-[var(--bg-input)] text-[var(--text-primary)]', 'border gold-border rounded-xl', 'px-4 py-3 text-sm', 'placeholder:text-[var(--text-muted)]', 'focus:outline-none focus:border-gold focus:gold-glow-sm', 'disabled:opacity-50', 'transition-all duration-300', 'font-arabic')}
              style={{ maxHeight: '120px' }}
            />
          </div>
          {isLoading ? (
            <button type="button" onClick={stopStreaming} className={cn('flex-shrink-0 p-3 rounded-xl', 'bg-accent-red/20 text-accent-red', 'hover:bg-accent-red/30', 'transition-colors')} aria-label={t('إيقاف', 'Stop')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className={cn('flex-shrink-0 p-3 rounded-xl', 'bg-gold text-dark-bg font-medium', 'hover:bg-gold-light hover:gold-glow-sm', 'disabled:opacity-50 disabled:cursor-not-allowed', 'transition-all duration-300')} aria-label={t('إرسال', 'Send')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </form>
        {isLoading && (
          <div className="max-w-4xl mx-auto mt-2 flex justify-center items-center">
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <LoadingDots />
              <span className="animate-fade-in">{progressText || t('جاري التفكير...', 'Thinking...')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
