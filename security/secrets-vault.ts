import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SecretEntry {
  id: string;
  name: string;
  type: 'api_key' | 'password' | 'token' | 'certificate' | 'connection_string' | 'ssh_key' | 'custom';
  value: string;
  encryptedAt: Date;
  expiresAt?: Date;
  lastRotated?: Date;
  rotationIntervalMs?: number;
  metadata: Record<string, string>;
  accessLog: SecretAccessEntry[];
}

export interface SecretAccessEntry {
  secretId: string;
  agentId: string;
  agentType: string;
  action: 'read' | 'write' | 'rotate' | 'delete';
  timestamp: Date;
  success: boolean;
  ipAddress?: string;
}

export interface SecretAccessPolicy {
  secretName: string;
  allowedAgentTypes: string[];
  allowedAgentIds: string[];
  deniedAgentTypes: string[];
  deniedAgentIds: string[];
  requireApproval: boolean;
  maxReadsPerHour: number;
  allowInPrompt: boolean;
  allowInOutput: boolean;
  maskInLogs: boolean;
}

// ─── Encryption Helpers ───────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
}

function encryptAes256Gcm(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString('base64');
}

function decryptAes256Gcm(encoded: string, key: Buffer): string {
  const combined = Buffer.from(encoded, 'base64');
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

// ─── SecretsVault ─────────────────────────────────────────────────────────────

export class SecretsVault {
  private secrets: Map<string, SecretEntry> = new Map();
  private accessPolicies: Map<string, SecretAccessPolicy> = new Map();
  private encryptionKey: Buffer;
  private accessLog: SecretAccessEntry[] = [];
  private rotationTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(encryptionKey?: Buffer) {
    this.encryptionKey = encryptionKey ?? crypto.randomBytes(KEY_LENGTH);
  }

  // ── Secret Management ────────────────────────────────────────────────────

  async addSecret(
    name: string,
    value: string,
    type: SecretEntry['type'],
    metadata: Record<string, string> = {},
  ): Promise<string> {
    const id = crypto.randomUUID();
    const encryptedValue = this.encrypt(value);
    const now = new Date();

    const entry: SecretEntry = {
      id,
      name,
      type,
      value: encryptedValue,
      encryptedAt: now,
      metadata,
      accessLog: [],
    };

    this.secrets.set(id, entry);

    this.applyDefaultPolicy(name, type);

    return id;
  }

  async getSecret(secretId: string, agentId: string, agentType: string): Promise<string | null> {
    const entry = this.secrets.get(secretId);
    if (!entry) return null;

    if (!this.canAccessSecret(secretId, agentId, agentType)) {
      this.logAccess({ secretId, agentId, agentType, action: 'read', timestamp: new Date(), success: false });
      return null;
    }

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.logAccess({ secretId, agentId, agentType, action: 'read', timestamp: new Date(), success: false });
      return null;
    }

    if (!this.checkRateLimit(secretId, agentId)) {
      this.logAccess({ secretId, agentId, agentType, action: 'read', timestamp: new Date(), success: false });
      return null;
    }

    const plaintext = this.decrypt(entry.value);

    this.logAccess({ secretId, agentId, agentType, action: 'read', timestamp: new Date(), success: true });
    entry.accessLog.push({ secretId, agentId, agentType, action: 'read', timestamp: new Date(), success: true });

    return plaintext;
  }

  async updateSecret(secretId: string, value: string, agentId: string): Promise<void> {
    const entry = this.secrets.get(secretId);
    if (!entry) throw new Error(`Secret ${secretId} not found`);

    entry.value = this.encrypt(value);
    entry.encryptedAt = new Date();

    this.logAccess({ secretId, agentId, agentType: 'system', action: 'write', timestamp: new Date(), success: true });
    entry.accessLog.push({ secretId, agentId, agentType: 'system', action: 'write', timestamp: new Date(), success: true });
  }

  async deleteSecret(secretId: string, agentId: string): Promise<void> {
    const entry = this.secrets.get(secretId);
    if (!entry) throw new Error(`Secret ${secretId} not found`);

    this.cancelRotation(secretId);
    this.secrets.delete(secretId);
    this.accessPolicies.delete(secretId);

    this.logAccess({ secretId, agentId, agentType: 'system', action: 'delete', timestamp: new Date(), success: true });
  }

  async rotateSecret(secretId: string, newValue: string, agentId: string): Promise<void> {
    const entry = this.secrets.get(secretId);
    if (!entry) throw new Error(`Secret ${secretId} not found`);

    if (!this.canAccessSecret(secretId, agentId, 'system')) {
      throw new Error('Access denied for rotation');
    }

    entry.value = this.encrypt(newValue);
    entry.lastRotated = new Date();
    entry.encryptedAt = new Date();

    this.logAccess({ secretId, agentId, agentType: 'system', action: 'rotate', timestamp: new Date(), success: true });
    entry.accessLog.push({ secretId, agentId, agentType: 'system', action: 'rotate', timestamp: new Date(), success: true });
  }

  listSecrets(): { id: string; name: string; type: string; hasAccess: boolean }[] {
    const results: { id: string; name: string; type: string; hasAccess: boolean }[] = [];
    for (const [id, entry] of this.secrets) {
      results.push({
        id,
        name: entry.name,
        type: entry.type,
        hasAccess: true,
      });
    }
    return results;
  }

  getSecretMetadata(secretId: string): Omit<SecretEntry, 'value'> | null {
    const entry = this.secrets.get(secretId);
    if (!entry) return null;
    const { value, ...rest } = entry;
    return rest;
  }

  // ── Access Control ───────────────────────────────────────────────────────

  canAccessSecret(secretId: string, agentId: string, agentType: string): boolean {
    const entry = this.secrets.get(secretId);
    if (!entry) return false;

    const policy = this.accessPolicies.get(secretId) ?? this.accessPolicies.get(`__default_${entry.type}`);

    if (!policy) return true;

    if (policy.deniedAgentTypes.includes(agentType)) return false;
    if (policy.deniedAgentIds.includes(agentId)) return false;

    if (policy.allowedAgentTypes.length > 0 && !policy.allowedAgentTypes.includes(agentType)) return false;
    if (policy.allowedAgentIds.length > 0 && !policy.allowedAgentIds.includes(agentId)) return false;

    return true;
  }

  setAccessPolicy(secretId: string, policy: SecretAccessPolicy): void {
    this.accessPolicies.set(secretId, policy);
  }

  getAccessPolicy(secretId: string): SecretAccessPolicy | undefined {
    return this.accessPolicies.get(secretId);
  }

  checkRateLimit(secretId: string, agentId: string): boolean {
    const policy = this.accessPolicies.get(secretId);
    if (!policy) return true;
    if (policy.maxReadsPerHour <= 0) return true;

    const oneHourAgo = new Date(Date.now() - 3600_000);
    const recentReads = this.accessLog.filter(
      (e) =>
        e.secretId === secretId &&
        e.agentId === agentId &&
        e.action === 'read' &&
        e.success &&
        e.timestamp > oneHourAgo,
    );

    return recentReads.length < policy.maxReadsPerHour;
  }

  // ── Encryption ───────────────────────────────────────────────────────────

  private encrypt(value: string): string {
    return encryptAes256Gcm(value, this.encryptionKey);
  }

  private decrypt(encryptedValue: string): string {
    return decryptAes256Gcm(encryptedValue, this.encryptionKey);
  }

  private generateKey(): Buffer {
    return crypto.randomBytes(KEY_LENGTH);
  }

  async rotateEncryptionKey(): Promise<void> {
    const newKey = this.generateKey();
    const entries = Array.from(this.secrets.entries());

    for (const [id, entry] of entries) {
      const plaintext = this.decrypt(entry.value);
      this.encryptionKey = newKey;
      entry.value = this.encrypt(plaintext);
    }
  }

  // ── Masking ──────────────────────────────────────────────────────────────

  maskSecret(value: string): string {
    if (value.length <= 6) return '***';
    const prefix = value.substring(0, 3);
    const suffix = value.substring(value.length - 3);
    return `${prefix}${'.'.repeat(Math.min(value.length - 6, 8))}${suffix}`;
  }

  maskText(text: string): string {
    let masked = text;
    for (const [, entry] of this.secrets) {
      const plaintext = this.decrypt(entry.value);
      if (plaintext.length > 0 && masked.includes(plaintext)) {
        masked = masked.split(plaintext).join(this.maskSecret(plaintext));
      }
    }
    return masked;
  }

  containsSecret(text: string): boolean {
    for (const [, entry] of this.secrets) {
      const plaintext = this.decrypt(entry.value);
      if (plaintext.length > 0 && text.includes(plaintext)) return true;
    }
    return false;
  }

  redactSecrets(text: string): string {
    let redacted = text;
    for (const [, entry] of this.secrets) {
      const plaintext = this.decrypt(entry.value);
      if (plaintext.length > 0 && redacted.includes(plaintext)) {
        redacted = redacted.split(plaintext).join('[REDACTED]');
      }
    }
    return redacted;
  }

  // ── Rotation ─────────────────────────────────────────────────────────────

  scheduleRotation(secretId: string, intervalMs: number): void {
    this.cancelRotation(secretId);

    const timer = setInterval(async () => {
      const entry = this.secrets.get(secretId);
      if (entry) {
        entry.lastRotated = new Date();
      }
    }, intervalMs);

    this.rotationTimers.set(secretId, timer as unknown as NodeJS.Timeout);
  }

  cancelRotation(secretId: string): void {
    const timer = this.rotationTimers.get(secretId);
    if (timer) {
      clearInterval(timer);
      this.rotationTimers.delete(secretId);
    }
  }

  checkExpiredSecrets(): SecretEntry[] {
    const now = new Date();
    const expired: SecretEntry[] = [];
    for (const [, entry] of this.secrets) {
      if (entry.expiresAt && entry.expiresAt < now) {
        expired.push(entry);
      }
    }
    return expired;
  }

  getSecretsNeedingRotation(): SecretEntry[] {
    const now = new Date();
    const needsRotation: SecretEntry[] = [];
    for (const [, entry] of this.secrets) {
      if (entry.rotationIntervalMs && entry.lastRotated) {
        const nextRotation = new Date(entry.lastRotated.getTime() + entry.rotationIntervalMs);
        if (nextRotation <= now) {
          needsRotation.push(entry);
        }
      }
    }
    return needsRotation;
  }

  // ── Audit ────────────────────────────────────────────────────────────────

  logAccess(entry: SecretAccessEntry): void {
    this.accessLog.push(entry);
  }

  getAccessLog(secretId?: string, agentId?: string, limit?: number): SecretAccessEntry[] {
    let logs = [...this.accessLog];

    if (secretId) {
      const entry = this.secrets.get(secretId);
      if (entry) {
        logs = logs.filter((l) => entry.accessLog.some((e) => e.timestamp === l.timestamp));
      }
    }

    if (agentId) {
      logs = logs.filter((l) => l.agentId === agentId);
    }

    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (limit && limit > 0) {
      logs = logs.slice(0, limit);
    }

    return logs;
  }

  getAuditStats(): { totalAccess: number; byAgent: Record<string, number>; byType: Record<string, number> } {
    const byAgent: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const entry of this.accessLog) {
      byAgent[entry.agentId] = (byAgent[entry.agentId] ?? 0) + 1;
      byType[entry.action] = (byType[entry.action] ?? 0) + 1;
    }

    return { totalAccess: this.accessLog.length, byAgent, byType };
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  async exportVault(filePath: string, passphrase: string): Promise<void> {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(passphrase, salt);

    const data = {
      secrets: Array.from(this.secrets.entries()).map(([id, entry]) => [id, entry]),
      policies: Array.from(this.accessPolicies.entries()),
      accessLog: this.accessLog,
    };

    const plaintext = JSON.stringify(data);
    const encrypted = encryptAes256Gcm(plaintext, key);

    const envelope = {
      salt: salt.toString('base64'),
      data: encrypted,
      version: 1,
    };

    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(envelope), 'utf8');
  }

  async importVault(filePath: string, passphrase: string): Promise<void> {
    const raw = await fs.readFile(filePath, 'utf8');
    const envelope = JSON.parse(raw);

    if (envelope.version !== 1) throw new Error('Unsupported vault format version');

    const salt = Buffer.from(envelope.salt, 'base64');
    const key = deriveKey(passphrase, salt);

    const plaintext = decryptAes256Gcm(envelope.data, key);
    const data = JSON.parse(plaintext);

    this.secrets.clear();
    for (const [id, entry] of data.secrets) {
      entry.encryptedAt = new Date(entry.encryptedAt);
      if (entry.expiresAt) entry.expiresAt = new Date(entry.expiresAt);
      if (entry.lastRotated) entry.lastRotated = new Date(entry.lastRotated);
      for (const log of entry.accessLog) {
        log.timestamp = new Date(log.timestamp);
      }
      this.secrets.set(id, entry);
    }

    this.accessPolicies.clear();
    for (const [key, policy] of data.policies) {
      this.accessPolicies.set(key, policy);
    }

    this.accessLog = data.accessLog.map((e: SecretAccessEntry) => ({
      ...e,
      timestamp: new Date(e.timestamp),
    }));
  }

  // ── Internal Helpers ─────────────────────────────────────────────────────

  private applyDefaultPolicy(name: string, type: SecretEntry['type']): void {
    const defaults = DEFAULT_SECRETS_POLICY[type];
    if (defaults && !this.accessPolicies.has(name)) {
      this.accessPolicies.set(name, { ...defaults, secretName: name });
    }
  }
}

