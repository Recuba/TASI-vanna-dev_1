'use client';

import { useRef, useEffect, useState, useCallback, FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSSEChat } from '@/lib/use-sse-chat';
import { MessageBubble } from './MessageBubble';
import { LoadingDots } from './LoadingDots';
import { useLanguage } from '@/providers/LanguageProvider';
import type { ChatMessage } from '@/lib/types';

// ---------------------------------------------------------------------------
// Help panel categories (H-16)
// ---------------------------------------------------------------------------

interface HelpCategory {
  titleAr: string;
  titleEn: string;
  icon: string;
  examples: { ar: string; en: string; queryAr: string; queryEn: string }[];
}

const HELP_CATEGORIES: HelpCategory[] = [
  {
    titleAr: 'القيمة',
    titleEn: 'Valuation',
    icon: 'chart-bar',
    examples: [
      { ar: 'أعلى 10 شركات من حيث القيمة السوقية', en: 'Top 10 by market cap', queryAr: 'ما هي أعلى 10 شركات من حيث القيمة السوقية مع القطاع والسعر الحالي؟', queryEn: 'What are the top 10 companies by market cap? Show name, sector, and current price.' },
      { ar: 'مكرر أرباح قطاع البنوك', en: 'Banking P/E ratios', queryAr: 'ما هو مكرر الأرباح والقيمة الدفترية لجميع شركات قطاع البنوك؟', queryEn: 'What is the trailing P/E and price-to-book for all companies in the banking sector?' },
      { ar: 'قارن أرامكو والراجحي', en: 'Compare Aramco vs Rajhi', queryAr: 'قارن بين أرامكو والراجحي من حيث القيمة السوقية ومكرر الأرباح والعائد على حقوق الملكية', queryEn: 'Compare Aramco and Al Rajhi Bank on market cap, P/E ratio, ROE, and profit margin' },
    ],
  },
  {
    titleAr: 'التوزيعات',
    titleEn: 'Dividends',
    icon: 'coins',
    examples: [
      { ar: 'أعلى الأسهم توزيعاً للأرباح', en: 'Top dividend stocks', queryAr: 'ما هي أعلى 10 أسهم من حيث عائد الأرباح الموزعة مع نسبة التوزيع؟', queryEn: 'What are the top 10 stocks by dividend yield? Include payout ratio and dividend rate.' },
      { ar: 'توزيعات البنوك السعودية', en: 'Bank dividends', queryAr: 'أظهر توزيعات الأرباح وعائد التوزيع لجميع البنوك السعودية', queryEn: 'Show dividend rate and yield for all Saudi banks' },
    ],
  },
  {
    titleAr: 'القوائم المالية',
    titleEn: 'Financial Statements',
    icon: 'file-text',
    examples: [
      { ar: 'أرباح البنوك السعودية', en: 'Saudi bank profits', queryAr: 'أظهر صافي الدخل وهامش الربح لجميع البنوك السعودية مرتبة من الأعلى', queryEn: 'Show net income and profit margin for all Saudi banks, ordered by net income descending' },
      { ar: 'إيرادات أرامكو السنوية', en: 'Aramco annual revenue', queryAr: 'أظهر الإيرادات السنوية لأرامكو من قائمة الدخل لجميع الفترات', queryEn: 'Show the annual total revenue for ticker 2222.SR from the income statement across all periods' },
      { ar: 'أعلى 10 شركات نمواً في الأرباح', en: 'Top 10 earnings growth', queryAr: 'ما هي أعلى 10 شركات من حيث نمو الأرباح مع القطاع وهامش الربح؟', queryEn: 'What are the top 10 companies by earnings growth? Include sector and profit margin.' },
    ],
  },
  {
    titleAr: 'تحليل القطاعات',
    titleEn: 'Sector Analysis',
    icon: 'layers',
    examples: [
      { ar: 'القيمة السوقية حسب القطاع', en: 'Market cap by sector', queryAr: 'ما هي القيمة السوقية الإجمالية لكل قطاع مرتبة من الأعلى؟', queryEn: 'What is the total market cap per sector, ordered descending?' },
      { ar: 'أفضل 5 شركات في كل قطاع', en: 'Top 5 per sector', queryAr: 'ما هي أفضل 5 شركات في قطاع البنوك من حيث القيمة السوقية؟', queryEn: 'What are the top 5 companies in the banking sector by market cap?' },
    ],
  },
  {
    titleAr: 'الرسوم البيانية',
    titleEn: 'Charts',
    icon: 'pie-chart',
    examples: [
      { ar: 'رسم بياني للقيمة السوقية', en: 'Market cap chart', queryAr: 'Plot a bar chart of total market cap grouped by sector for all sectors', queryEn: 'Plot a bar chart of total market cap grouped by sector for all sectors' },
      { ar: 'رسم إيرادات أرامكو', en: 'Aramco revenue chart', queryAr: 'Plot the annual total revenue for ticker 2222.SR from the income statement across all periods', queryEn: 'Plot the annual total revenue for ticker 2222.SR from the income statement across all periods' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Conversation history types & helpers (M-27)
// ---------------------------------------------------------------------------

const CONVERSATIONS_KEY = 'rad-ai-conversations';
const ACTIVE_CONV_KEY = 'rad-ai-active-conv';

interface SavedConversation {
  id: string;
  title: string;
  timestamp: string;
  messageCount: number;
}

function getConversationList(): SavedConversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversationList(list: SavedConversation[]) {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

function getActiveConvId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CONV_KEY);
  } catch {
    return null;
  }
}

function setActiveConvId(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_CONV_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_CONV_KEY);
    }
  } catch { /* ignore */ }
}

