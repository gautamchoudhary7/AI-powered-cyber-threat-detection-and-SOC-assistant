import '@testing-library/jest-dom/vitest';

// jsdom (the fake browser used in tests) has no ResizeObserver, but the chart library needs one.
// Real browsers have it, so this stand-in is for tests only. It never reports a size, so charts draw nothing here.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