// ─── SecretInjector ───────────────────────────────────────────────────────────

export class SecretInjector {
  private vault: SecretsVault;

  constructor(vault: SecretsVault) {
    this.vault = vault;
  }

  async injectSecretsIntoPrompt(
    prompt: string,
    agentId: string,
    agentType: string,
    secretNames: string[],
  ): Promise<string> {
    let result = prompt;

    for (const secretName of secretNames) {
      const secretId = this.findSecretIdByName(secretName);
      if (!secretId) continue;

      const policy = this.vault.getAccessPolicy(secretId);
      if (policy && !policy.allowInPrompt) continue;

      if (!this.vault.canAccessSecret(secretId, agentId, agentType)) continue;

      const value = await this.vault.getSecret(secretId, agentId, agentType);
      if (!value) continue;

      const placeholder = `{{SECRET:${secretName}}}`;
      result = result.split(placeholder).join(value);
    }

    return result;
  }

  async injectSecretsIntoEnv(
    env: Record<string, string>,
    agentId: string,
    agentType: string,
    secretNames: string[],
  ): Promise<Record<string, string>> {
    const result = { ...env };

    for (const secretName of secretNames) {
      const secretId = this.findSecretIdByName(secretName);
      if (!secretId) continue;

      if (!this.vault.canAccessSecret(secretId, agentId, agentType)) continue;

      const value = await this.vault.getSecret(secretId, agentId, agentType);
      if (!value) continue;

      const envKey = secretName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      result[envKey] = value;
    }

    return result;
  }

