import { act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGrad = {
  addColorStop: vi.fn(),
};
const mockCtx = {
  fillRect: vi.fn(),
  fillText: vi.fn(),
  drawImage: vi.fn(),
  createLinearGradient: vi.fn().mockReturnValue(mockGrad),
  fillStyle: '',
  font: '',
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  stroke: vi.fn(),
};
const mockCanvas = {
  getContext: vi.fn().mockReturnValue(mockCtx),
  toDataURL: vi.fn().mockReturnValue('data:image/png;base64,fake'),
  width: 0,
  height: 0,
};

const origCreateElement = document.createElement.bind(document);
vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
  if (tag === 'canvas') return mockCanvas as unknown as HTMLElement;
  return origCreateElement(tag);
});

import { useBrowserStore } from '../../store/browserStore';

beforeEach(() => {
  vi.useFakeTimers();
  useBrowserStore.setState({
    pages: [],
    currentUrl: '',
    screenshot: null,
    domTree: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('browserStore', () => {
  it('has correct initial state', () => {
    const state = useBrowserStore.getState();
    expect(state.pages).toEqual([]);
    expect(state.currentUrl).toBe('');
    expect(state.screenshot).toBeNull();
    expect(state.domTree).toBeNull();
  });

  it('navigate adds a page and sets currentUrl', () => {
    act(() => {
      useBrowserStore.getState().navigate('https://example.com');
    });
    const state = useBrowserStore.getState();
    expect(state.currentUrl).toBe('https://example.com');
    expect(state.pages).toHaveLength(1);
    expect(state.pages[0].url).toBe('https://example.com');
    expect(state.pages[0].status).toBe('loading');
  });

  it('navigate updates page status to loaded after timeout', () => {
    act(() => {
      useBrowserStore.getState().navigate('https://example.com');
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    const page = useBrowserStore.getState().pages[0];
    expect(page.status).toBe('loaded');
    expect(page.title).toBe('example.com');
  });

  it('navigate does not duplicate pages with the same url', () => {
    act(() => {
      useBrowserStore.getState().navigate('https://example.com');
      useBrowserStore.getState().navigate('https://example.com');
    });
    expect(useBrowserStore.getState().pages).toHaveLength(1);
  });

  it('navigate allows multiple different pages', () => {
    act(() => {
      useBrowserStore.getState().navigate('https://example.com');
      useBrowserStore.getState().navigate('https://other.com');
    });
    expect(useBrowserStore.getState().pages).toHaveLength(2);
    expect(useBrowserStore.getState().currentUrl).toBe('https://other.com');
  });

  it('captureScreenshot creates a screenshot', () => {
    act(() => {
      useBrowserStore.getState().navigate('https://example.com');
    });
    act(() => {
      useBrowserStore.getState().captureScreenshot();
    });
    const state = useBrowserStore.getState();
    expect(state.screenshot).not.toBeNull();
    expect(state.screenshot!.dataUrl).toContain('data:image');
    expect(state.screenshot!.timestamp).toBeGreaterThan(0);
  });

  it('inspectDOM sets a dom tree', () => {
    act(() => {
      useBrowserStore.getState().inspectDOM();
    });
    const state = useBrowserStore.getState();
    expect(state.domTree).not.toBeNull();
    expect(state.domTree!.tag).toBe('html');
    expect(state.domTree!.children).toHaveLength(2);
    expect(state.domTree!.children[0].tag).toBe('head');
    expect(state.domTree!.children[1].tag).toBe('body');
  });
});
