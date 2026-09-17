import { tauriInvoke } from './tauri';
import type { Message, Provider } from '../types/ai';

export const aiAPI = {
  sendMessage: (providerId: string, model: string, messages: Message[]) =>
    tauriInvoke<string>('send_ai_message', { providerId, model, messages }),

  listProviders: () =>
    tauriInvoke<Provider[]>('list_providers'),

  saveApiKey: (providerId: string, apiKey: string) =>
    tauriInvoke<void>('save_api_key', { providerId, apiKey }),

  testConnection: (providerId: string) =>
    tauriInvoke<boolean>('test_connection', { providerId }),
};
