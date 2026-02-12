'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, SSEEvent, Vanna2RawEvent } from './types';

const API_BASE = '';
const SSE_ENDPOINT = '/api/vanna/v2/chat_sse';
const STORAGE_KEY = 'rad-ai-chat-messages';
const MAX_STORED_MESSAGES = 100;

// Migrate old key name
if (typeof window !== 'undefined') {
  const oldVal = localStorage.getItem('raid-chat-messages');
  if (oldVal && !localStorage.getItem('rad-ai-chat-messages')) {
    localStorage.setItem('rad-ai-chat-messages', oldVal);
    localStorage.removeItem('raid-chat-messages');
  }
}

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

// ---------------------------------------------------------------------------
// Vanna 2.0 SSE event normalization
// ---------------------------------------------------------------------------

/**
 * Checks whether a parsed JSON object is a Vanna 2.0 raw event
 * (i.e. has the rich/simple envelope).
 */
function isVanna2RawEvent(obj: unknown): obj is Vanna2RawEvent {
  if (typeof obj !== 'object' || obj === null) return false;
  return 'rich' in obj && typeof (obj as Record<string, unknown>).rich === 'object';
}

/**
 * Checks whether a parsed JSON object already conforms to the normalized
 * SSEEvent shape (has `type` string and `data` object).
 */
function isNormalizedSSEEvent(obj: unknown): obj is SSEEvent {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.type === 'string' && typeof o.data === 'object' && o.data !== null;
}

/**
 * Normalize a raw parsed JSON payload from the Vanna 2.0 backend into the
 * frontend SSEEvent format. Handles three cases:
 *   1. Already in normalized {type, data} format -> pass through.
 *   2. Vanna 2.0 rich/simple envelope -> map rich.type to SSEEvent.
 *   3. Unknown shape -> wrap as text.
 *
 * Returns null if the event should be silently skipped (e.g. UI-only
 * control messages like chat_input_update).
 */
function normalizeSSEEvent(raw: unknown): SSEEvent | null {
  // Case 2: Vanna 2.0 rich/simple envelope
  if (isVanna2RawEvent(raw)) {
    const { rich, simple } = raw;
    const richType = rich?.type ?? '';
    const richData = rich?.data ?? {};
    const simpleText = simple?.text ?? '';

    switch (richType) {
      // Status bar progress updates
      case 'status_bar_update': {
        const message =
          (richData.message as string) ||
          (richData.detail as string) ||
          simpleText ||
          'Processing...';
        // Skip "error" status bar updates that duplicate status_card errors
        // -- they don't carry new info and the status_card handles the error UI
        return { type: 'progress', data: { message } };
      }

      // Task tracker updates (e.g. "Execute run_sql", "Load conversation context")
      case 'task_tracker_update': {
        const operation = richData.operation as string | undefined;
        const task = richData.task as Record<string, unknown> | undefined;
        const detail = richData.detail as string | undefined;
        const status = richData.status as string | undefined;

        // Only show meaningful task updates (new tasks and completions with detail)
        if (operation === 'add_task' && task) {
          const title = (task.title as string) || 'Working...';
          const desc = (task.description as string) || '';
          return { type: 'progress', data: { message: desc || title } };
        }
        if (operation === 'update_task' && status === 'completed' && detail) {
          return { type: 'progress', data: { message: detail } };
        }
        // Skip silent/redundant task tracker updates
        return null;
      }

      // Status cards (info, error, success states)
      case 'status_card': {
        const title = (richData.title as string) || '';
        const description = (richData.description as string) || '';
        const status = richData.status as string | undefined;
        const content = simpleText || description || title || 'Status update';

        // Error status cards -> render as text so the error is visible
        if (status === 'error') {
          return { type: 'text', data: { content } };
        }
        return { type: 'progress', data: { message: content } };
      }

      // Dataframes -> table
      case 'dataframe': {
        const columns = (richData.columns as string[]) || [];
        const data = richData.data as Record<string, unknown>[] | undefined;
        // Convert array-of-objects into array-of-arrays
        const rows: (string | number | null)[][] = (data || []).map((row) =>
          columns.map((col) => {
            const val = row[col];
            if (val === null || val === undefined) return null;
            if (typeof val === 'number' || typeof val === 'string') return val;
            return String(val);
          })
        );
        return { type: 'table', data: { columns, rows } };
      }

      // SQL code blocks
      case 'sql_code':
      case 'sql': {
        const sql =
          (richData.sql as string) ||
          (richData.content as string) ||
          simpleText ||
          '';
        return { type: 'code', data: { language: 'sql', content: sql } };
      }

      // Plotly chart
      case 'plotly_chart':
      case 'chart': {
        const plotlyJson =
          (richData.plotly_json as Record<string, unknown>) ||
          (richData.fig as Record<string, unknown>) ||
          {};
        return { type: 'chart', data: { plotly_json: plotlyJson } };
      }

      // Text / markdown content
      case 'text':
      case 'text_message':
      case 'markdown': {
        const content =
          (richData.content as string) ||
          (richData.text as string) ||
          simpleText ||
          '';
        if (!content) return null;
        return { type: 'text', data: { content } };
      }

      // UI-only control messages that don't produce visible content
      case 'chat_input_update':
        return null;

      // Unknown rich type -> fallback to text using simple text or stringified rich
      default: {
        const fallback = simpleText || JSON.stringify(richData);
        if (!fallback || fallback === '{}') return null;
        return { type: 'text', data: { content: fallback } };
      }
    }
  }

  // Case 1: Already in normalized format
  if (isNormalizedSSEEvent(raw)) {
    return raw;
  }

  // Case 3: Unknown shape -> wrap as text
  if (typeof raw === 'string') {
    return { type: 'text', data: { content: raw } };
  }
  if (typeof raw === 'object' && raw !== null) {
    // Try to extract any text field
    const obj = raw as Record<string, unknown>;
    const text =
      (obj.content as string) ||
      (obj.text as string) ||
      (obj.message as string) ||
      '';
    if (text) {
      return { type: 'text', data: { content: text } };
    }
  }

  return null;
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
            const parsed: unknown = JSON.parse(jsonStr);
            const event = normalizeSSEEvent(parsed);
            // Skip null events (silently ignored control messages)
            if (!event) continue;

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
