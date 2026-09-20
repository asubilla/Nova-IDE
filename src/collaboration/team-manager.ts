import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

export type MemberStatus = 'active' | 'invited' | 'inactive';

export interface TeamMember {
  userId: string;
  username: string;
  email: string;
  role: TeamRole;
  status: MemberStatus;
  joinedAt: Date;
  lastActive: Date;
  avatar?: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: TeamMember[];
  channels: Channel[];
  sharedFiles: SharedFile[];
  createdAt: Date;
  updatedAt: Date;
  settings: TeamSettings;
}

export interface TeamSettings {
  defaultChannel: string;
  fileSharingEnabled: boolean;
  screenShareEnabled: boolean;
  cursorSharingEnabled: boolean;
  maxMembers: number;
}

export interface Channel {
  id: string;
  teamId: string;
  name: string;
  description: string;
  isPrivate: boolean;
  createdBy: string;
  createdAt: Date;
  members: string[];
}

export interface ChatMessage {
  id: string;
  channelId: string;
  userId: string;
  username: string;
  content: string;
  type: 'text' | 'file' | 'system' | 'image';
  timestamp: Date;
  edited: boolean;
  replyTo?: string;
  reactions: Record<string, string[]>;
}

export interface SharedFile {
  id: string;
  teamId: string;
  filePath: string;
  sharedBy: string;
  sharedAt: Date;
  description: string;
  accessCount: number;
  lastAccessed: Date;
}

export interface CursorPosition {
  userId: string;
  username: string;
  file: string;
  line: number;
  column: number;
  selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
  timestamp: Date;
}

export interface ScreenShareSession {
  userId: string;
  username: string;
  startedAt: Date;
  streamId: string;
}

const DATA_DIR = join(process.cwd(), '.nova', 'collaboration');

export class TeamManager extends EventEmitter {
  private teams: Map<string, Team> = new Map();
  private messages: Map<string, ChatMessage[]> = new Map();
  private cursors: Map<string, CursorPosition[]> = new Map();
  private screenShares: Map<string, ScreenShareSession> = new Map();
  private dataDir: string;

  constructor(dataDir?: string) {
    super();
    this.dataDir = dataDir || DATA_DIR;
    this.ensureDirectories();
    this.loadData();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private loadData(): void {
    const teamsPath = join(this.dataDir, 'teams.json');
    if (existsSync(teamsPath)) {
      try {
        const data = JSON.parse(readFileSync(teamsPath, 'utf-8'));
        for (const [id, team] of Object.entries(data)) {
          const t = team as Team;
          t.createdAt = new Date(t.createdAt);
          t.updatedAt = new Date(t.updatedAt);
          t.members = t.members.map((m: TeamMember) => ({
            ...m,
            joinedAt: new Date(m.joinedAt),
            lastActive: new Date(m.lastActive),
          }));
          this.teams.set(id, t);
        }
      } catch {
        /* ignore corrupt data */
      }
    }
  }

  private saveData(): void {
    const teamsPath = join(this.dataDir, 'teams.json');
    const data: Record<string, Team> = {};
    for (const [id, team] of this.teams) {
      data[id] = team;
    }
    writeFileSync(teamsPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async createTeam(name: string, description: string = '', ownerId: string = 'system'): Promise<Team> {
    if (this.findTeamByName(name)) {
      throw new Error(`Team "${name}" already exists`);
    }
    const id = uuidv4();
    const now = new Date();
    const team: Team = {
      id,
      name,
      description,
      ownerId,
      members: [
        {
          userId: ownerId,
          username: 'Owner',
          email: '',
          role: 'owner',
          status: 'active',
          joinedAt: now,
          lastActive: now,
        },
      ],
      channels: [],
      sharedFiles: [],
      createdAt: now,
      updatedAt: now,
      settings: {
        defaultChannel: 'general',
        fileSharingEnabled: true,
        screenShareEnabled: true,
        cursorSharingEnabled: true,
        maxMembers: 50,
      },
    };
    const generalChannel = await this.createChannel(id, 'general');
    team.channels.push(generalChannel);
    this.teams.set(id, team);
    this.saveData();
    this.emit('teamCreated', team);
    return team;
  }

  async inviteMember(teamId: string, email: string, role: TeamRole = 'member', invitedBy: string = 'system'): Promise<TeamMember> {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);
    if (team.members.length >= team.settings.maxMembers) {
      throw new Error('Team has reached maximum member limit');
    }
    if (team.members.some((m) => m.email === email)) {
      throw new Error(`User with email ${email} is already a member`);
    }
    const userId = uuidv4();
    const now = new Date();
    const member: TeamMember = {
      userId,
      username: email.split('@')[0],
      email,
      role,
      status: 'invited',
      joinedAt: now,
      lastActive: now,
    };
    team.members.push(member);
    team.updatedAt = now;
    this.saveData();
    this.emit('memberInvited', { teamId, member, invitedBy });
    return member;
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);
    const idx = team.members.findIndex((m) => m.userId === userId);
    if (idx < 0) throw new Error(`Member ${userId} not found in team`);
    if (team.members[idx].role === 'owner') {
      throw new Error('Cannot remove the team owner');
    }
    const removed = team.members.splice(idx, 1)[0];
    team.updatedAt = new Date();
    this.saveData();
    this.emit('memberRemoved', { teamId, userId: removed.userId });
  }

  async getMembers(teamId: string): Promise<TeamMember[]> {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);
    return [...team.members];
  }

