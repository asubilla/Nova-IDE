import { useState, useCallback } from 'react';
import { useHealingStore } from '../store/healingStore';

interface ErrorHandlerState<T> {
  error: Error | null;
  isLoading: boolean;
  execute: (...args: unknown[]) => Promise<T | undefined>;
}

export function useErrorHandler<T>(
  asyncFn: (...args: unknown[]) => Promise<T>,
  agentId = 'ui'
): ErrorHandlerState<T> {
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const addEvent = useHealingStore((s) => s.addEvent);

  const execute = useCallback(
    async (...args: unknown[]): Promise<T | undefined> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await asyncFn(...args);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);

        addEvent('error', error.message, agentId);

        if (import.meta.env.VITE_DEBUG === 'true') {
          console.error(`[useErrorHandler] Error in ${agentId}:`, error);
        }

        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [asyncFn, agentId, addEvent]
  );

  return { error, isLoading, execute };
}
