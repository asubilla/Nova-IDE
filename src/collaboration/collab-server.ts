import { EventEmitter } from 'events';
import { WebSocketServer, WsMessage } from '../server/ws-server';

export interface CursorPosition {
  line: number;
  column: number;
  lineCount?: number;
}

export interface Selection {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface EditorState {
  clientId: string;
  fileId: string;
  cursor: CursorPosition;
  selection: Selection | null;
  joinedAt: number;
  lastActivity: number;
}

export interface TextOperation {
  type: 'insert' | 'delete' | 'replace';
  position: number;
  length?: number;
  text?: string;
  version: number;
  clientId: string;
  timestamp: number;
}

export interface FileState {
  fileId: string;
  content: string;
  version: number;
  operations: TextOperation[];
  editors: Map<string, EditorState>;
}

export interface PresenceInfo {
  clientId: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  currentFile?: string;
  lastSeen: number;
}

export class CollabServer extends EventEmitter {
  private wsServer: WebSocketServer;
  private fileStates: Map<string, FileState> = new Map();
  private presence: Map<string, PresenceInfo> = new Map();
  private operationLog: Map<string, TextOperation[]> = new Map();

  constructor(wsServer: WebSocketServer) {
    super();
    this.wsServer = wsServer;
    this.setupMessageHandlers();
  }

  private setupMessageHandlers(): void {
    this.wsServer.on('message', (msg: WsMessage, clientId: string) => {
      this.handleCollabMessage(msg, clientId);
    });

    this.wsServer.on('disconnect', (clientId: string) => {
      this.handleClientDisconnect(clientId);
    });
  }

  private handleCollabMessage(msg: WsMessage, clientId: string): void {
    const data = msg.data;
    if (!data || typeof data !== 'object') return;

    switch (data.action) {
      case 'cursorUpdate':
        this.handleCursorUpdate(clientId, data.fileId, data.position);
        break;
      case 'selectionUpdate':
        this.handleSelectionUpdate(clientId, data.fileId, data.selection);
        break;
      case 'edit':
        this.handleEdit(clientId, data.fileId, data.operation);
        break;
      case 'join':
        this.handleJoin(clientId, data.fileId);
        break;
      case 'leave':
        this.handleLeave(clientId, data.fileId);
        break;
      case 'syncRequest':
        this.handleSyncRequest(clientId, data.fileId);
        break;
    }
  }

  handleCursorUpdate(clientId: string, fileId: string, position: CursorPosition): void {
    const editors = this.getFileEditors(fileId);
    const editor = editors.find((e) => e.clientId === clientId);

    if (editor) {
      editor.cursor = position;
      editor.lastActivity = Date.now();
    }

    const channel = `file:${fileId}`;
    this.wsServer.broadcastToChannel(channel, {
      type: 'cursorUpdate',
      clientId,
      fileId,
      position,
      timestamp: Date.now(),
    }, clientId);
  }

  handleSelectionUpdate(clientId: string, fileId: string, selection: Selection): void {
    const editors = this.getFileEditors(fileId);
    const editor = editors.find((e) => e.clientId === clientId);

    if (editor) {
      editor.selection = selection;
      editor.lastActivity = Date.now();
    }

    const channel = `file:${fileId}`;
    this.wsServer.broadcastToChannel(channel, {
      type: 'selectionUpdate',
      clientId,
      fileId,
      selection,
      timestamp: Date.now(),
    }, clientId);
  }

  handleEdit(clientId: string, fileId: string, operation: TextOperation): void {
    let fileState = this.fileStates.get(fileId);
    if (!fileState) {
      fileState = {
        fileId,
        content: '',
        version: 0,
        operations: [],
        editors: new Map(),
      };
      this.fileStates.set(fileId, fileState);
    }

    const transformedOp = this.transformOperation(operation, fileState.operations);
    fileState.operations.push(transformedOp);
    fileState.version++;

    this.applyOperation(fileState, transformedOp);

    if (!this.operationLog.has(fileId)) {
      this.operationLog.set(fileId, []);
    }
    this.operationLog.get(fileId)!.push(transformedOp);

    const channel = `file:${fileId}`;
    this.wsServer.broadcastToChannel(channel, {
      type: 'edit',
      clientId,
      fileId,
      operation: transformedOp,
      version: fileState.version,
      timestamp: Date.now(),
    }, clientId);

    this.emit('editApplied', fileId, transformedOp);
  }

