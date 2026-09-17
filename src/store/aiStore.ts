import { create } from 'zustand';
import type { Message, Provider, ToolCall } from '../types/ai';

interface AIState {
  messages: Message[];
  currentProvider: Provider | null;
  currentModel: string;
  isLoading: boolean;
  lastError: string | null;
  sendMessage: (content: string) => Promise<void>;
  streamResponse: (content: string) => Promise<void>;
  setProvider: (provider: Provider, modelId: string) => void;
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  updateToolCall: (messageId: string, toolCallId: string, update: Partial<ToolCall>) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useAIStore = create<AIState>((set, get) => ({
  messages: [],
  currentProvider: null,
  currentModel: '',
  isLoading: false,
  lastError: null,

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  clearMessages: () => set({ messages: [], lastError: null }),

  updateToolCall: (messageId, toolCallId, update) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              toolCalls: msg.toolCalls?.map((tc) =>
                tc.id === toolCallId ? { ...tc, ...update } : tc
              ),
            }
          : msg
      ),
    })),

  setProvider: (provider, modelId) =>
    set({ currentProvider: provider, currentModel: modelId }),

  sendMessage: async (content: string) => {
    const state = get();
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    set({ messages: [...state.messages, userMessage], isLoading: true, lastError: null });

    try {
      await get().streamResponse(content);
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      set({ isLoading: false });
    }
  },

  streamResponse: async (content: string) => {
    const state = get();
    if (!state.currentProvider) {
      throw new Error('No provider configured');
    }

    const assistantMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
    };
    set({ messages: [...get().messages, assistantMessage] });

    // Simulated streaming response — replace with real API call
    const simulatedResponse = `I've analyzed your request: "${content}"\n\nHere's what I can help with:\n- Code analysis and suggestions\n- File operations\n- Debugging assistance\n- Architecture recommendations`;

    const words = simulatedResponse.split(' ');
    let accumulated = '';
    for (let i = 0; i < words.length; i++) {
      await new Promise((r) => setTimeout(r, 30));
      accumulated += (i > 0 ? ' ' : '') + words[i];
      set({
        messages: get().messages.map((msg) =>
          msg.id === assistantMessage.id ? { ...msg, content: accumulated } : msg
        ),
      });
    }
  },
}));
