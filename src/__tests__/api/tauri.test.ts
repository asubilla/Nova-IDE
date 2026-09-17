import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { tauriInvoke } from '../../api/tauri';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tauriInvoke', () => {
  it('calls invoke with the command and args', async () => {
    mockInvoke.mockResolvedValue('result');
    const result = await tauriInvoke<string>('read_file', { path: '/tmp/test.txt' });

    expect(mockInvoke).toHaveBeenCalledWith('read_file', { path: '/tmp/test.txt' });
    expect(result).toBe('result');
  });

  it('calls invoke without args when none provided', async () => {
    mockInvoke.mockResolvedValue(42);
    const result = await tauriInvoke<number>('get_count');

    expect(mockInvoke).toHaveBeenCalledWith('get_count', undefined);
    expect(result).toBe(42);
  });

  it('retries once on retryable error', async () => {
    mockInvoke
      .mockRejectedValueOnce({ code: 'INTERNAL_ERROR', message: 'something failed' })
      .mockResolvedValue('recovered');
    const result = await tauriInvoke<string>('read_file');
    expect(result).toBe('recovered');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('throws NovaError on failure', async () => {
    mockInvoke.mockRejectedValue('[AI_PROVIDER_ERROR] API key invalid');

    await expect(tauriInvoke('send_ai_message')).rejects.toThrow('API key invalid');
  });

  it('returns complex data types', async () => {
    const complexData = { files: ['a.ts', 'b.ts'], count: 2 };
    mockInvoke.mockResolvedValue(complexData);

    const result = await tauriInvoke<typeof complexData>('list_files');
    expect(result).toEqual(complexData);
  });
});
