import * as http from 'http';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB9A34A9B07';
const OPCODE_TEXT = 0x01;
const OPCODE_CLOSE = 0x08;
const OPCODE_PING = 0x09;
const OPCODE_PONG = 0x0a;

export interface WsMessage {
  type: string;
  channel?: string;
  data: any;
  clientId?: string;
  timestamp: number;
}

export interface WsClientConnection {
  id: string;
  socket: import('stream').Duplex & { write: (data: any) => boolean; destroy: () => void };
  alive: boolean;
  channels: Set<string>;
  lastPong: number;
  metadata: Record<string, any>;
}

export interface WsChannel {
  name: string;
  members: Set<string>;
  createdAt: number;
}

export interface WebSocketServerOptions {
  heartbeatIntervalMs?: number;
  pongTimeoutMs?: number;
  path?: string;
}

export class WebSocketServer extends EventEmitter {
  private port: number;
  private httpServer: http.Server;
  private clients: Map<string, WsClientConnection> = new Map();
  private channels: Map<string, WsChannel> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private nextClientId = 1;
  private options: Required<WebSocketServerOptions>;
  private messageBuffer: Map<string, Buffer[]> = new Map();

  constructor(port: number, options: WebSocketServerOptions = {}) {
    super();
    this.port = port;
    this.options = {
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 30_000,
      pongTimeoutMs: options.pongTimeoutMs ?? 10_000,
      path: options.path ?? '/',
    };

    this.httpServer = http.createServer((req, res) => {
      res.writeHead(426, { 'Content-Type': 'text/plain' });
      res.end('WebSocket Upgrade Required\n');
    });

    this.httpServer.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.heartbeatTimer = setInterval(() => this.heartbeat(), this.options.heartbeatIntervalMs);

      this.httpServer.listen(this.port, () => {
        this.emit('listening', this.port);
        resolve();
      });

      this.httpServer.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      for (const client of Array.from(this.clients.values())) {
        this.closeClient(client, 1000, 'Server shutting down');
      }
      this.clients.clear();
      this.channels.clear();
      this.messageBuffer.clear();

      this.httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private handleUpgrade(req: http.IncomingMessage, socket: import('stream').Duplex, head: Buffer): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== this.options.path) {
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
    const client: WsClientConnection = {
      id: clientId,
      socket,
      alive: true,
      channels: new Set(),
      lastPong: Date.now(),
      metadata: {},
    };

    this.clients.set(clientId, client);
    this.messageBuffer.set(clientId, []);

    this.sendFrame(client, JSON.stringify({
      type: 'connected',
      clientId,
      timestamp: Date.now(),
    }));

    this.emit('connection', clientId);

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

  private handleData(client: WsClientConnection, data: Buffer): void {
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

  private handleMessage(client: WsClientConnection, raw: string): void {
    let msg: WsMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    msg.clientId = msg.clientId || client.id;
    msg.timestamp = msg.timestamp || Date.now();

    if (msg.channel) {
      if (!this.channels.has(msg.channel)) {
        this.createChannel(msg.channel);
      }
      const channel = this.channels.get(msg.channel)!;
      if (!channel.members.has(client.id)) {
        channel.members.add(client.id);
        client.channels.add(msg.channel);
      }
    }

    this.emit('message', msg, client.id);

    if (msg.type === 'ping') {
      this.sendToClient(client.id, { type: 'pong', timestamp: Date.now() });
      client.lastPong = Date.now();
      client.alive = true;
      return;
    }

    if (msg.type === 'join' && msg.channel) {
      this.joinChannel(client.id, msg.channel);
      this.sendToClient(client.id, { type: 'joined', channel: msg.channel, timestamp: Date.now() });
      return;
    }

    if (msg.type === 'leave' && msg.channel) {
      this.leaveChannel(client.id, msg.channel);
      this.sendToClient(client.id, { type: 'left', channel: msg.channel, timestamp: Date.now() });
      return;
    }

    if (msg.type === 'broadcast' && msg.channel) {
      this.broadcastToChannel(msg.channel, msg.data, client.id);
      return;
    }
  }

  private handleDisconnect(client: WsClientConnection): void {
    for (const channelName of Array.from(client.channels)) {
      const channel = this.channels.get(channelName);
      if (channel) {
        channel.members.delete(client.id);
        if (channel.members.size === 0) {
          this.channels.delete(channelName);
        }
      }
    }

    this.messageBuffer.delete(client.id);
    this.clients.delete(client.id);
    this.emit('disconnect', client.id);
  }

  private closeClient(client: WsClientConnection, code: number, reason: string): void {
    try {
      const reasonBuf = Buffer.from(reason, 'utf-8');
      const frame = Buffer.alloc(2 + 2 + reasonBuf.length);
      frame[0] = 0x80 | OPCODE_CLOSE;
      frame[1] = 0x80 | (2 + reasonBuf.length);
      frame.writeUInt16BE(code, 2);
      reasonBuf.copy(frame, 4);
      client.socket.write(frame);
    } catch {
      // ignore write errors on close
    }
    client.socket.destroy();
  }

  sendFrame(client: WsClientConnection, data: string, opcode = OPCODE_TEXT): void {
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
    } catch {
      // ignore write errors
    }
  }

  broadcast(channel: string, data: any): void {
    const msg: WsMessage = {
      type: 'broadcast',
      channel,
      data,
      timestamp: Date.now(),
    };
    const payload = JSON.stringify(msg);

    const ch = this.channels.get(channel);
    if (!ch) return;

    for (const clientId of Array.from(ch.members)) {
      const client = this.clients.get(clientId);
      if (client && client.alive) {
        this.sendFrame(client, payload);
      }
    }
  }

  broadcastToChannel(channel: string, data: any, exclude?: string): void {
    const msg: WsMessage = {
      type: 'broadcast',
      channel,
      data,
      timestamp: Date.now(),
    };
    const payload = JSON.stringify(msg);

    const ch = this.channels.get(channel);
    if (!ch) return;

    for (const clientId of Array.from(ch.members)) {
      if (clientId === exclude) continue;
      const client = this.clients.get(clientId);
      if (client && client.alive) {
        this.sendFrame(client, payload);
      }
    }
  }

  sendToClient(clientId: string, data: any): boolean {
    const client = this.clients.get(clientId);
    if (!client || !client.alive) return false;

    const msg: WsMessage = {
      type: 'message',
      data,
      clientId,
      timestamp: Date.now(),
    };
    this.sendFrame(client, JSON.stringify(msg));
    return true;
  }

  createChannel(name: string): WsChannel {
    if (this.channels.has(name)) {
      return this.channels.get(name)!;
    }
    const channel: WsChannel = {
      name,
      members: new Set(),
      createdAt: Date.now(),
    };
    this.channels.set(name, channel);
    this.emit('channelCreated', name);
    return channel;
  }

  joinChannel(clientId: string, channel: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    if (!this.channels.has(channel)) {
      this.createChannel(channel);
    }

    const ch = this.channels.get(channel)!;
    ch.members.add(clientId);
    client.channels.add(channel);

    this.broadcastToChannel(channel, {
      type: 'userJoined',
      clientId,
      channel,
    }, clientId);

    return true;
  }

  leaveChannel(clientId: string, channel: string): boolean {
    const client = this.clients.get(clientId);
    const ch = this.channels.get(channel);
    if (!client || !ch) return false;

    ch.members.delete(clientId);
    client.channels.delete(channel);

    if (ch.members.size === 0) {
      this.channels.delete(channel);
    } else {
      this.broadcastToChannel(channel, {
        type: 'userLeft',
        clientId,
        channel,
      }, clientId);
    }

    return true;
  }

  getChannelMembers(channel: string): string[] {
    const ch = this.channels.get(channel);
    if (!ch) return [];
    return Array.from(ch.members);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  getClient(clientId: string): WsClientConnection | undefined {
    return this.clients.get(clientId);
  }

  isClientConnected(clientId: string): boolean {
    const client = this.clients.get(clientId);
    return client !== undefined && client.alive;
  }

  private heartbeat(): void {
    const now = Date.now();
    const dead: WsClientConnection[] = [];

    const clientList = Array.from(this.clients.values());
    for (const client of clientList) {
      if (now - client.lastPong > this.options.heartbeatIntervalMs + this.options.pongTimeoutMs) {
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

  getHttpServer(): http.Server {
    return this.httpServer;
  }
}
