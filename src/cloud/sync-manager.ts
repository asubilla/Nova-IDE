import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export type CloudProvider = 'nova-cloud' | 's3' | 'gcs' | 'azure-blob';

export interface CloudCredentials {
  username: string;
  password?: string;
  token?: string;
  apiKey?: string;
  region?: string;
  bucket?: string;
  endpoint?: string;
}

export interface CloudUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  createdAt: Date;
  lastLogin: Date;
  storageUsed: number;
  storageLimit: number;
  plan: 'free' | 'pro' | 'enterprise';
}

export interface CloudProject {
  id: string;
  name: string;
  description: string;
  owner: string;
  path: string;
  files: ProjectFile[];
  sharedWith: string[];
  createdAt: Date;
  updatedAt: Date;
  version: number;
  size: number;
  isPublic: boolean;
}

export interface ProjectFile {
  path: string;
  size: number;
  checksum: string;
  lastModified: Date;
  syncedAt: Date | null;
  status: 'synced' | 'modified' | 'conflict' | 'new' | 'deleted';
}

export interface SyncStatus {
  projectId: string;
  isSyncing: boolean;
  lastSync: Date | null;
  pendingChanges: number;
  conflicts: number;
  syncedFiles: number;
  totalFiles: number;
  syncDirection: 'upload' | 'download' | 'bidirectional';
}

export interface SyncConflict {
  id: string;
  projectId: string;
  filePath: string;
  localVersion: ProjectFile;
  remoteVersion: ProjectFile;
  detectedAt: Date;
  resolved: boolean;
  resolution?: 'local' | 'remote' | 'merge';
}

export interface Backup {
  id: string;
  projectId: string;
  name: string;
  description: string;
  createdAt: Date;
  size: number;
  fileCount: number;
  checksum: string;
}

export interface SyncConfig {
  provider: CloudProvider;
  credentials: CloudCredentials;
  autoSync: boolean;
  syncInterval: number;
  encryptionEnabled: boolean;
  compressionEnabled: boolean;
  excludePatterns: string[];
}

const DATA_DIR = join(process.cwd(), '.nova', 'cloud');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

export class SyncManager extends EventEmitter {
  private config: SyncConfig;
  private user: CloudUser | null = null;
  private projects: Map<string, CloudProject> = new Map();
  private syncStatuses: Map<string, SyncStatus> = new Map();
  private conflicts: Map<string, SyncConflict[]> = new Map();
  private backups: Map<string, Backup[]> = new Map();
  private dataDir: string;
  private encryptionKey: Buffer;

