'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, SSEEvent } from './types';

const API_BASE = '';
const SSE_ENDPOINT = '/api/vanna/v2/chat_sse';
const STORAGE_KEY = 'raid-chat-messages';
const MAX_STORED_MESSAGES = 100;

/** Serializable version of ChatMessage for localStorage */
interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  components?: SSEEvent[];
  isError?: boolean;
}

function saveMessages(messages: ChatMessage[]) {
  try {
    // Only store completed, non-streaming messages; cap at MAX
    const toStore: StoredMessage[] = messages
      .filter((m) => !m.isStreaming)
      .slice(-MAX_STORED_MESSAGES)
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        components: m.components,
        isError: m.isError,
      }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // localStorage full or unavailable - silently ignore
  }
}

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const stored: StoredMessage[] = JSON.parse(raw);
    return stored.map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
      isStreaming: false,
    }));
  } catch {
    return [];
  }
}

/**
 * Hook that manages the chat conversation with the Vanna SSE backend.
 * Includes localStorage persistence, error recovery, and retry.
 */
export function useSSEChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messageIdRef = useRef(0);
  const initializedRef = useRef(false);

  // Restore messages from localStorage on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const restored = loadMessages();
    if (restored.length > 0) {
      // Update messageIdRef to avoid collisions
      messageIdRef.current = restored.length;
      setMessages(restored);
    }
  }, []);

  // Persist messages whenever they change (skip initial empty + skip while streaming)
  useEffect(() => {
    if (!initializedRef.current) return;
    const hasStreaming = messages.some((m) => m.isStreaming);
    if (!hasStreaming && messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  function nextId(): string {
    return `msg-${++messageIdRef.current}-${Date.now()}`;
  }

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    const assistantId = nextId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      components: [],
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);

    // Abort any previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url = `${API_BASE}${SSE_ENDPOINT}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content.trim() }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const event: SSEEvent = JSON.parse(jsonStr);
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== assistantId) return msg;
                const components = [...(msg.components || []), event];
                // Accumulate text content
                let textContent = msg.content;
                if (event.type === 'text') {
                  textContent += (event.data as { content: string }).content;
                }
                return { ...msg, components, content: textContent };
              })
            );
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      // Add user-friendly Arabic error
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== assistantId) return msg;
          const errorEvent: SSEEvent = {
            type: 'text',
            data: { content: 'حدث خطأ. يرجى المحاولة مرة أخرى' },
          };
          return {
            ...msg,
            components: [...(msg.components || []), errorEvent],
            content: 'حدث خطأ. يرجى المحاولة مرة أخرى',
            isError: true,
          };
        })
      );
    } finally {
      // Mark streaming complete
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, isStreaming: false } : msg
        )
      );
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [isLoading]);

  const clearMessages = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setMessages([]);
    setIsLoading(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsLoading(false);
    setMessages((prev) =>
      prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
    );
  }, []);

  /** Retry the last failed query by re-sending the last user message */
  const retryLast = useCallback(() => {
    // Find the last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    // Remove the last assistant message (the error one)
    setMessages((prev) => {
      const lastAssistantIdx = prev.findLastIndex((m) => m.role === 'assistant');
      if (lastAssistantIdx === -1) return prev;
      return prev.filter((_, i) => i !== lastAssistantIdx);
    });

    // Remove the last user message too since sendMessage will re-add it
    setMessages((prev) => {
      const lastUserIdx = prev.findLastIndex((m) => m.role === 'user');
      if (lastUserIdx === -1) return prev;
      return prev.filter((_, i) => i !== lastUserIdx);
    });

    // Re-send
    // Use setTimeout so state updates flush first
    setTimeout(() => {
      sendMessage(lastUserMsg.content);
    }, 0);
  }, [messages, sendMessage]);

  return { messages, isLoading, sendMessage, clearMessages, stopStreaming, retryLast };
}
