/**
 * General-purpose performance utilities.
 */

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------

/**
 * Returns a debounced version of `fn` that delays invocation until `ms`
 * milliseconds have elapsed since the last call.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ---------------------------------------------------------------------------
// throttle
// ---------------------------------------------------------------------------

/**
 * Returns a throttled version of `fn` that fires at most once per `ms`
 * milliseconds.
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    }
  };
}

// ---------------------------------------------------------------------------
// prefetchRoute
// ---------------------------------------------------------------------------

/**
 * Programmatically prefetch a Next.js route.
 * Must be called from a client component (requires window).
 */
export function prefetchRoute(path: string): void {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = path;
  document.head.appendChild(link);
}

// ---------------------------------------------------------------------------
// measureRender
// ---------------------------------------------------------------------------

/**
 * Simple performance.mark / performance.measure wrapper.
 * Returns a `stop()` function that ends the measurement and logs the duration.
 *
 * Usage:
 *   const stop = measureRender('MyComponent');
 *   // ... render work ...
 *   stop(); // logs duration
 */
export function measureRender(label: string): () => void {
  const startMark = `${label}-start`;
  const endMark = `${label}-end`;
  const measureName = `${label}-render`;

  if (typeof performance === 'undefined') return () => {};

  performance.mark(startMark);

  return () => {
    performance.mark(endMark);
    try {
      performance.measure(measureName, startMark, endMark);
      const entry = performance.getEntriesByName(measureName).pop();
      if (entry && process.env.NODE_ENV === 'development') {
        console.debug(`[perf] ${label}: ${entry.duration.toFixed(2)}ms`);
      }
    } catch {
      // Ignore if marks were cleared
    } finally {
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(measureName);
    }
  };
}
