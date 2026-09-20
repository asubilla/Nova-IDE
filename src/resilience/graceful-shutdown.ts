import { EventEmitter } from 'events';

export interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  timeout: number;
  priority: number;
}

export class GracefulShutdown extends EventEmitter {
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownTimeout = 30000;

  registerHandler(name: string, handler: () => Promise<void>, options?: { timeout?: number; priority?: number }): void {
    this.handlers.push({ name, handler, timeout: options?.timeout || 5000, priority: options?.priority || 0 });
    this.handlers.sort((a, b) => b.priority - a.priority);
  }

  async shutdown(signal?: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    this.emit('shutdown-started', { signal });

    const results: { name: string; success: boolean; error?: string }[] = [];
    for (const handler of this.handlers) {
      try {
        await Promise.race([
          handler.handler(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), handler.timeout)),
        ]);
        results.push({ name: handler.name, success: true });
        this.emit('handler-completed', { name: handler.name });
      } catch (error) {
        results.push({ name: handler.name, success: false, error: (error as Error).message });
        this.emit('handler-failed', { name: handler.name, error: (error as Error).message });
      }
    }

    this.emit('shutdown-completed', { results });
    process.exit(0);
  }

  setupSignalHandlers(): void {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('uncaughtException', (error) => { this.emit('uncaught-exception', error); this.shutdown('uncaughtException'); });
    process.on('unhandledRejection', (reason) => { this.emit('unhandled-rejection', reason); this.shutdown('unhandledRejection'); });
  }

  isShutdownInProgress(): boolean { return this.isShuttingDown; }
  getHandlers(): ShutdownHandler[] { return [...this.handlers]; }
}