  async updateRole(teamId: string, userId: string, role: TeamRole): Promise<TeamMember> {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);
    const member = team.members.find((m) => m.userId === userId);
    if (!member) throw new Error(`Member ${userId} not found`);
    if (member.role === 'owner') throw new Error('Cannot change owner role');
    member.role = role;
    team.updatedAt = new Date();
    this.saveData();
    this.emit('roleUpdated', { teamId, userId, role });
    return member;
  }

  async createChannel(teamId: string, name: string, description: string = '', isPrivate: boolean = false, createdBy: string = 'system'): Promise<Channel> {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);
    if (team.channels.some((c) => c.name === name)) {
      throw new Error(`Channel "${name}" already exists`);
    }
    const channel: Channel = {
      id: uuidv4(),
      teamId,
      name,
      description,
      isPrivate,
      createdBy,
      createdAt: new Date(),
      members: isPrivate ? [createdBy] : [],
    };
    team.channels.push(channel);
    team.updatedAt = new Date();
    this.messages.set(channel.id, []);
    this.saveData();
    this.emit('channelCreated', channel);
    return channel;
  }

  async sendMessage(channelId: string, content: string, userId: string = 'system', username: string = 'System', type: ChatMessage['type'] = 'text'): Promise<ChatMessage> {
    if (!this.messages.has(channelId)) {
      this.messages.set(channelId, []);
    }
    const message: ChatMessage = {
      id: uuidv4(),
      channelId,
      userId,
      username,
      content,
      type,
      timestamp: new Date(),
      edited: false,
      reactions: {},
    };
    this.messages.get(channelId)!.push(message);
    this.emit('messageSent', message);
    return message;
  }

  async getMessages(channelId: string, limit: number = 50): Promise<ChatMessage[]> {
    const msgs = this.messages.get(channelId) || [];
    return msgs.slice(-limit);
  }

  async shareFile(teamId: string, filePath: string, sharedBy: string = 'system', description: string = ''): Promise<SharedFile> {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);
    if (!team.settings.fileSharingEnabled) {
      throw new Error('File sharing is disabled for this team');
    }
    const file: SharedFile = {
      id: uuidv4(),
      teamId,
      filePath,
      sharedBy,
      sharedAt: new Date(),
      description,
      accessCount: 0,
      lastAccessed: new Date(),
    };
    team.sharedFiles.push(file);
    team.updatedAt = new Date();
    this.saveData();
    this.emit('fileShared', file);
    return file;
  }

  async getSharedFiles(teamId: string): Promise<SharedFile[]> {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);
    return [...team.sharedFiles];
  }

  async startScreenShare(userId: string, username: string): Promise<ScreenShareSession> {
    const existing = this.screenShares.get(userId);
    if (existing) throw new Error(`User ${userId} is already sharing screen`);
    const session: ScreenShareSession = {
      userId,
      username,
      startedAt: new Date(),
      streamId: uuidv4(),
    };
    this.screenShares.set(userId, session);
    this.emit('screenShareStarted', session);
    return session;
  }

  async stopScreenShare(userId: string): Promise<void> {
    const session = this.screenShares.get(userId);
    if (!session) throw new Error(`User ${userId} is not sharing screen`);
    this.screenShares.delete(userId);
    this.emit('screenShareStopped', session);
  }

  async getCursors(teamId: string): Promise<CursorPosition[]> {
    return this.cursors.get(teamId) || [];
  }

  async updateCursor(teamId: string, userId: string, username: string, file: string, line: number, column: number, selection?: CursorPosition['selection']): Promise<CursorPosition> {
    if (!this.cursors.has(teamId)) {
      this.cursors.set(teamId, []);
    }
    const cursors = this.cursors.get(teamId)!;
    const idx = cursors.findIndex((c) => c.userId === userId);
    const cursor: CursorPosition = {
      userId,
      username,
      file,
      line,
      column,
      selection,
      timestamp: new Date(),
    };
    if (idx >= 0) {
      cursors[idx] = cursor;
    } else {
      cursors.push(cursor);
    }
    this.emit('cursorUpdated', cursor);
    return cursor;
  }

  async getTeam(teamId: string): Promise<Team | null> {
    return this.teams.get(teamId) || null;
  }

  async listTeams(): Promise<Team[]> {
    return Array.from(this.teams.values());
  }

  async deleteTeam(teamId: string): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);
    this.teams.delete(teamId);
    this.saveData();
    this.emit('teamDeleted', teamId);
  }

  private findTeamByName(name: string): Team | undefined {
    return Array.from(this.teams.values()).find((t) => t.name === name);
  }
}
