import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Page, Screenshot, DOMNode } from '../types/browser';

interface BrowserState {
  pages: Page[];
  currentUrl: string;
  screenshot: Screenshot | null;
  domTree: DOMNode | null;
  navigate: (url: string) => void;
  captureScreenshot: () => void;
  inspectDOM: () => void;
}

export const useBrowserStore = create<BrowserState>()(
  persist(
    (set, get) => ({
      pages: [],
      currentUrl: '',
      screenshot: null,
      domTree: null,

  navigate: (url: string) => {
    const page: Page = { url, title: url, status: 'loading' };
    set((s) => ({
      pages: [...s.pages.filter((p) => p.url !== url), page],
      currentUrl: url,
    }));
    setTimeout(() => {
      set((s) => ({
        pages: s.pages.map((p) =>
          p.url === url ? { ...p, status: 'loaded', title: new URL(url).hostname } : p
        ),
      }));
    }, 1500);
  },

  captureScreenshot: () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const grad = ctx.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, '#0a0a0f');
    grad.addColorStop(1, '#13141f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#6c5ce7';
    ctx.font = '24px monospace';
    ctx.fillText(get().currentUrl || 'about:blank', 40, 40);
    ctx.fillStyle = '#00d2ff';
    ctx.font = '16px monospace';
    ctx.fillText('Screenshot captured', 40, 70);
    set({ screenshot: { dataUrl: canvas.toDataURL(), timestamp: Date.now() } });
  },

  inspectDOM: () => {
    set({
      domTree: {
        tag: 'html',
        attributes: { lang: 'en' },
        children: [
          {
            tag: 'head',
            attributes: {},
            children: [{ tag: 'title', attributes: {}, children: [] }],
          },
          {
            tag: 'body',
            attributes: {},
            children: [
              { tag: 'header', attributes: {}, children: [] },
              { tag: 'main', attributes: {}, children: [] },
              { tag: 'footer', attributes: {}, children: [] },
            ],
          },
        ],
      },
    });
  },
}),
    {
      name: 'nova-browser-store',
      partialize: (state) => ({
        pages: state.pages,
        currentUrl: state.currentUrl,
      }),
    },
  )
);
