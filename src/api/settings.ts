import { tauriInvoke } from './tauri';

export interface AppSettings {
  theme: 'dark' | 'light';
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  defaultProvider: string;
  defaultModel: string;
  autoSave: boolean;
}

export const settingsAPI = {
  get: () =>
    tauriInvoke<AppSettings>('get_settings'),

  update: (settings: AppSettings) =>
    tauriInvoke<void>('update_settings', { settings }),

  reset: () =>
    tauriInvoke<AppSettings>('reset_settings'),
};
