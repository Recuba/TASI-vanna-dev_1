import { useState, useEffect, useCallback } from 'react';
import type { ChatMessage } from '@/lib/types';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

export const CONVERSATIONS_KEY = 'rad-ai-conversations';
export const ACTIVE_CONV_KEY = 'rad-ai-active-conv';

export interface SavedConversation {
  id: string;
  title: string;
  timestamp: string;
  messageCount: number;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

export function getConversationList(): SavedConversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveConversationList(list: SavedConversation[]) {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

export function getActiveConvId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CONV_KEY);
  } catch {
    return null;
  }
}

export function setActiveConvId(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_CONV_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_CONV_KEY);
    }
  } catch { /* ignore */ }
}

export function getConvStorageKey(id: string) {
  return `rad-ai-conv-${id}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseConversationHistoryReturn {
  conversations: SavedConversation[];
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  handleLoadConversation: (convId: string) => void;
  handleDeleteConversation: (convId: string, e: React.MouseEvent) => void;
  handleNewConversation: () => void;
}

export function useConversationHistory(
  messages: ChatMessage[],
  clearMessages: () => void,
): UseConversationHistoryReturn {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);

  // Persist current conversation when messages change (non-streaming)
  useEffect(() => {
    if (messages.length === 0) return;
    if (messages.some((m) => m.isStreaming)) return;

    const activeId = getActiveConvId();
    if (!activeId) {
      const newId = `conv-${Date.now()}`;
      setActiveConvId(newId);
      const firstUserMsg = messages.find((m) => m.role === 'user');
      const title = firstUserMsg?.content.slice(0, 60) || 'New conversation';
      const entry: SavedConversation = { id: newId, title, timestamp: new Date().toISOString(), messageCount: messages.length };
      const list = getConversationList();
      list.unshift(entry);
      if (list.length > 20) list.length = 20;
      saveConversationList(list);
      setConversations(list);
    } else {
      const list = getConversationList();
      const existing = list.find((c) => c.id === activeId);
      if (existing) {
        existing.messageCount = messages.length;
        existing.timestamp = new Date().toISOString();
        saveConversationList(list);
      }
    }
  }, [messages]);

  // Load conversation list when history panel opens
  useEffect(() => {
    if (historyOpen) {
      setConversations(getConversationList());
    }
  }, [historyOpen]);

  const handleLoadConversation = useCallback((convId: string) => {
    const storageKey = getConvStorageKey(convId);
    try {
      const currentId = getActiveConvId();
      if (currentId && messages.length > 0 && !messages.some((m) => m.isStreaming)) {
        const currentData = localStorage.getItem('rad-ai-chat-messages');
        if (currentData) localStorage.setItem(getConvStorageKey(currentId), currentData);
      }
      const data = localStorage.getItem(storageKey);
      if (data) {
        localStorage.setItem('rad-ai-chat-messages', data);
        setActiveConvId(convId);
        window.location.reload();
      }
    } catch { /* ignore */ }
    setHistoryOpen(false);
  }, [messages]);

  const handleDeleteConversation = useCallback((convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const list = getConversationList().filter((c) => c.id !== convId);
    saveConversationList(list);
    setConversations(list);
    try { localStorage.removeItem(getConvStorageKey(convId)); } catch { /* ignore */ }
    if (getActiveConvId() === convId) setActiveConvId(null);
  }, []);

  const handleNewConversation = useCallback(() => {
    const currentId = getActiveConvId();
    if (currentId && messages.length > 0) {
      try {
        const currentData = localStorage.getItem('rad-ai-chat-messages');
        if (currentData) localStorage.setItem(getConvStorageKey(currentId), currentData);
      } catch { /* ignore */ }
    }
    setActiveConvId(null);
    clearMessages();
    setHistoryOpen(false);
  }, [messages, clearMessages]);

  return {
    conversations,
    historyOpen,
    setHistoryOpen,
    handleLoadConversation,
    handleDeleteConversation,
    handleNewConversation,
  };
}
