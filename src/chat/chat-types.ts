export enum ChatMessageType {
  Text = 'text',
  Image = 'image',
  File = 'file',
  Code = 'code',
  System = 'system',
  AgentResponse = 'agent-response',
}

export enum ChatSessionType {
  UserAgent = 'user-agent',
  AgentAgent = 'agent-agent',
  Group = 'group',
}

export enum ChatSessionStatus {
  Active = 'active',
  Archived = 'archived',
  Deleted = 'deleted',
}

export interface ChatSession {
  id: string;
  participants: string[];
  type: ChatSessionType;
  status: ChatSessionStatus;
  title?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatReaction {
  emoji: string;
  userId: string;
  createdAt: Date;
}

export interface ChatReadReceipt {
  userId: string;
  readAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderType: 'user' | 'agent' | 'system';
  content: string;
  type: ChatMessageType;
  replyTo?: string;
  createdAt: Date;
  updatedAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
  readBy: ChatReadReceipt[];
  reactions: ChatReaction[];
}

export interface ChatAttachment {
  id: string;
  messageId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url: string;
  uploadedAt: Date;
}

export interface ChatTypingIndicator {
  sessionId: string;
  userId: string;
  isTyping: boolean;
  timestamp: Date;
}

export interface ChatPresence {
  userId: string;
  status: 'online' | 'offline' | 'away';
  lastSeen: Date;
}

export interface PaginatedMessages {
  messages: ChatMessage[];
  total: number;
  hasMore: boolean;
}

export interface MessageSearchResult {
  message: ChatMessage;
  sessionTitle?: string;
  snippet: string;
}