  handleJoin(clientId: string, fileId: string): void {
    const channel = `file:${fileId}`;
    this.wsServer.joinChannel(clientId, channel);

    let fileState = this.fileStates.get(fileId);
    if (!fileState) {
      fileState = {
        fileId,
        content: '',
        version: 0,
        operations: [],
        editors: new Map(),
      };
      this.fileStates.set(fileId, fileState);
    }

    const editorState: EditorState = {
      clientId,
      fileId,
      cursor: { line: 0, column: 0 },
      selection: null,
      joinedAt: Date.now(),
      lastActivity: Date.now(),
    };

    fileState.editors.set(clientId, editorState);

    this.updatePresence(clientId, 'online', fileId);

    this.wsServer.sendToClient(clientId, {
      type: 'fileState',
      fileId,
      content: fileState.content,
      version: fileState.version,
      editors: this.getEditorCount(fileId),
      timestamp: Date.now(),
    });

    this.wsServer.broadcastToChannel(channel, {
      type: 'editorJoined',
      clientId,
      fileId,
      editorCount: this.getEditorCount(fileId),
      timestamp: Date.now(),
    }, clientId);

    this.emit('editorJoined', fileId, clientId);
  }

  handleLeave(clientId: string, fileId: string): void {
    const channel = `file:${fileId}`;
    this.wsServer.leaveChannel(clientId, channel);

    const fileState = this.fileStates.get(fileId);
    if (fileState) {
      fileState.editors.delete(clientId);
    }

    this.updatePresence(clientId, 'online');

    this.wsServer.broadcastToChannel(channel, {
      type: 'editorLeft',
      clientId,
      fileId,
      editorCount: this.getEditorCount(fileId),
      timestamp: Date.now(),
    });

    this.emit('editorLeft', fileId, clientId);
  }

  private handleSyncRequest(clientId: string, fileId: string): void {
    const fileState = this.fileStates.get(fileId);
    if (!fileState) {
      this.wsServer.sendToClient(clientId, {
        type: 'syncResponse',
        fileId,
        content: '',
        version: 0,
        timestamp: Date.now(),
      });
      return;
    }

    this.wsServer.sendToClient(clientId, {
      type: 'syncResponse',
      fileId,
      content: fileState.content,
      version: fileState.version,
      operations: fileState.operations.slice(-100),
      timestamp: Date.now(),
    });
  }

  private handleClientDisconnect(clientId: string): void {
    for (const [fileId, fileState] of Array.from(this.fileStates.entries())) {
      if (fileState.editors.has(clientId)) {
        fileState.editors.delete(clientId);
        const channel = `file:${fileId}`;
        this.wsServer.broadcastToChannel(channel, {
          type: 'editorLeft',
          clientId,
          fileId,
          editorCount: this.getEditorCount(fileId),
          timestamp: Date.now(),
        });
      }
    }

    this.presence.delete(clientId);
  }

  getFileEditors(fileId: string): EditorState[] {
    const fileState = this.fileStates.get(fileId);
    if (!fileState) return [];
    return Array.from(fileState.editors.values());
  }

  getEditorCount(fileId: string): number {
    const fileState = this.fileStates.get(fileId);
    if (!fileState) return 0;
    return fileState.editors.size;
  }

  resolveConflicts(operations: TextOperation[]): TextOperation[] {
    if (operations.length <= 1) return operations;

    const sorted = [...operations].sort((a, b) => {
      if (a.version !== b.version) return a.version - b.version;
      return a.clientId.localeCompare(b.clientId);
    });

    const resolved: TextOperation[] = [];
    let offset = 0;

    for (const op of sorted) {
      const transformed = { ...op };
      transformed.position = Math.max(0, op.position + offset);

      if (op.type === 'insert' && op.text) {
        offset += op.text.length;
      } else if (op.type === 'delete' && op.length) {
        offset -= op.length;
      }

      resolved.push(transformed);
    }

    return resolved;
  }

