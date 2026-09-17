import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAIStore } from '../../store/aiStore';

beforeEach(() => {
  useAIStore.setState({
    messages: [],
    currentProvider: null,
    currentModel: '',
    isLoading: false,
    lastError: null,
  });
});

describe('aiStore', () => {
  it('has correct initial state', () => {
    const state = useAIStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.currentProvider).toBeNull();
    expect(state.currentModel).toBe('');
    expect(state.isLoading).toBe(false);
    expect(state.lastError).toBeNull();
  });

  it('setProvider updates provider and model', () => {
    const provider = { id: 'openai', name: 'OpenAI', models: ['gpt-4o'] };
    act(() => {
      useAIStore.getState().setProvider(provider, 'gpt-4o');
    });
    const state = useAIStore.getState();
    expect(state.currentProvider).toEqual(provider);
    expect(state.currentModel).toBe('gpt-4o');
  });

  it('addMessage appends a message', () => {
    act(() => {
      useAIStore.getState().addMessage({
        id: 'msg-1',
        role: 'user',
        content: 'Hi',
        timestamp: Date.now(),
      });
    });
    expect(useAIStore.getState().messages).toHaveLength(1);
    expect(useAIStore.getState().messages[0].content).toBe('Hi');
  });

  it('clearMessages resets messages and lastError', () => {
    act(() => {
      useAIStore.getState().addMessage({
        id: 'msg-1',
        role: 'user',
        content: 'Hi',
        timestamp: Date.now(),
      });
    });
    act(() => {
      useAIStore.getState().clearMessages();
    });
    expect(useAIStore.getState().messages).toEqual([]);
    expect(useAIStore.getState().lastError).toBeNull();
  });

  it('sendMessage sets isLoading to true then false', async () => {
    vi.useFakeTimers();
    act(() => {
      useAIStore.getState().setProvider({ id: 'openai', name: 'OpenAI', models: ['gpt-4o'] }, 'gpt-4o');
    });

    const promise = act(async () => {
      useAIStore.getState().sendMessage('Hello');
    });

    expect(useAIStore.getState().isLoading).toBe(true);

    await vi.runAllTimersAsync();
    await promise;

    expect(useAIStore.getState().isLoading).toBe(false);
    expect(useAIStore.getState().messages.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });

  it('updateToolCall updates a specific tool call', () => {
    act(() => {
      useAIStore.getState().addMessage({
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [{ id: 'tc-1', name: 'read_file', args: {}, status: 'pending' }],
      });
    });
    act(() => {
      useAIStore.getState().updateToolCall('msg-1', 'tc-1', { status: 'success', result: 'done' });
    });
    const tc = useAIStore.getState().messages[0].toolCalls![0];
    expect(tc.status).toBe('success');
    expect(tc.result).toBe('done');
  });
});
