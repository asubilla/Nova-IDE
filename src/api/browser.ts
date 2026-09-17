import { tauriInvoke } from './tauri';
import type { Page, DOMNode, ScreenshotResult } from '../types/browser';

export const browserAPI = {
  navigate: (url: string) =>
    tauriInvoke<Page>('browser_navigate', { url }),

  screenshot: () =>
    tauriInvoke<ScreenshotResult>('browser_screenshot'),

  inspect: () =>
    tauriInvoke<DOMNode>('browser_inspect'),

  act: (action: string) =>
    tauriInvoke<string>('browser_act', { action }),
};