  sanitizeOutput(output: string, agentId: string): string {
    return this.vault.redactSecrets(output);
  }

  sanitizeLogs(logs: string[]): string[] {
    return logs.map((log) => this.vault.maskText(log));
  }

  createSecretReference(secretId: string): string {
    const entry = this.vault.getSecretMetadata(secretId);
    if (!entry) return '';
    return `vault://secret/${entry.name}/${secretId.substring(0, 8)}`;
  }

  private findSecretIdByName(name: string): string | null {
    const secrets = this.vault.listSecrets();
    const match = secrets.find((s) => s.name === name);
    return match?.id ?? null;
  }
}

// ─── Default Policies ─────────────────────────────────────────────────────────

const DEFAULT_SECRETS_POLICY: Record<string, SecretAccessPolicy> = {
  api_key: {
    secretName: '__default_api_key',
    allowedAgentTypes: ['feature-coder', 'api-designer'],
    allowedAgentIds: [],
    deniedAgentTypes: [],
    deniedAgentIds: [],
    requireApproval: true,
    maxReadsPerHour: 10,
    allowInPrompt: false,
    allowInOutput: false,
    maskInLogs: true,
  },
  password: {
    secretName: '__default_database',
    allowedAgentTypes: ['database-architect', 'data-engineer'],
    allowedAgentIds: [],
    deniedAgentTypes: [],
    deniedAgentIds: [],
    requireApproval: true,
    maxReadsPerHour: 5,
    allowInPrompt: false,
    allowInOutput: false,
    maskInLogs: true,
  },
  connection_string: {
    secretName: '__default_connection_string',
    allowedAgentTypes: ['database-architect', 'data-engineer'],
    allowedAgentIds: [],
    deniedAgentTypes: [],
    deniedAgentIds: [],
    requireApproval: true,
    maxReadsPerHour: 5,
    allowInPrompt: false,
    allowInOutput: false,
    maskInLogs: true,
  },
  token: {
    secretName: '__default_token',
    allowedAgentTypes: ['deployer', 'kubernetes-engineer'],
    allowedAgentIds: [],
    deniedAgentTypes: [],
    deniedAgentIds: [],
    requireApproval: true,
    maxReadsPerHour: 10,
    allowInPrompt: false,
    allowInOutput: false,
    maskInLogs: true,
  },
  certificate: {
    secretName: '__default_certificate',
    allowedAgentTypes: ['deployer', 'kubernetes-engineer'],
    allowedAgentIds: [],
    deniedAgentTypes: [],
    deniedAgentIds: [],
    requireApproval: true,
    maxReadsPerHour: 5,
    allowInPrompt: false,
    allowInOutput: false,
    maskInLogs: true,
  },
  ssh_key: {
    secretName: '__default_ssh_key',
    allowedAgentTypes: ['deployer', 'kubernetes-engineer'],
    allowedAgentIds: [],
    deniedAgentTypes: [],
    deniedAgentIds: [],
    requireApproval: true,
    maxReadsPerHour: 3,
    allowInPrompt: false,
    allowInOutput: false,
    maskInLogs: true,
  },
  custom: {
    secretName: '__default_custom',
    allowedAgentTypes: [],
    allowedAgentIds: [],
    deniedAgentTypes: [],
    deniedAgentIds: [],
    requireApproval: true,
    maxReadsPerHour: 10,
    allowInPrompt: false,
    allowInOutput: false,
    maskInLogs: true,
  },
};

export { DEFAULT_SECRETS_POLICY };