function getConvStorageKey(id: string) {
  return `rad-ai-conv-${id}`;
}

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

  if (hasTable && followUps.length < 3) {
    if (!hasChart) {
      followUps.push(isAr ? 'أظهر النتائج كرسم بياني' : 'Plot these results as a chart');
    }
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
// Main component
// ---------------------------------------------------------------------------

export function AIChatInterface() {
  const { messages, isLoading, progressText, sendMessage, clearMessages, stopStreaming, retryLast } = useSSEChat();
  const { t, language } = useLanguage();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prefillSentRef = useRef(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  // H-16: Help panel state
  const [helpOpen, setHelpOpen] = useState(false);

  // M-27: Conversation history state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);

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

  // M-27: Save current conversation when messages change (non-streaming)
  useEffect(() => {
    if (messages.length === 0) return;
    if (messages.some((m) => m.isStreaming)) return;

    const activeId = getActiveConvId();
    if (!activeId) {
      // Create new conversation entry
      const newId = `conv-${Date.now()}`;
      setActiveConvId(newId);
      const firstUserMsg = messages.find((m) => m.role === 'user');
      const title = firstUserMsg?.content.slice(0, 60) || 'New conversation';
      const entry: SavedConversation = {
        id: newId,
        title,
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
      };
      const list = getConversationList();
      list.unshift(entry);
      if (list.length > 20) list.length = 20;
      saveConversationList(list);
      setConversations(list);
    } else {
      // Update existing entry
      const list = getConversationList();
      const existing = list.find((c) => c.id === activeId);
      if (existing) {
        existing.messageCount = messages.length;
        existing.timestamp = new Date().toISOString();
        saveConversationList(list);
      }
    }
  }, [messages]);

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
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
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

  // M-27: Load a saved conversation
  const handleLoadConversation = useCallback((convId: string) => {
    const storageKey = getConvStorageKey(convId);
    try {
      // Save current conversation first if there are messages
      const currentId = getActiveConvId();
      if (currentId && messages.length > 0 && !messages.some((m) => m.isStreaming)) {
        const currentData = localStorage.getItem('rad-ai-chat-messages');
        if (currentData) {
          localStorage.setItem(getConvStorageKey(currentId), currentData);
        }
      }

      // Load the selected conversation
      const data = localStorage.getItem(storageKey);
      if (data) {
        localStorage.setItem('rad-ai-chat-messages', data);
        setActiveConvId(convId);
        window.location.reload();
      }
    } catch { /* ignore */ }
    setHistoryOpen(false);
  }, [messages]);

  // M-27: Delete a conversation
  const handleDeleteConversation = useCallback((convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const list = getConversationList().filter((c) => c.id !== convId);
    saveConversationList(list);
    setConversations(list);
    try {
      localStorage.removeItem(getConvStorageKey(convId));
    } catch { /* ignore */ }
    if (getActiveConvId() === convId) {
      setActiveConvId(null);
    }
  }, []);

  // M-27: Start new conversation
  const handleNewConversation = useCallback(() => {
    const currentId = getActiveConvId();
    if (currentId && messages.length > 0) {
      try {
        const currentData = localStorage.getItem('rad-ai-chat-messages');
        if (currentData) {
          localStorage.setItem(getConvStorageKey(currentId), currentData);
        }
      } catch { /* ignore */ }
    }
    setActiveConvId(null);
    clearMessages();
    setHistoryOpen(false);
  }, [messages, clearMessages]);

  // Load conversation list when history panel opens
  useEffect(() => {
    if (historyOpen) {
      setConversations(getConversationList());
    }
  }, [historyOpen]);

  const hasMessages = messages.length > 0;
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const followUps = !isLoading ? getFollowUpSuggestions(lastAssistant, language) : [];

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
              onClick={() => setHistoryOpen((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors',
                historyOpen
                  ? 'text-gold bg-gold/10'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
              )}
              title={t('سجل المحادثات', 'Chat History')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
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

      {/* M-27: Conversation history dropdown */}
      {historyOpen && (
        <div className="border-b gold-border bg-[var(--bg-card)] px-4 py-3 max-h-[300px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
              {t('المحادثات السابقة', 'Past Conversations')}
            </h3>
            <button
              onClick={handleNewConversation}
              className="text-xs text-gold hover:text-gold-light transition-colors flex items-center gap-1"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('محادثة جديدة', 'New Chat')}
            </button>
          </div>
          {conversations.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-4 text-center">
              {t('لا توجد محادثات سابقة', 'No past conversations')}
            </p>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleLoadConversation(conv.id)}
                  className={cn(
                    'flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer',
                    'hover:bg-[var(--bg-input)] transition-colors group/conv',
                    getActiveConvId() === conv.id && 'bg-gold/10 border border-gold/20'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">{conv.title}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {new Date(conv.timestamp).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' '}&middot;{' '}{conv.messageCount} {t('رسائل', 'messages')}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    className="opacity-0 group-hover/conv:opacity-100 p-1 rounded text-[var(--text-muted)] hover:text-accent-red transition-all"
                    title={t('حذف', 'Delete')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
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
            {/* Logo / avatar */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-gold-gradient flex items-center justify-center gold-glow">
                <span className="text-2xl font-bold text-[#0E0E0E]">RA</span>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold gold-text mb-2">
                  {t('مرحبا بك في رعد', 'Welcome to Ra\'d')}
                </h2>
                <p className="text-sm text-[var(--text-secondary)] max-w-md">
                  {t('مساعدك الذكي لتحليل سوق الأسهم السعودي. اسأل عن أي سهم أو قطاع أو مؤشر.', 'Your AI assistant for Saudi stock market analysis. Ask about any stock, sector, or index.')}
                </p>
              </div>
            </div>

            {/* H-16: "What can I ask?" collapsible help panel */}
            <div className="w-full max-w-2xl">
              <button
                onClick={() => setHelpOpen((v) => !v)}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl',
                  'text-sm font-medium transition-all duration-200',
                  helpOpen
                    ? 'text-gold bg-gold/10 border border-gold/20'
                    : 'text-[var(--text-secondary)] hover:text-gold bg-[var(--bg-card)] border gold-border hover:border-gold/40'
                )}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {t('ماذا يمكنني أن أسأل؟', 'What can I ask?')}
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={cn('transition-transform duration-200', helpOpen && 'rotate-180')}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {helpOpen && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in-up">
                  {HELP_CATEGORIES.map((cat) => (
                    <div
                      key={cat.titleEn}
                      className="bg-[var(--bg-card)] border gold-border rounded-xl p-3 hover:border-gold/30 transition-colors"
                    >
                      <h3 className="text-xs font-semibold text-gold mb-2 flex items-center gap-1.5">
                        <HelpCategoryIcon name={cat.icon} />
                        {t(cat.titleAr, cat.titleEn)}
                      </h3>
                      <div className="space-y-1.5">
                        {cat.examples.map((ex, i) => (
                          <button
                            key={i}
                            onClick={() => handleSuggestionClick(language === 'ar' ? ex.queryAr : ex.queryEn)}
                            className={cn(
                              'w-full text-start px-2.5 py-1.5 rounded-lg text-xs',
                              'text-[var(--text-secondary)]',
                              'hover:bg-gold/10 hover:text-[var(--text-primary)]',
                              'transition-colors duration-150'
                            )}
                          >
                            {t(ex.ar, ex.en)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="space-y-4 max-w-4xl mx-auto" role="log" aria-live="polite">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onRetry={msg.isError ? retryLast : undefined}
                progressText={msg.isStreaming ? progressText : undefined}
              />
            ))}

            {/* Follow-up suggestions */}
            {followUps.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-start pe-11 animate-fade-in-up">
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
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t('اسأل عن الأسهم السعودية...', 'Ask about Saudi stocks...')}
              disabled={isLoading}
              rows={1}
              className={cn(
                'w-full resize-none overflow-hidden',
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
                'disabled:opacity-50 disabled:cursor-not-allowed',
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

        {/* Loading indicator with live progress */}
        {isLoading && (
          <div className="max-w-4xl mx-auto mt-2 flex justify-center items-center">
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <LoadingDots />
              <span className="animate-fade-in">
                {progressText || t('جاري التفكير...', 'Thinking...')}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Help category icon component
// ---------------------------------------------------------------------------

function HelpCategoryIcon({ name }: { name: string }) {
  const props = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (name) {
    case 'chart-bar':
      return <svg {...props}><rect x="3" y="12" width="4" height="9" /><rect x="10" y="7" width="4" height="14" /><rect x="17" y="3" width="4" height="18" /></svg>;
    case 'coins':
      return <svg {...props}><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><line x1="7" y1="6" x2="7.01" y2="6" /><line x1="9" y1="10" x2="9.01" y2="10" /></svg>;
    case 'file-text':
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case 'layers':
      return <svg {...props}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>;
    case 'pie-chart':
      return <svg {...props}><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>;
    default:
      return null;
  }
}
