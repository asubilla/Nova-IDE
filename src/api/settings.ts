import { tauriInvoke } from './tauri';

export interface AppSettings {
  theme: string;
  fontSize: number;
  tabSize: number;
  autoSave: boolean;
  defaultProvider: string;
  defaultModel: string;
  minimap: boolean;
  lineNumbers: boolean;
  wordWrap: boolean;
  fontFamily: string;
}

export const settingsAPI = {
  get: () =>
    tauriInvoke<AppSettings>('get_settings'),

  update: (settings: AppSettings) =>
    tauriInvoke<void>('update_settings', { settings }),

  reset: () =>
    tauriInvoke<AppSettings>('reset_settings'),
};
