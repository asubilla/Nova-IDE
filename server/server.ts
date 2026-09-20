import * as http from 'http';
import { SubAgentOrchestrator } from '../core/orchestrator';
import { SessionManager } from '../session/manager';
import { ArtifactManager } from '../artifacts/manager';
import { CheckpointManager } from '../session/checkpoint';
import { PreviewServer } from '../live-preview/server';
import { DashboardBuilder } from '../live-preview/dashboard';
import { createRouter, RouteContext } from './routes';
import { WsHandler } from './ws-handler';
import {
  corsMiddleware,
  jsonBodyParser,
  requestLogger,
  errorHandler,
  rateLimiter,
} from './middleware';
import { ChatDatabase } from '../src/chat/chat-database';
import { ChatService } from '../src/chat/chat-service';
import { ChatWebSocket } from '../src/chat/chat-websocket';
import { ChatSecurity } from '../src/chat/chat-security';
import { ChatIntegration } from '../src/chat/chat-integration';
import { ChatEnhanced } from '../src/chat/chat-enhanced';

export interface ServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

const DEFAULT_CONFIG: ServerConfig = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  host: process.env.HOST ?? '127.0.0.1',
  corsOrigins: ['*'],
  rateLimitWindowMs: 60_000,
  rateLimitMaxRequests: 200,
};

export class ApiServer {
  private httpServer: http.Server;
  private wsHandler: WsHandler;
  private ctx: RouteContext;
  private config: ServerConfig;
  private dashboards: Map<string, DashboardBuilder> = new Map();

  private chatService: ChatService;
  private chatWebSocket: ChatWebSocket;
  private chatEnhanced: ChatEnhanced;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const sessionManager = new SessionManager({
      maxSessions: 50,
      sessionTimeoutMs: 30 * 60_000,
      cleanupIntervalMs: 60_000,
    });

    const orchestrator = new SubAgentOrchestrator({
      maxAgentsPerSession: 100,
      maxConcurrentAgents: 20,
      defaultTimeoutMs: 300000,
      globalRetryPolicy: { maxRetries: 3, backoffMs: 5000, escalateOnFailure: true },
      enableLivePreview: true,
      previewPort: 3001,
      checkpointIntervalMs: 30000,
      artifactRetentionDays: 7,
      spawnConfig: {
        maxAgentsPerSession: 100,
        maxConcurrentAgents: 20,
        spawnStrategy: 'dependency-aware',
        resourceLimits: { maxMemoryMB: 8192, maxCpuPercent: 90, maxDiskMB: 10240, maxNetworkMbps: 100, maxFileHandles: 1024, maxChildProcesses: 64 },
        autoScaling: { enabled: true, minAgents: 1, maxAgents: 20, scaleUpThreshold: 0.7, scaleDownThreshold: 0.3, cooldownMs: 30000, metricsWindowMs: 60000 },
      },
      distributionStrategy: 'project-aware',
      errorFixLoop: { maxIterations: 5, backoffStrategy: 'exponential', baseBackoffMs: 2000, maxBackoffMs: 30000, escalationRules: [], fixStrategies: [], validationGates: [] },
      coordinationEnabled: true,
      persistenceEnabled: true,
    });

    const previewServer = new PreviewServer(this.config.port + 1);

    const artifactManager = new ArtifactManager();
    const checkpointManager = new CheckpointManager();

    const chatDatabase = new ChatDatabase();

    this.chatService = new ChatService(chatDatabase);
    this.chatWebSocket = new ChatWebSocket(this.chatService);

    const chatSecurity = new ChatSecurity(chatDatabase);

    this.chatEnhanced = new ChatEnhanced({
      db: chatDatabase,
      service: this.chatService,
      websocket: this.chatWebSocket,
      security: chatSecurity,
    });

    const chatIntegration = new ChatIntegration(this.chatService);
    chatIntegration.integrateWithOrchestrator(orchestrator);

    this.ctx = {
      orchestrator,
      sessionManager,
      artifactManager,
      checkpointManager,
      previewServer,
      dashboards: this.dashboards,
      chatService: this.chatService,
      chatWebSocket: this.chatWebSocket,
      chatEnhanced: this.chatEnhanced,
    };

    const router = createRouter(this.ctx);

    this.httpServer = http.createServer((req, res) => {
      const middlewares = [
        corsMiddleware(this.config.corsOrigins),
        rateLimiter({
          windowMs: this.config.rateLimitWindowMs,
          maxRequests: this.config.rateLimitMaxRequests,
        }),
        requestLogger(),
        jsonBodyParser(),
      ];

      let idx = 0;
      const run = () => {
        if (idx < middlewares.length) {
          middlewares[idx++](req, res, run);
        } else {
          router(req, res).catch((err) => {
            console.error('[Server] Unhandled error:', err);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Internal Server Error' }));
            }
          });
        }
      };
      run();
    });

    this.wsHandler = new WsHandler(previewServer);
    this.wsHandler.attachChatWebSocket(this.chatWebSocket);
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wsHandler.attach(this.httpServer);

      this.httpServer.listen(this.config.port, this.config.host, () => {
        console.log(
          `[Server] API listening on http://${this.config.host}:${this.config.port}`,
        );
        console.log(
          `[Server] WebSocket listening on ws://${this.config.host}:${this.config.port}/ws`,
        );
        resolve();
      });

      this.httpServer.on('error', (err) => {
        console.error('[Server] HTTP server error:', err);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wsHandler.stop();

      this.httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getContext(): RouteContext {
    return this.ctx;
  }

  getHttpServer(): http.Server {
    return this.httpServer;
  }
}
