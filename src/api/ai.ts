import { tauriInvoke } from './tauri';
import { listen } from '@tauri-apps/api/event';
import type { Message, Provider } from '../types/ai';

export const aiAPI = {
  sendMessage: (providerId: string, model: string, messages: Message[]) =>
    tauriInvoke<string>('send_ai_message', { provider_id: providerId, model, messages }),

  streamMessage: (providerId: string, model: string, messages: Message[]): Promise<void> =>
    tauriInvoke('stream_ai_message', { provider_id: providerId, model, messages }),

  listProviders: () =>
    tauriInvoke<Provider[]>('list_providers'),

  saveApiKey: (providerId: string, apiKey: string) =>
    tauriInvoke<void>('save_api_key', { provider_id: providerId, api_key: apiKey }),

  testConnection: (providerId: string) =>
    tauriInvoke<boolean>('test_connection', { provider_id: providerId }),

  onToken: (callback: (token: string) => void) =>
    listen<string>('ai-token', (event) => callback(event.payload)),

  onStreamComplete: (callback: () => void) =>
    listen<void>('ai-stream-complete', () => callback()),
};
