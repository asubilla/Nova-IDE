import { useAIStore } from '../store/aiStore';

export function useAI() {
  const sendMessage = useAIStore((s) => s.sendMessage);
  const isLoading = useAIStore((s) => s.isLoading);
  const lastError = useAIStore((s) => s.lastError);
  const messages = useAIStore((s) => s.messages);
  const currentProvider = useAIStore((s) => s.currentProvider);
  const currentModel = useAIStore((s) => s.currentModel);

  const send = async (content: string) => {
    if (!content.trim()) return;
    await sendMessage(content);
  };

  return { send, messages, isLoading, lastError, currentProvider, currentModel };
}
