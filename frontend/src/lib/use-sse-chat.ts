'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, SSEEvent } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const SSE_ENDPOINT = '/api/vanna/v2/chat_sse';

let messageId = 0;
function nextId(): string {
  return `msg-${++messageId}-${Date.now()}`;
}

/**
 * Hook that manages the chat conversation with the Vanna SSE backend.
 */
export function useSSEChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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
      // Add error as a text component
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== assistantId) return msg;
          const errorEvent: SSEEvent = {
            type: 'text',
            data: { content: `Error: ${(err as Error).message}` },
          };
          return {
            ...msg,
            components: [...(msg.components || []), errorEvent],
            content: `Error: ${(err as Error).message}`,
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

  return { messages, isLoading, sendMessage, clearMessages, stopStreaming };
}
