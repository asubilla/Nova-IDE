import { IncomingMessage, Server } from 'http';
import * as crypto from 'crypto';
import { LivePreviewEvent } from '../core/types';
import { PreviewServer } from '../live-preview/server';
import { ChatWebSocket } from '../src/chat/chat-websocket';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB9A34A9B07';
const WS_VERSION = 13;
const OPCODE_TEXT = 0x01;
const OPCODE_CLOSE = 0x08;
const OPCODE_PING = 0x09;
const OPCODE_PONG = 0x0a;

export interface WsClient {
  id: string;
  socket: import('net').Socket;
  alive: boolean;
  subscriptions: Set<string>;
  lastPong: number;
}

export interface WsHandlerOptions {
  heartbeatIntervalMs?: number;
  pongTimeoutMs?: number;
}

export class WsHandler {
  private clients: Map<string, WsClient> = new Map();
  private previewServer: PreviewServer;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private nextClientId = 1;
  private heartbeatIntervalMs: number;
  private pongTimeoutMs: number;
  private chatWebSocket: ChatWebSocket | null = null;

  constructor(previewServer: PreviewServer, options: WsHandlerOptions = {}) {
    this.previewServer = previewServer;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
    this.pongTimeoutMs = options.pongTimeoutMs ?? 10_000;
  }

