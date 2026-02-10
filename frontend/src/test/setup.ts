import '@testing-library/jest-dom/vitest';

// Mock ResizeObserver (not available in jsdom)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
