import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Storage envelope type
// ---------------------------------------------------------------------------

interface TTLEnvelope<T> {
  value: T;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Pure utility — safe to use outside React (e.g., in getServerSideProps guards)
// ---------------------------------------------------------------------------

/**
 * Reads a TTL-wrapped value from localStorage.
 * Returns `defaultValue` when:
 *   - Running on the server (SSR)
 *   - The key is absent
 *   - The stored JSON is malformed
 *   - The TTL has expired (also removes the key)
 */
export function loadLocalStorageWithTTL<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;

    const parsed: TTLEnvelope<T> = JSON.parse(raw);

    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key);
      return defaultValue;
    }

    return parsed.value;
  } catch {
    // Malformed JSON or other storage errors — treat as missing
    return defaultValue;
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * Stores a value in localStorage with TTL-based expiration.
 *
 * @param key        localStorage key
 * @param defaultValue  Returned when key is absent, expired, or on SSR
 * @param ttlMs      Time-to-live in milliseconds
 * @returns          [value, setValue, clearValue]
 *
 * @example
 * const [recentCharts, setRecentCharts, clearRecentCharts] =
 *   useLocalStorageTTL<string[]>(
 *     'rad-ai-charts-recent',
 *     [],
 *     7 * 24 * 60 * 60 * 1000,  // 7 days
 *   );
 */
export function useLocalStorageTTL<T>(
  key: string,
  defaultValue: T,
  ttlMs: number,
): [T, (val: T) => void, () => void] {
  // Initialise lazily so we only hit localStorage once on mount
  const [value, setValueState] = useState<T>(() =>
    loadLocalStorageWithTTL<T>(key, defaultValue),
  );

  // Sync state when the key changes (e.g., navigating between pages)
  useEffect(() => {
    setValueState(loadLocalStorageWithTTL<T>(key, defaultValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue = useCallback(
    (val: T) => {
      if (typeof window === 'undefined') return;
      try {
        const envelope: TTLEnvelope<T> = {
          value: val,
          expiresAt: Date.now() + ttlMs,
        };
        localStorage.setItem(key, JSON.stringify(envelope));
      } catch {
        // Storage quota exceeded or other write errors — update state only
      }
      setValueState(val);
    },
    [key, ttlMs],
  );

  const clearValue = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore removal errors
    }
    setValueState(defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, clearValue];
}