  attach(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: import('net').Socket, head: Buffer) => {
      this.handleUpgrade(req, socket, head);
    });

    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.heartbeatIntervalMs);

    this.previewServer.on('send', ({ clientId, data }: { clientId: string; data: string }) => {
      const client = this.clients.get(clientId);
      if (client) {
        this.sendFrame(client, data);
      }
    });
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const client of this.clients.values()) {
      this.closeClient(client, 1000, 'Server shutting down');
    }
    this.clients.clear();
  }

  attachChatWebSocket(chatWebSocket: ChatWebSocket): void {
    this.chatWebSocket = chatWebSocket;
  }

  private handleUpgrade(req: IncomingMessage, socket: import('net').Socket, head: Buffer): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = crypto
      .createHash('sha1')
      .update(key + WS_MAGIC)
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      '',
    ].join('\r\n');

    socket.write(headers);

    const clientId = `ws-${this.nextClientId++}`;
    const client: WsClient = {
      id: clientId,
      socket,
      alive: true,
      subscriptions: new Set(),
      lastPong: Date.now(),
    };
    this.clients.set(clientId, client);

    this.previewServer.handleConnection(clientId);

    this.sendFrame(
      client,
      JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: new Date().toISOString(),
      }),
    );

    socket.on('data', (data: Buffer) => {
      this.handleData(client, data);
    });

    socket.on('close', () => {
      this.handleDisconnect(client);
    });

    socket.on('error', () => {
      this.handleDisconnect(client);
    });
  }

  private handleData(client: WsClient, data: Buffer): void {
    if (data.length < 2) return;

    const firstByte = data[0];
    const secondByte = data[1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      if (data.length < 4) return;
      payloadLength = data.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      if (data.length < 10) return;
      payloadLength = Number(data.readBigUInt64BE(2));
      offset = 10;
    }

    let maskKey: Buffer | null = null;
    if (masked) {
      if (data.length < offset + 4) return;
      maskKey = data.subarray(offset, offset + 4);
      offset += 4;
    }

    if (data.length < offset + payloadLength) return;

    let payload = data.subarray(offset, offset + payloadLength);
    if (maskKey) {
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }
    }

    switch (opcode) {
      case OPCODE_TEXT:
        this.handleMessage(client, payload.toString('utf-8'));
        break;
      case OPCODE_CLOSE:
        this.closeClient(client, 1000, 'Client closed');
        break;
      case OPCODE_PING:
        this.sendFrame(client, '', OPCODE_PONG);
        client.lastPong = Date.now();
        client.alive = true;
        break;
      case OPCODE_PONG:
        client.lastPong = Date.now();
        client.alive = true;
        break;
    }
  }

  private handleMessage(client: WsClient, raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'subscribe':
        if (msg.sessionId) {
          client.subscriptions.add(msg.sessionId);
          this.previewServer.joinRoom(client.id, msg.sessionId);
          this.sendFrame(
            client,
            JSON.stringify({
              type: 'subscribed',
              sessionId: msg.sessionId,
              timestamp: new Date().toISOString(),
            }),
          );
        }
        break;

      case 'unsubscribe':
        if (msg.sessionId) {
          client.subscriptions.delete(msg.sessionId);
          this.previewServer.leaveRoom(client.id, msg.sessionId);
          this.sendFrame(
            client,
            JSON.stringify({
              type: 'unsubscribed',
              sessionId: msg.sessionId,
              timestamp: new Date().toISOString(),
            }),
          );
        }
        break;

      case 'ping':
        this.sendFrame(
          client,
          JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }),
        );
        client.lastPong = Date.now();
        client.alive = true;
        break;

      case 'get-sessions':
        this.sendFrame(
          client,
          JSON.stringify({
            type: 'sessions',
            sessions: this.previewServer.getAllSessionSnapshots(),
            timestamp: new Date().toISOString(),
          }),
        );
        break;

      case 'get-session':
        if (msg.sessionId) {
          const snapshot = this.previewServer.getSessionSnapshot(msg.sessionId);
          this.sendFrame(
            client,
            JSON.stringify({
              type: 'session-snapshot',
              sessionId: msg.sessionId,
              data: snapshot ?? null,
              timestamp: new Date().toISOString(),
            }),
          );
        }
        break;
    }
  }

  private handleDisconnect(client: WsClient): void {
    client.subscriptions.clear();
    this.previewServer.handleDisconnection(client.id);
    this.clients.delete(client.id);
  }

  private closeClient(client: WsClient, code: number, reason: string): void {
    try {
      const reasonBuf = Buffer.from(reason, 'utf-8');
      const frame = Buffer.alloc(2 + reasonBuf.length);
      frame[0] = 0x80 | OPCODE_CLOSE;
      frame[1] = reasonBuf.length;
      reasonBuf.copy(frame, 2);
      client.socket.write(frame);
    } catch {}
    client.socket.destroy();
  }

  private sendFrame(client: WsClient, data: string, opcode = OPCODE_TEXT): void {
    try {
      const payload = Buffer.from(data, 'utf-8');
      const header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;

      if (payload.length < 126) {
        header[1] = payload.length;
        client.socket.write(Buffer.concat([header, payload]));
      } else if (payload.length < 65536) {
        header[1] = 126;
        const lenBuf = Buffer.alloc(2);
        lenBuf.writeUInt16BE(payload.length);
        client.socket.write(Buffer.concat([header, lenBuf, payload]));
      } else {
        header[1] = 127;
        const lenBuf = Buffer.alloc(8);
        lenBuf.writeBigUInt64BE(BigInt(payload.length));
        client.socket.write(Buffer.concat([header, lenBuf, payload]));
      }
    } catch {}
  }

  private heartbeat(): void {
    const now = Date.now();
    const dead: WsClient[] = [];

    for (const client of this.clients.values()) {
      if (now - client.lastPong > this.heartbeatIntervalMs + this.pongTimeoutMs) {
        dead.push(client);
        continue;
      }
      client.alive = false;
      this.sendFrame(client, '', OPCODE_PING);
    }

    for (const client of dead) {
      this.closeClient(client, 1000, 'Heartbeat timeout');
      this.handleDisconnect(client);
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  broadcast(event: LivePreviewEvent): void {
    const data = JSON.stringify(event);
    for (const client of this.clients.values()) {
      if (!client.alive) continue;
      if (client.subscriptions.size === 0 || client.subscriptions.has(event.sessionId)) {
        this.sendFrame(client, data);
      }
    }
  }
}
