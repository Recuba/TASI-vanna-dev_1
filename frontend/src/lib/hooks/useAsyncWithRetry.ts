'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAsyncWithRetryOptions {
  maxRetries?: number;
  retryOn?: number[];
}

interface UseAsyncWithRetryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  retriesLeft: number;
}

/**
 * Wraps an async fetcher with automatic retry logic.
 * Retries on network errors (status 0) and 503 by default,
 * with exponential backoff (1s, 2s, 4s).
 */
export function useAsyncWithRetry<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
  options: UseAsyncWithRetryOptions = {},
): UseAsyncWithRetryResult<T> {
  const { maxRetries = 0, retryOn = [0, 503] } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retriesLeft, setRetriesLeft] = useState(maxRetries);

  const controllerRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesLeftRef = useRef(maxRetries);

  const execute = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    retriesLeftRef.current = maxRetries;
    setRetriesLeft(maxRetries);
    setLoading(true);
    setError(null);

    const attempt = () => {
      fetcher(controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            setData(result);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (controller.signal.aborted) return;

          const errMsg = (err as Error).message || String(err);

          // Check if we should retry
          const statusMatch = retryOn.some((code) => {
            if (code === 0) {
              // Network error: fetch failure, no response
              return errMsg.toLowerCase().includes('fetch') ||
                     errMsg.toLowerCase().includes('network') ||
                     errMsg.toLowerCase().includes('failed');
            }
            return errMsg.includes(String(code));
          });

          if (statusMatch && retriesLeftRef.current > 0) {
            const retryIndex = maxRetries - retriesLeftRef.current;
            const delay = Math.pow(2, retryIndex) * 1000; // 1s, 2s, 4s
            retriesLeftRef.current -= 1;
            setRetriesLeft(retriesLeftRef.current);

            retryTimerRef.current = setTimeout(() => {
              if (!controller.signal.aborted) {
                attempt();
              }
            }, delay);
          } else {
            setError(errMsg);
            setLoading(false);
          }
        });
    };

    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    execute();
    return () => {
      controllerRef.current?.abort();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [execute]);

  return { data, loading, error, refetch: execute, retriesLeft };
}
