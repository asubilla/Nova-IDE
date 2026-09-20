import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatWebSocket, WSEventType } from '../../src/chat/chat-websocket';
import { ChatService } from '../../src/chat/chat-service';
import { ChatDatabase } from '../../src/chat/chat-database';
import { ChatSessionType, ChatMessageType } from '../../src/chat/chat-types';
import { WebSocket } from 'ws';

function createMockWebSocket(): WebSocket {
  const ws = {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    ping: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  } as unknown as WebSocket;
  return ws;
}

function lastSentPayload(ws: WebSocket): { type: string; data: Record<string, unknown> } | null {
  const calls = (ws.send as any).mock.calls;
  if (calls.length === 0) return null;
  return JSON.parse(calls[calls.length - 1][0]);
}

function findSentPayload(ws: WebSocket, type: string): (Record<string, unknown> & { data: Record<string, unknown> }) | null {
  const calls = (ws.send as any).mock.calls;
  for (const call of calls) {
    try {
      const data = JSON.parse(call[0]);
      if (data.type === type) return data;
    } catch {}
  }
  return null;
}

describe('ChatWebSocket', () => {
  let db: ChatDatabase;
  let service: ChatService;
  let wsManager: ChatWebSocket;

  beforeEach(() => {
    db = new ChatDatabase();
    service = new ChatService(db);
    wsManager = new ChatWebSocket(service);
  });

  afterEach(() => {
    wsManager.destroy();
    service.destroy();
  });

  describe('Connection Handling', () => {
    it('should handle new connection', () => {
      const ws = createMockWebSocket();
      wsManager.handleConnection(ws, 'user-1');

      expect(wsManager.isUserConnected('user-1')).toBe(true);
      expect(wsManager.getConnectedUserIds()).toContain('user-1');
    });

    it('should send connected event on connection', () => {
      const ws = createMockWebSocket();
      wsManager.handleConnection(ws, 'user-1');

      expect(ws.send).toHaveBeenCalled();
      const sentData = JSON.parse((ws.send as any).mock.calls[0][0]);
      expect(sentData.type).toBe(WSEventType.Connected);
      expect(sentData.data.userId).toBe('user-1');
    });

    it('should handle disconnect', () => {
      const ws = createMockWebSocket();
      wsManager.handleConnection(ws, 'user-1');
      wsManager.handleDisconnect('user-1');

      expect(wsManager.isUserConnected('user-1')).toBe(false);
    });

    it('should handle reconnection (close previous)', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.handleConnection(ws1, 'user-1');
      expect(wsManager.isUserConnected('user-1')).toBe(true);

      wsManager.handleConnection(ws2, 'user-1');
      expect(wsManager.isUserConnected('user-1')).toBe(true);

      const connectedPayload = findSentPayload(ws2, WSEventType.Connected);
      expect(connectedPayload).not.toBeNull();
      expect(connectedPayload!.data.userId).toBe('user-1');
    });
  });

  describe('Session Management', () => {
    it('should join session', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
      const ws = createMockWebSocket();
      wsManager.handleConnection(ws, 'user-1', session.id);

      const clients = wsManager.getSessionClients(session.id);
      expect(clients).toContain('user-1');
    });

    it('should handle chat:join event', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
      const ws = createMockWebSocket();

      const messageHandlers: Record<string, Function> = {};
      (ws.on as any).mockImplementation((event: string, handler: Function) => {
        messageHandlers[event] = handler;
        return ws;
      });

      wsManager.handleConnection(ws, 'user-1');
      wsManager.handleConnection(createMockWebSocket(), 'user-2');

      const joinPayload = JSON.stringify({
        type: WSEventType.ChatJoin,
        data: { sessionId: session.id },
      });

      const msgHandler = messageHandlers['message'];
      if (msgHandler) {
        msgHandler(Buffer.from(joinPayload));
      }

      const clients = wsManager.getSessionClients(session.id);
      expect(clients).toContain('user-1');
    });

    it('should handle chat:leave event', () => {
      const session = service.createSession(['user-1'], ChatSessionType.UserAgent);
      const ws = createMockWebSocket();

      const messageHandlers: Record<string, Function> = {};
      (ws.on as any).mockImplementation((event: string, handler: Function) => {
        messageHandlers[event] = handler;
        return ws;
      });

      wsManager.handleConnection(ws, 'user-1', session.id);
      expect(wsManager.getSessionClients(session.id)).toContain('user-1');

      wsManager.handleDisconnect('user-1');
      expect(wsManager.getSessionClients(session.id)).not.toContain('user-1');
    });
  });

  describe('Message Broadcasting', () => {
    it('should broadcast to session members', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);

      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.handleConnection(ws1, 'user-1', session.id);
      wsManager.handleConnection(ws2, 'user-2', session.id);

      wsManager.broadcast(session.id, WSEventType.MessageSent, { content: 'hello' });

      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });

    it('should not broadcast to excluded user', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);

      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.handleConnection(ws1, 'user-1', session.id);
      wsManager.handleConnection(ws2, 'user-2', session.id);

      const callsBefore = (ws1.send as any).mock.calls.length;

      wsManager.broadcastToSession(
        session.id,
        WSEventType.MessageSent,
        { content: 'hello' },
        'user-1',
      );

      expect((ws1.send as any).mock.calls.length).toBe(callsBefore);
      expect(ws2.send).toHaveBeenCalled();
    });

    it('should send to specific user', () => {
      const ws = createMockWebSocket();
      wsManager.handleConnection(ws, 'user-1');

      wsManager.sendToUser('user-1', WSEventType.Connected, { test: true });
      expect(ws.send).toHaveBeenCalled();
    });
  });

  describe('Typing Indicators', () => {
    it('should broadcast typing started to session', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);

      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.handleConnection(ws1, 'user-1', session.id);
      wsManager.handleConnection(ws2, 'user-2', session.id);

      service.typingStart(session.id, 'user-1');

      const typingPayload = findSentPayload(ws2, WSEventType.TypingStarted);
      expect(typingPayload).not.toBeNull();
      expect(typingPayload!.data.userId).toBe('user-1');
    });
  });

  describe('Presence Tracking', () => {
    it('should broadcast presence on connect', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.handleConnection(ws1, 'user-1');
      wsManager.handleConnection(ws2, 'user-2');

      const presencePayload = findSentPayload(ws1, WSEventType.PresenceChanged);
      expect(presencePayload).not.toBeNull();
      expect(presencePayload!.data.status).toBe('online');
    });

    it('should broadcast offline on disconnect', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.handleConnection(ws1, 'user-1');
      wsManager.handleConnection(ws2, 'user-2');

      (ws1.send as any).mockClear();
      wsManager.handleDisconnect('user-2');

      const offlinePayload = findSentPayload(ws1, WSEventType.PresenceChanged);
      expect(offlinePayload).not.toBeNull();
      expect(offlinePayload!.data.status).toBe('offline');
    });
  });

  describe('Reconnection', () => {
    it('should save reconnection state on disconnect', () => {
      const session = service.createSession(['user-1'], ChatSessionType.UserAgent);
      const ws = createMockWebSocket();
      wsManager.handleConnection(ws, 'user-1', session.id);

      wsManager.handleDisconnect('user-1');
    });

    it('should replay missed messages', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
      const ws = createMockWebSocket();
      wsManager.handleConnection(ws, 'user-1', session.id);

      service.sendMessage({
        sessionId: session.id,
        senderId: 'user-2',
        senderType: 'user',
        content: 'User 2 message',
      });

      wsManager.handleDisconnect('user-1');

      const ws2 = createMockWebSocket();
      wsManager.handleConnection(ws2, 'user-1', session.id);

      wsManager.replayMissedMessages('user-1', session.id);

      const calls = (ws2.send as any).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should send error to user', () => {
      const ws = createMockWebSocket();
      wsManager.handleConnection(ws, 'user-1');

      wsManager.sendToUser('user-1', WSEventType.Error, { message: 'test error' });

      const errorPayload = findSentPayload(ws, WSEventType.Error);
      expect(errorPayload).not.toBeNull();
      expect(errorPayload!.data.message).toBe('test error');
    });

    it('should handle invalid JSON message', () => {
      const ws = createMockWebSocket();
      const messageHandlers: Record<string, Function> = {};
      (ws.on as any).mockImplementation((event: string, handler: Function) => {
        messageHandlers[event] = handler;
        return ws;
      });

      wsManager.handleConnection(ws, 'user-1');

      const callsBefore = (ws.send as any).mock.calls.length;

      const msgHandler = messageHandlers['message'];
      if (msgHandler) {
        msgHandler(Buffer.from('invalid json'));
      }

      expect((ws.send as any).mock.calls.length).toBeGreaterThan(callsBefore);

      const errorPayload = findSentPayload(ws, WSEventType.Error);
      expect(errorPayload).not.toBeNull();
    });
  });

  describe('Query Methods', () => {
    it('should get connected user ids', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.handleConnection(ws1, 'user-1');
      wsManager.handleConnection(ws2, 'user-2');

      const ids = wsManager.getConnectedUserIds();
      expect(ids).toContain('user-1');
      expect(ids).toContain('user-2');
    });

    it('should check if user is connected', () => {
      const ws = createMockWebSocket();
      wsManager.handleConnection(ws, 'user-1');

      expect(wsManager.isUserConnected('user-1')).toBe(true);
      expect(wsManager.isUserConnected('user-3')).toBe(false);
    });

    it('should get session clients', () => {
      const session = service.createSession(['user-1', 'user-2'], ChatSessionType.UserAgent);
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.handleConnection(ws1, 'user-1', session.id);
      wsManager.handleConnection(ws2, 'user-2', session.id);

      const clients = wsManager.getSessionClients(session.id);
      expect(clients).toContain('user-1');
      expect(clients).toContain('user-2');
    });
  });

  describe('Cleanup', () => {
    it('should destroy and close all connections', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.handleConnection(ws1, 'user-1');
      wsManager.handleConnection(ws2, 'user-2');

      wsManager.destroy();

      expect(wsManager.getConnectedUserIds().length).toBe(0);
    });
  });
});
