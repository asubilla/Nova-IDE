export { ApiServer } from './server';
export type { ServerConfig } from './server';

export { buildRoutes, createRouter } from './routes';
export type { Route, RouteContext, Handler } from './routes';

export { WsHandler } from './ws-handler';
export type { WsClient, WsHandlerOptions } from './ws-handler';

export {
  corsMiddleware,
  jsonBodyParser,
  requestLogger,
  errorHandler,
  rateLimiter,
} from './middleware';
export type { MiddlewareFn, RateLimiterOptions } from './middleware';

import { ApiServer } from './server';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '127.0.0.1';

if (require.main === module || process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index')) {
  const server = new ApiServer({ port: PORT, host: HOST });

  server.start().then(() => {
    console.log(`[SubAgent API] Server ready at http://${HOST}:${PORT}`);
  }).catch((err) => {
    console.error('[SubAgent API] Failed to start:', err);
    process.exit(1);
  });

  const shutdown = async () => {
    console.log('\n[SubAgent API] Shutting down...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