  constructor(config?: Partial<SyncConfig>) {
    super();
    this.config = {
      provider: config?.provider || 'nova-cloud',
      credentials: config?.credentials || { username: '' },
      autoSync: config?.autoSync ?? false,
      syncInterval: config?.syncInterval ?? 30000,
      encryptionEnabled: config?.encryptionEnabled ?? false,
      compressionEnabled: config?.compressionEnabled ?? false,
      excludePatterns: config?.excludePatterns || ['node_modules', '.git', 'dist', '__pycache__'],
    };
    this.dataDir = config?.credentials?.endpoint || DATA_DIR;
    this.encryptionKey = randomBytes(KEY_LENGTH);
    this.ensureDirectories();
    this.loadState();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private loadState(): void {
    const statePath = join(this.dataDir, 'sync-state.json');
    if (existsSync(statePath)) {
      try {
        const data = JSON.parse(readFileSync(statePath, 'utf-8'));
        if (data.user) {
          this.user = { ...data.user, createdAt: new Date(data.user.createdAt), lastLogin: new Date(data.user.lastLogin) };
        }
        if (data.projects) {
          for (const [id, proj] of Object.entries(data.projects)) {
            const p = proj as CloudProject;
            p.createdAt = new Date(p.createdAt);
            p.updatedAt = new Date(p.updatedAt);
            p.files = p.files.map((f: ProjectFile) => ({
              ...f,
              lastModified: new Date(f.lastModified),
              syncedAt: f.syncedAt ? new Date(f.syncedAt) : null,
            }));
            this.projects.set(id, p);
          }
        }
      } catch {
        /* ignore corrupt state */
      }
    }
  }

  private saveState(): void {
    const statePath = join(this.dataDir, 'sync-state.json');
    const data: Record<string, unknown> = {};
    if (this.user) data.user = this.user;
    const projectsObj: Record<string, CloudProject> = {};
    for (const [id, proj] of this.projects) {
      projectsObj[id] = proj;
    }
    data.projects = projectsObj;
    writeFileSync(statePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async login(credentials: CloudCredentials): Promise<CloudUser> {
    const user: CloudUser = {
      id: uuidv4(),
      username: credentials.username,
      email: `${credentials.username}@nova.cloud`,
      displayName: credentials.username,
      createdAt: new Date(),
      lastLogin: new Date(),
      storageUsed: 0,
      storageLimit: 5 * 1024 * 1024 * 1024,
      plan: 'free',
    };
    this.user = user;
    this.config.credentials = credentials;
    this.saveState();
    this.emit('loggedIn', user);
    return user;
  }

  async logout(): Promise<void> {
    const prev = this.user;
    this.user = null;
    this.saveState();
    this.emit('loggedOut', prev);
  }

  async register(userData: { username: string; email: string; password: string; displayName?: string }): Promise<CloudUser> {
    const user: CloudUser = {
      id: uuidv4(),
      username: userData.username,
      email: userData.email,
      displayName: userData.displayName || userData.username,
      createdAt: new Date(),
      lastLogin: new Date(),
      storageUsed: 0,
      storageLimit: 5 * 1024 * 1024 * 1024,
      plan: 'free',
    };
    this.user = user;
    this.saveState();
    this.emit('registered', user);
    return user;
  }

  async syncProject(projectPath: string, name?: string): Promise<CloudProject> {
    this.ensureAuthenticated();
    const projectId = this.findProjectByPath(projectPath)?.id || uuidv4();
    const files = await this.scanDirectory(projectPath);
    const project: CloudProject = {
      id: projectId,
      name: name || basename(projectPath),
      description: '',
      owner: this.user!.id,
      path: projectPath,
      files,
      sharedWith: [],
      createdAt: this.projects.get(projectId)?.createdAt || new Date(),
      updatedAt: new Date(),
      version: (this.projects.get(projectId)?.version || 0) + 1,
      size: files.reduce((sum, f) => sum + f.size, 0),
      isPublic: false,
    };
    this.projects.set(projectId, project);
    this.syncStatuses.set(projectId, {
      projectId,
      isSyncing: true,
      lastSync: new Date(),
      pendingChanges: 0,
      conflicts: 0,
      syncedFiles: files.length,
      totalFiles: files.length,
      syncDirection: 'upload',
    });
    this.saveState();
    this.emit('projectSynced', project);
    return project;
  }

  async pullProject(projectId: string): Promise<CloudProject> {
    this.ensureAuthenticated();
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    this.syncStatuses.set(projectId, {
      projectId,
      isSyncing: true,
      lastSync: new Date(),
      pendingChanges: 0,
      conflicts: 0,
      syncedFiles: project.files.length,
      totalFiles: project.files.length,
      syncDirection: 'download',
    });
    this.emit('projectPulled', project);
    return project;
  }

  async getProjects(): Promise<CloudProject[]> {
    this.ensureAuthenticated();
    return Array.from(this.projects.values()).filter((p) => p.owner === this.user!.id);
  }

  async deleteProject(projectId: string): Promise<void> {
    this.ensureAuthenticated();
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    if (project.owner !== this.user!.id) throw new Error('Only the owner can delete a project');
    this.projects.delete(projectId);
    this.syncStatuses.delete(projectId);
    this.conflicts.delete(projectId);
    this.backups.delete(projectId);
    this.saveState();
    this.emit('projectDeleted', projectId);
  }

  async shareProject(projectId: string, userIds: string[]): Promise<CloudProject> {
    this.ensureAuthenticated();
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    for (const userId of userIds) {
      if (!project.sharedWith.includes(userId)) {
        project.sharedWith.push(userId);
      }
    }
    project.updatedAt = new Date();
    this.saveState();
    this.emit('projectShared', { projectId, userIds });
    return project;
  }

  async getSyncStatus(projectId?: string): Promise<SyncStatus | SyncStatus[]> {
    if (projectId) {
      const status = this.syncStatuses.get(projectId);
      if (!status) throw new Error(`No sync status for project ${projectId}`);
      return status;
    }
    return Array.from(this.syncStatuses.values());
  }

  async forceSync(projectId: string): Promise<SyncStatus> {
    this.ensureAuthenticated();
    const status = this.syncStatuses.get(projectId);
    if (!status) throw new Error(`Project ${projectId} not found`);
    status.isSyncing = true;
    status.lastSync = new Date();
    status.pendingChanges = 0;
    status.syncedFiles = status.totalFiles;
    this.syncStatuses.set(projectId, status);
    this.emit('forceSyncComplete', status);
    return status;
  }

  async resolveConflicts(projectId: string, conflictId: string, resolution: 'local' | 'remote' | 'merge'): Promise<SyncConflict> {
    const projectConflicts = this.conflicts.get(projectId);
    if (!projectConflicts) throw new Error(`No conflicts for project ${projectId}`);
    const conflict = projectConflicts.find((c) => c.id === conflictId);
    if (!conflict) throw new Error(`Conflict ${conflictId} not found`);
    conflict.resolved = true;
    conflict.resolution = resolution;
    this.conflicts.set(projectId, projectConflicts);
    this.emit('conflictResolved', conflict);
    return conflict;
  }

  async getBackups(projectId: string): Promise<Backup[]> {
    return this.backups.get(projectId) || [];
  }

  async restoreBackup(projectId: string, backupId: string): Promise<Backup> {
    const backups = this.backups.get(projectId) || [];
    const backup = backups.find((b) => b.id === backupId);
    if (!backup) throw new Error(`Backup ${backupId} not found`);
    this.emit('backupRestored', backup);
    return backup;
  }

  async encryptData(data: string): Promise<string> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  async decryptData(encryptedData: string): Promise<string> {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted data format');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async getConfig(): Promise<SyncConfig> {
    return { ...this.config };
  }

  async updateConfig(updates: Partial<SyncConfig>): Promise<SyncConfig> {
    this.config = { ...this.config, ...updates };
    this.saveState();
    return this.config;
  }

  getUser(): CloudUser | null {
    return this.user;
  }

  isAuthenticated(): boolean {
    return this.user !== null;
  }

  private ensureAuthenticated(): void {
    if (!this.user) throw new Error('Not authenticated. Please login first.');
  }

  private findProjectByPath(path: string): CloudProject | undefined {
    return Array.from(this.projects.values()).find((p) => p.path === path);
  }

  private async scanDirectory(dirPath: string): Promise<ProjectFile[]> {
    const files: ProjectFile[] = [];
    try {
      const entries = readdirSync(dirPath);
      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (!this.config.excludePatterns.includes(entry)) {
            const subFiles = await this.scanDirectory(fullPath);
            files.push(...subFiles);
          }
        } else {
          const relPath = relative(dirPath, fullPath);
          const content = readFileSync(fullPath);
          files.push({
            path: relPath,
            size: stat.size,
            checksum: createHash('sha256').update(content).digest('hex'),
            lastModified: stat.mtime,
            syncedAt: null,
            status: 'new',
          });
        }
      }
    } catch {
      /* directory not accessible */
    }
    return files;
  }
}
