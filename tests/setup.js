import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/** next-themes (ThemeProvider) wymaga działającego matchMedia */
if (typeof window !== "undefined") {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/**
 * jsdom nie ma ResizeObserver. Recharts (ResponsiveContainer) w callbacku czyta
 * entries[0].contentRect (width/height) — NIGDY nie wołaj callback([]).
 * @see node_modules/recharts/lib/component/ResponsiveContainer.js ~87–91
 */
function makeResizeEntry(target) {
  const contentRect = {
    width: 800,
    height: 400,
    top: 0,
    left: 0,
    bottom: 400,
    right: 800,
    x: 0,
    y: 0,
  };
  return {
    target: target ?? (typeof document !== "undefined" ? document.body : {}),
    contentRect,
    borderBoxSize: [],
    contentBoxSize: [],
    devicePixelContentBoxSize: [],
  };
}

const RO = class ResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    const entries = [makeResizeEntry(target)];
    this.callback(entries, this);
  }
  unobserve() {}
  disconnect() {}
};

globalThis.ResizeObserver = RO;
if (typeof window !== "undefined") {
  window.ResizeObserver = RO;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
