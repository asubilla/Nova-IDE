export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30_000,
  backoffMultiplier: 2,
  jitter: true,
};

export async function retry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < opts.maxRetries) {
        const delay = calculateDelay(opts, attempt);
        opts.onRetry?.(lastError, attempt + 1);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

function calculateDelay(opts: RetryOptions, attempt: number): number {
  let delay = opts.baseDelay * Math.pow(opts.backoffMultiplier, attempt);
  delay = Math.min(delay, opts.maxDelay);

  if (opts.jitter) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }

  return Math.floor(delay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