  syncFileState(fileId: string): FileState | null {
    const fileState = this.fileStates.get(fileId);
    if (!fileState) return null;

    const channel = `file:${fileId}`;
    this.wsServer.broadcastToChannel(channel, {
      type: 'syncState',
      fileId,
      content: fileState.content,
      version: fileState.version,
      editorCount: fileState.editors.size,
      timestamp: Date.now(),
    });

    return fileState;
  }

  getPresence(teamId: string): PresenceInfo[] {
    return Array.from(this.presence.values()).filter((p) => p.status !== 'offline');
  }

  updatePresence(clientId: string, status: PresenceInfo['status'], currentFile?: string): void {
    const existing = this.presence.get(clientId);
    const info: PresenceInfo = {
      clientId,
      status,
      currentFile: currentFile ?? existing?.currentFile,
      lastSeen: Date.now(),
    };
    this.presence.set(clientId, info);

    this.wsServer.broadcast('presence', {
      type: 'presenceUpdate',
      presence: info,
      timestamp: Date.now(),
    });
  }

  private transformOperation(op: TextOperation, existingOps: TextOperation[]): TextOperation {
    let transformed = { ...op };

    for (const existing of existingOps) {
      if (existing.clientId === op.clientId && existing.version >= op.version) {
        continue;
      }

      if (transformed.type === 'insert' && existing.type === 'insert') {
        if (existing.position <= transformed.position) {
          transformed.position += (existing.text?.length ?? 0);
        }
      } else if (transformed.type === 'insert' && existing.type === 'delete') {
        if (existing.position <= transformed.position) {
          transformed.position = Math.max(existing.position, transformed.position - (existing.length ?? 0));
        }
      } else if (transformed.type === 'delete' && existing.type === 'insert') {
        if (existing.position <= transformed.position) {
          transformed.position += (existing.text?.length ?? 0);
        }
      } else if (transformed.type === 'delete' && existing.type === 'delete') {
        if (existing.position < transformed.position) {
          transformed.position = Math.max(existing.position, transformed.position - (existing.length ?? 0));
        } else if (existing.position < transformed.position + (transformed.length ?? 0)) {
          const overlap = Math.min(
            (existing.length ?? 0),
            (transformed.position + (transformed.length ?? 0)) - existing.position,
          );
          transformed.length = (transformed.length ?? 0) - overlap;
        }
      }
    }

    return transformed;
  }

  private applyOperation(fileState: FileState, operation: TextOperation): void {
    switch (operation.type) {
      case 'insert':
        if (operation.text !== undefined) {
          fileState.content =
            fileState.content.slice(0, operation.position) +
            operation.text +
            fileState.content.slice(operation.position);
        }
        break;
      case 'delete':
        if (operation.length !== undefined) {
          fileState.content =
            fileState.content.slice(0, operation.position) +
            fileState.content.slice(operation.position + operation.length);
        }
        break;
      case 'replace':
        if (operation.text !== undefined && operation.length !== undefined) {
          fileState.content =
            fileState.content.slice(0, operation.position) +
            operation.text +
            fileState.content.slice(operation.position + operation.length);
        }
        break;
    }
  }

  getFileContent(fileId: string): string | null {
    const fileState = this.fileStates.get(fileId);
    return fileState ? fileState.content : null;
  }

  getFileVersion(fileId: string): number {
    const fileState = this.fileStates.get(fileId);
    return fileState ? fileState.version : 0;
  }

  getActiveFiles(): string[] {
    return Array.from(this.fileStates.keys()).filter(
      (fileId) => this.getEditorCount(fileId) > 0,
    );
  }

  dispose(): void {
    this.fileStates.clear();
    this.presence.clear();
    this.operationLog.clear();
  }
}
