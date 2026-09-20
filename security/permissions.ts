export enum ToolPermissionLevel {
  DENIED = 0,
  READ_ONLY = 1,
  WRITE_LIMITED = 2,
  WRITE_FULL = 3,
  EXECUTE_LIMITED = 4,
  EXECUTE_FULL = 5,
  ADMIN = 6,
}

export enum PermissionDecision {
  DENY = 'deny',
  ALLOW = 'allow',
  ALLOW_ONCE = 'allow_once',
  ALLOW_WITH_AUDIT = 'allow_with_audit',
  ASK_USER = 'ask_user',
}

export interface PermissionCondition {
  type:
    | 'path'
    | 'command'
    | 'domain'
    | 'file_extension'
    | 'file_size'
    | 'time_of_day'
    | 'concurrent_invocations';
  operator:
    | 'equals'
    | 'not_equals'
    | 'starts_with'
    | 'contains'
    | 'matches_regex'
    | 'lt'
    | 'gt'
    | 'in';
  value: string | number | string[];
  negate: boolean;
}

export interface ToolPermission {
  tool: string;
  level: ToolPermissionLevel;
  conditions: PermissionCondition[];
  autoAccept: boolean;
  requiresApproval: boolean;
  maxInvocationsPerHour: number;
  allowedCommands?: string[];
  blockedCommands?: string[];
  allowedPaths?: string[];
  blockedPaths?: string[];
  allowedDomains?: string[];
  blockedDomains?: string[];
  rateLimitMs: number;
}

export interface PermissionRequest {
  agentId: string;
  agentType: string;
  tool: string;
  action: string;
  target: string;
  context: Record<string, any>;
  timestamp: Date;
  riskScore: number;
}

export interface PermissionAuditEntry {
  requestId: string;
  agentId: string;
  agentType: string;
  tool: string;
  action: string;
  target: string;
  decision: PermissionDecision;
  reason: string;
  riskScore: number;
  timestamp: Date;
  duration: number;
}

export interface AutoAcceptRule {
  id: string;
  name: string;
  description: string;
  agentTypes: string[];
  tools: string[];
  conditions: PermissionCondition[];
  maxInvocationsPerHour: number;
  requiresLogging: boolean;
  expiresAt?: Date;
  priority: number;
}

// ── Helper Factories ─────────────────────────────────────────────

function createBasePermission(
  tool: string,
  level: ToolPermissionLevel,
  overrides: Partial<ToolPermission> = {}
): ToolPermission {
  return {
    tool,
    level,
    conditions: [],
    autoAccept: false,
    requiresApproval: false,
    maxInvocationsPerHour: 100,
    rateLimitMs: 0,
    ...overrides,
  };
}

function readPermission(overrides: Partial<ToolPermission> = {}): ToolPermission {
  return createBasePermission('read', ToolPermissionLevel.READ_ONLY, overrides);
}

function writePermission(overrides: Partial<ToolPermission> = {}): ToolPermission {
  return createBasePermission('write', ToolPermissionLevel.WRITE_LIMITED, overrides);
}

function editPermission(overrides: Partial<ToolPermission> = {}): ToolPermission {
  return createBasePermission('edit', ToolPermissionLevel.WRITE_LIMITED, overrides);
}

function bashPermission(overrides: Partial<ToolPermission> = {}): ToolPermission {
  return createBasePermission('bash', ToolPermissionLevel.EXECUTE_LIMITED, overrides);
}

function globPermission(overrides: Partial<ToolPermission> = {}): ToolPermission {
  return createBasePermission('glob', ToolPermissionLevel.READ_ONLY, overrides);
}

function grepPermission(overrides: Partial<ToolPermission> = {}): ToolPermission {
  return createBasePermission('grep', ToolPermissionLevel.READ_ONLY, overrides);
}

function webfetchPermission(overrides: Partial<ToolPermission> = {}): ToolPermission {
  return createBasePermission('webfetch', ToolPermissionLevel.READ_ONLY, overrides);
}

function websearchPermission(overrides: Partial<ToolPermission> = {}): ToolPermission {
  return createBasePermission('websearch', ToolPermissionLevel.READ_ONLY, overrides);
}

// ── Default Permission Presets ──────────────────────────────────

export const DEFAULT_PERMISSIONS: Record<string, ToolPermission[]> = {
  planner: [
    readPermission({ autoAccept: true }),
    globPermission({ autoAccept: true }),
    grepPermission({ autoAccept: true }),
  ],

  architect: [
    readPermission({ autoAccept: true }),
    writePermission({
      autoAccept: false,
      requiresApproval: true,
      blockedPaths: ['node_modules', '.git', 'dist', 'build'],
    }),
    editPermission({
      autoAccept: false,
      requiresApproval: true,
      blockedPaths: ['node_modules', '.git', 'dist', 'build'],
    }),
    bashPermission({
      allowedCommands: ['npm', 'npx', 'node', 'yarn', 'pnpm'],
      blockedCommands: ['rm -rf', 'sudo', 'chmod', 'chown', 'kill'],
      rateLimitMs: 1000,
    }),
    globPermission({ autoAccept: true }),
    grepPermission({ autoAccept: true }),
    webfetchPermission({ autoAccept: true }),
  ],

  'feature-coder': [
    readPermission({ autoAccept: true }),
    writePermission({
      autoAccept: false,
      blockedPaths: ['node_modules', '.git', '.env', 'dist', 'build'],
    }),
    editPermission({
      autoAccept: false,
      blockedPaths: ['node_modules', '.git', '.env', 'dist', 'build'],
    }),
    bashPermission({
      allowedCommands: ['npm', 'npx', 'node', 'yarn', 'pnpm', 'git'],
      blockedCommands: ['rm -rf /', 'sudo', 'chmod', 'chown', 'kill', 'shutdown', 'reboot'],
      rateLimitMs: 500,
      maxInvocationsPerHour: 200,
    }),
    globPermission({ autoAccept: true }),
    grepPermission({ autoAccept: true }),
    webfetchPermission({ autoAccept: true }),
  ],

  'test-writer': [
    readPermission({ autoAccept: true }),
    writePermission({
      allowedPaths: ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**', '**/__tests__/**'],
      blockedPaths: ['src', 'lib'],
    }),
    editPermission({
      allowedPaths: ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**', '**/__tests__/**'],
      blockedPaths: ['src', 'lib'],
    }),
    bashPermission({
      allowedCommands: ['npm test', 'npx jest', 'npx vitest', 'npx mocha', 'yarn test', 'pnpm test'],
      blockedCommands: ['rm', 'sudo', 'chmod', 'kill'],
      rateLimitMs: 2000,
      maxInvocationsPerHour: 50,
    }),
    globPermission({ autoAccept: true }),
    grepPermission({ autoAccept: true }),
  ],

  'security-scanner': [
    readPermission({ autoAccept: true }),
    grepPermission({ autoAccept: true }),
    globPermission({ autoAccept: true }),
    bashPermission({
      allowedCommands: ['npm audit', 'npx semgrep', 'npx eslint', 'yarn audit', 'pnpm audit'],
      blockedCommands: ['rm', 'sudo', 'chmod', 'kill', 'write', 'edit'],
      rateLimitMs: 5000,
      maxInvocationsPerHour: 30,
    }),
  ],

  'doc-generator': [
    readPermission({ autoAccept: true }),
    writePermission({
      allowedPaths: ['**/*.md', '**/*.mdx', '**/docs/**', '**/README*'],
      blockedPaths: ['src', 'lib', 'node_modules', '.git'],
    }),
    editPermission({
      allowedPaths: ['**/*.md', '**/*.mdx', '**/docs/**', '**/README*'],
      blockedPaths: ['src', 'lib', 'node_modules', '.git'],
    }),
    globPermission({ autoAccept: true }),
    grepPermission({ autoAccept: true }),
  ],

  'code-reviewer': [
    readPermission({ autoAccept: true }),
    grepPermission({ autoAccept: true }),
    globPermission({ autoAccept: true }),
  ],

  dockerizer: [
    readPermission({ autoAccept: true }),
    writePermission({
      allowedPaths: ['**/Dockerfile*', '**/docker-compose*', '**/.dockerignore', '**/docker/**'],
    }),
    editPermission({
      allowedPaths: ['**/Dockerfile*', '**/docker-compose*', '**/.dockerignore', '**/docker/**'],
    }),
    bashPermission({
      allowedCommands: ['docker', 'docker-compose', 'docker compose'],
      blockedCommands: ['rm -rf', 'sudo', 'chmod', 'kill', 'shutdown'],
      rateLimitMs: 2000,
      maxInvocationsPerHour: 50,
    }),
    globPermission({ autoAccept: true }),
    grepPermission({ autoAccept: true }),
  ],

  'kubernetes-engineer': [
    readPermission({ autoAccept: true }),
    writePermission({
      allowedPaths: ['**/*.yaml', '**/*.yml', '**/k8s/**', '**/kubernetes/**', '**/helm/**', '**/charts/**'],
    }),
    editPermission({
      allowedPaths: ['**/*.yaml', '**/*.yml', '**/k8s/**', '**/kubernetes/**', '**/helm/**', '**/charts/**'],
    }),
    bashPermission({
      allowedCommands: ['kubectl', 'helm', 'kubectx', 'kubens', 'kustomize'],
      blockedCommands: ['rm -rf', 'sudo', 'chmod', 'kill', 'shutdown', 'docker rm'],
      rateLimitMs: 1000,
      maxInvocationsPerHour: 100,
    }),
    globPermission({ autoAccept: true }),
    grepPermission({ autoAccept: true }),
  ],

  deployer: [
    readPermission({ autoAccept: true }),
    writePermission({
      allowedPaths: ['**/deploy/**', '**/deployment/**', '**/*.yaml', '**/*.yml'],
    }),
    editPermission({
      allowedPaths: ['**/deploy/**', '**/deployment/**', '**/*.yaml', '**/*.yml'],
    }),
    bashPermission({
      allowedCommands: ['kubectl', 'docker', 'aws', 'gcloud', 'az', 'helm', 'terraform'],
      blockedCommands: ['rm -rf', 'sudo', 'chmod', 'kill', 'shutdown'],
      rateLimitMs: 2000,
      maxInvocationsPerHour: 80,
      requiresApproval: true,
    }),
    globPermission({ autoAccept: true }),
    grepPermission({ autoAccept: true }),
  ],

  'bug-fixer': [
    readPermission({ autoAccept: true }),
    editPermission({
      autoAccept: false,
      blockedPaths: ['node_modules', '.git', '.env', 'dist', 'build'],
    }),
    bashPermission({
      allowedCommands: ['npm', 'npx', 'node', 'git', 'yarn', 'pnpm'],
      blockedCommands: ['rm -rf', 'sudo', 'chmod', 'kill', 'shutdown'],
      rateLimitMs: 500,
      maxInvocationsPerHour: 150,
    }),
    globPermission({ autoAccept: true }),
    grepPermission({ autoAccept: true }),
  ],

  refactorer: [
    readPermission({ autoAccept: true }),
    editPermission({
      autoAccept: false,
      blockedPaths: ['node_modules', '.git', '.env', 'dist', 'build', '**/*.test.*', '**/*.spec.*'],
    }),
    bashPermission({
      allowedCommands: ['npm', 'npx', 'node', 'yarn', 'pnpm'],
      blockedCommands: ['rm -rf', 'sudo', 'chmod', 'kill', 'shutdown'],
      rateLimitMs: 500,
      maxInvocationsPerHour: 100,
    }),
    globPermission({ autoAccept: true }),
    grepPermission({ autoAccept: true }),
  ],
};

const DEFAULT_UNKNOWN_AGENT: ToolPermission[] = [
  readPermission({ autoAccept: true }),
  writePermission({
    autoAccept: false,
    requiresApproval: true,
    blockedPaths: ['node_modules', '.git', '.env', 'dist', 'build', '**/*.env*'],
    rateLimitMs: 1000,
    maxInvocationsPerHour: 50,
  }),
  globPermission({ autoAccept: true }),
  grepPermission({ autoAccept: true }),
];

let requestIdCounter = 0;

function generateRequestId(): string {
  requestIdCounter += 1;
  return `req_${Date.now()}_${requestIdCounter}`;
}

export class PermissionManager {
  private permissions: Map<string, ToolPermission[]>;
  private globalPermissions: ToolPermission[];
  private invocationCounts: Map<string, { count: number; windowStart: Date }>;
  private auditLog: PermissionAuditEntry[];
  private autoAcceptRules: AutoAcceptRule[];
  private userApprovalQueue: PermissionRequest[];
  private maxAuditLogSize: number;

  constructor() {
    this.permissions = new Map();
    this.globalPermissions = [];
    this.invocationCounts = new Map();
    this.auditLog = [];
    this.autoAcceptRules = [];
    this.userApprovalQueue = [];
    this.maxAuditLogSize = 10000;

    for (const [agentType, perms] of Object.entries(DEFAULT_PERMISSIONS)) {
      this.permissions.set(agentType, perms);
    }
  }

  // ── Configuration ──────────────────────────────────────────────

  registerPermissions(agentType: string, permissions: ToolPermission[]): void {
    const existing = this.permissions.get(agentType) || [];
    const merged = [...existing];

    for (const perm of permissions) {
      const idx = merged.findIndex((p) => p.tool === perm.tool);
      if (idx >= 0) {
        merged[idx] = perm;
      } else {
        merged.push(perm);
      }
    }

    this.permissions.set(agentType, merged);
  }

  setGlobalPermissions(permissions: ToolPermission[]): void {
    this.globalPermissions = [...permissions];
  }

  addAutoAcceptRule(rule: AutoAcceptRule): void {
    const idx = this.autoAcceptRules.findIndex((r) => r.id === rule.id);
    if (idx >= 0) {
      this.autoAcceptRules[idx] = rule;
    } else {
      this.autoAcceptRules.push(rule);
    }
    this.autoAcceptRules.sort((a, b) => b.priority - a.priority);
  }

  removeAutoAcceptRule(ruleId: string): void {
    this.autoAcceptRules = this.autoAcceptRules.filter((r) => r.id !== ruleId);
  }

  // ── Permission Checking ────────────────────────────────────────

  checkPermission(request: PermissionRequest): PermissionDecision {
    const start = Date.now();
    const requestId = generateRequestId();

    if (this.shouldAutoAccept(request)) {
      this.incrementInvocationCount(request.agentId, request.tool);
      const entry: PermissionAuditEntry = {
        requestId,
        agentId: request.agentId,
        agentType: request.agentType,
        tool: request.tool,
        action: request.action,
        target: request.target,
        decision: PermissionDecision.ALLOW,
        reason: 'Auto-accepted by rule',
        riskScore: request.riskScore,
        timestamp: new Date(),
        duration: Date.now() - start,
      };
      this.logDecision(entry);
      return PermissionDecision.ALLOW;
    }

    if (!this.checkRateLimit(request.agentId, request.tool)) {
      const entry: PermissionAuditEntry = {
        requestId,
        agentId: request.agentId,
        agentType: request.agentType,
        tool: request.tool,
        action: request.action,
        target: request.target,
        decision: PermissionDecision.DENY,
        reason: 'Rate limit exceeded',
        riskScore: request.riskScore,
        timestamp: new Date(),
        duration: Date.now() - start,
      };
      this.logDecision(entry);
      return PermissionDecision.DENY;
    }

    const decision = this.evaluateToolPermission(
      request.agentType,
      request.tool,
      request.context
    );

    if (decision === PermissionDecision.ALLOW || decision === PermissionDecision.ALLOW_ONCE) {
      this.incrementInvocationCount(request.agentId, request.tool);
    }

    if (decision === PermissionDecision.ALLOW_WITH_AUDIT) {
      this.incrementInvocationCount(request.agentId, request.tool);
    }

    const entry: PermissionAuditEntry = {
      requestId,
      agentId: request.agentId,
      agentType: request.agentType,
      tool: request.tool,
      action: request.action,
      target: request.target,
      decision,
      reason: this.getDecisionReason(decision),
      riskScore: request.riskScore,
      timestamp: new Date(),
      duration: Date.now() - start,
    };
    this.logDecision(entry);

    return decision;
  }

  evaluateToolPermission(
    agentType: string,
    tool: string,
    context: Record<string, any>
  ): PermissionDecision {
    const agentPerms = this.permissions.get(agentType) || DEFAULT_UNKNOWN_AGENT;
    const allPerms = [...agentPerms, ...this.globalPermissions];
    const matchingPerms = allPerms.filter((p) => p.tool === tool);

    if (matchingPerms.length === 0) {
      return PermissionDecision.DENY;
    }

    for (const perm of matchingPerms) {
      if (perm.level === ToolPermissionLevel.DENIED) {
        return PermissionDecision.DENY;
      }

      if (!this.evaluateConditions(perm.conditions, context)) {
        continue;
      }

      if (perm.requiresApproval) {
        return PermissionDecision.ASK_USER;
      }

      if (perm.autoAccept) {
        if (perm.level >= ToolPermissionLevel.EXECUTE_LIMITED) {
          return PermissionDecision.ALLOW_WITH_AUDIT;
        }
        return PermissionDecision.ALLOW;
      }

      if (perm.level >= ToolPermissionLevel.READ_ONLY) {
        if (context.path) {
          if (!this.evaluatePathPermission(context.path, perm.allowedPaths, perm.blockedPaths)) {
            continue;
          }
        }
        if (context.command) {
          if (
            !this.evaluateCommandPermission(
              context.command,
              perm.allowedCommands,
              perm.blockedCommands
            )
          ) {
            continue;
          }
        }
        if (context.domain) {
          if (
            !this.evaluateDomainPermission(
              context.domain,
              perm.allowedDomains,
              perm.blockedDomains
            )
          ) {
            continue;
          }
        }

        if (perm.level >= ToolPermissionLevel.WRITE_LIMITED && context.action === 'write') {
          return PermissionDecision.ALLOW_WITH_AUDIT;
        }
        if (perm.level >= ToolPermissionLevel.EXECUTE_LIMITED && context.action === 'execute') {
          return PermissionDecision.ALLOW_WITH_AUDIT;
        }
        if (perm.level >= ToolPermissionLevel.ADMIN) {
          return PermissionDecision.ALLOW;
        }

        return PermissionDecision.ALLOW;
      }
    }

    return PermissionDecision.DENY;
  }

  evaluateConditions(
    conditions: PermissionCondition[],
    context: Record<string, any>
  ): boolean {
    if (conditions.length === 0) return true;

    return conditions.every((cond) => {
      const ctxValue = context[cond.type];
      if (ctxValue === undefined) return !cond.negate;

      let matches = false;

      switch (cond.operator) {
        case 'equals':
          matches = ctxValue === cond.value;
          break;
        case 'not_equals':
          matches = ctxValue !== cond.value;
          break;
        case 'starts_with':
          matches =
            typeof ctxValue === 'string' &&
            typeof cond.value === 'string' &&
            ctxValue.startsWith(cond.value);
          break;
        case 'contains':
          matches =
            typeof ctxValue === 'string' &&
            typeof cond.value === 'string' &&
            ctxValue.includes(cond.value);
          break;
        case 'matches_regex':
          matches =
            typeof ctxValue === 'string' &&
            typeof cond.value === 'string' &&
            new RegExp(cond.value).test(ctxValue);
          break;
        case 'lt':
          matches = typeof ctxValue === 'number' && ctxValue < (cond.value as number);
          break;
        case 'gt':
          matches = typeof ctxValue === 'number' && ctxValue > (cond.value as number);
          break;
        case 'in':
          matches =
            typeof ctxValue === 'string' &&
            Array.isArray(cond.value) &&
            cond.value.includes(ctxValue);
          break;
        default:
          matches = false;
      }

      return cond.negate ? !matches : matches;
    });
  }

  evaluatePathPermission(
    path: string,
    allowedPaths?: string[],
    blockedPaths?: string[]
  ): boolean {
    if (blockedPaths && blockedPaths.length > 0) {
      for (const blocked of blockedPaths) {
        if (this.matchGlob(blocked, path)) {
          return false;
        }
      }
    }

    if (allowedPaths && allowedPaths.length > 0) {
      for (const allowed of allowedPaths) {
        if (this.matchGlob(allowed, path)) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  evaluateCommandPermission(
    command: string,
    allowedCommands?: string[],
    blockedCommands?: string[]
  ): boolean {
    const normalized = command.trim().toLowerCase();

    if (blockedCommands && blockedCommands.length > 0) {
      for (const blocked of blockedCommands) {
        if (normalized.startsWith(blocked.toLowerCase())) {
          return false;
        }
      }
    }

    if (allowedCommands && allowedCommands.length > 0) {
      for (const allowed of allowedCommands) {
        if (normalized.startsWith(allowed.toLowerCase())) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  evaluateDomainPermission(
    domain: string,
    allowedDomains?: string[],
    blockedDomains?: string[]
  ): boolean {
    const normalized = domain.toLowerCase();

    if (blockedDomains && blockedDomains.length > 0) {
      for (const blocked of blockedDomains) {
        if (normalized === blocked.toLowerCase() || normalized.endsWith('.' + blocked.toLowerCase())) {
          return false;
        }
      }
    }

    if (allowedDomains && allowedDomains.length > 0) {
      for (const allowed of allowedDomains) {
        if (normalized === allowed.toLowerCase() || normalized.endsWith('.' + allowed.toLowerCase())) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  // ── Rate Limiting ──────────────────────────────────────────────

  checkRateLimit(agentId: string, tool: string): boolean {
    const key = `${agentId}:${tool}`;
    const entry = this.invocationCounts.get(key);
    const now = new Date();

    if (!entry) return true;

    const elapsed = now.getTime() - entry.windowStart.getTime();
    if (elapsed > 3600000) {
      this.invocationCounts.delete(key);
      return true;
    }

    const agentPerms = this.getPermissionsForAgent(agentId);
    const perm = agentPerms.find((p) => p.tool === tool);
    const maxPerHour = perm?.maxInvocationsPerHour ?? 100;

    return entry.count < maxPerHour;
  }

  incrementInvocationCount(agentId: string, tool: string): void {
    const key = `${agentId}:${tool}`;
    const now = new Date();
    const existing = this.invocationCounts.get(key);

    if (!existing || now.getTime() - existing.windowStart.getTime() > 3600000) {
      this.invocationCounts.set(key, { count: 1, windowStart: now });
    } else {
      existing.count += 1;
    }
  }

  resetInvocationCounts(agentId: string): void {
    for (const key of this.invocationCounts.keys()) {
      if (key.startsWith(`${agentId}:`)) {
        this.invocationCounts.delete(key);
      }
    }
  }

  // ── Auto-accept ────────────────────────────────────────────────

  shouldAutoAccept(request: PermissionRequest): boolean {
    const rule = this.evaluateAutoAcceptRules(request);
    if (!rule) return false;

    const key = `${request.agentId}:${request.tool}:autorule:${rule.id}`;
    const existing = this.invocationCounts.get(key);

    if (existing) {
      const elapsed = Date.now() - existing.windowStart.getTime();
      if (elapsed <= 3600000 && existing.count >= rule.maxInvocationsPerHour) {
        return false;
      }
    }

    return true;
  }

  evaluateAutoAcceptRules(request: PermissionRequest): AutoAcceptRule | null {
    const now = new Date();
    const sorted = [...this.autoAcceptRules].sort((a, b) => b.priority - a.priority);

    for (const rule of sorted) {
      if (rule.expiresAt && rule.expiresAt < now) continue;

      if (
        rule.agentTypes.length > 0 &&
        !rule.agentTypes.includes(request.agentType)
      ) {
        continue;
      }

      if (rule.tools.length > 0 && !rule.tools.includes(request.tool)) {
        continue;
      }

      if (!this.evaluateConditions(rule.conditions, request.context)) {
        continue;
      }

      return rule;
    }

    return null;
  }

  // ── Approval ───────────────────────────────────────────────────

  requestApproval(request: PermissionRequest): Promise<PermissionDecision> {
    return new Promise((resolve) => {
      const requestId = generateRequestId();
      const entry = { ...request, requestId } as PermissionRequest & { requestId: string };

      const pollInterval = setInterval(() => {
        const idx = this.userApprovalQueue.findIndex(
          (q) => (q as any).requestId === requestId
        );
        if (idx === -1) {
          clearInterval(pollInterval);
          resolve(PermissionDecision.DENY);
        }
      }, 1000);

      (entry as any)._resolve = (decision: PermissionDecision) => {
        clearInterval(pollInterval);
        const queueIdx = this.userApprovalQueue.findIndex(
          (q) => (q as any).requestId === requestId
        );
        if (queueIdx >= 0) {
          this.userApprovalQueue.splice(queueIdx, 1);
        }
        resolve(decision);
      };

      this.userApprovalQueue.push(entry);
    });
  }

  approveRequest(requestId: string): void {
    const idx = this.userApprovalQueue.findIndex(
      (q) => (q as any).requestId === requestId
    );
    if (idx >= 0) {
      const req = this.userApprovalQueue[idx] as any;
      if (req._resolve) {
        req._resolve(PermissionDecision.ALLOW);
      }
    }
  }

  denyRequest(requestId: string): void {
    const idx = this.userApprovalQueue.findIndex(
      (q) => (q as any).requestId === requestId
    );
    if (idx >= 0) {
      const req = this.userApprovalQueue[idx] as any;
      if (req._resolve) {
        req._resolve(PermissionDecision.DENY);
      }
    }
  }

  getPendingApprovals(): PermissionRequest[] {
    return [...this.userApprovalQueue];
  }

  // ── Audit ──────────────────────────────────────────────────────

  logDecision(entry: PermissionAuditEntry): void {
    this.auditLog.push(entry);
    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog = this.auditLog.slice(-this.maxAuditLogSize);
    }
  }

  getAuditLog(
    agentId?: string,
    tool?: string,
    limit?: number
  ): PermissionAuditEntry[] {
    let results = [...this.auditLog];

    if (agentId) {
      results = results.filter((e) => e.agentId === agentId);
    }
    if (tool) {
      results = results.filter((e) => e.tool === tool);
    }

    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (limit && limit > 0) {
      results = results.slice(0, limit);
    }

    return results;
  }

  getAuditStats(): {
    totalRequests: number;
    allowed: number;
    denied: number;
    pending: number;
  } {
    let allowed = 0;
    let denied = 0;

    for (const entry of this.auditLog) {
      if (
        entry.decision === PermissionDecision.ALLOW ||
        entry.decision === PermissionDecision.ALLOW_ONCE ||
        entry.decision === PermissionDecision.ALLOW_WITH_AUDIT
      ) {
        allowed++;
      } else if (entry.decision === PermissionDecision.DENY) {
        denied++;
      }
    }

    return {
      totalRequests: this.auditLog.length,
      allowed,
      denied,
      pending: this.userApprovalQueue.length,
    };
  }

  exportAuditLog(format: 'json' | 'csv'): string {
    if (format === 'json') {
      return JSON.stringify(
        this.auditLog.map((e) => ({
          ...e,
          timestamp: e.timestamp.toISOString(),
        })),
        null,
        2
      );
    }

    const header =
      'requestId,agentId,agentType,tool,action,target,decision,reason,riskScore,timestamp,duration';
    const rows = this.auditLog.map((e) => {
      const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [
        escape(e.requestId),
        escape(e.agentId),
        escape(e.agentType),
        escape(e.tool),
        escape(e.action),
        escape(e.target),
        escape(e.decision),
        escape(e.reason),
        e.riskScore,
        escape(e.timestamp.toISOString()),
        e.duration,
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }

  // ── Private Helpers ────────────────────────────────────────────

  private getPermissionsForAgent(agentId: string): ToolPermission[] {
    for (const [agentType, perms] of this.permissions.entries()) {
      if (agentId.includes(agentType)) {
        return perms;
      }
    }
    return DEFAULT_UNKNOWN_AGENT;
  }

  private getDecisionReason(decision: PermissionDecision): string {
    switch (decision) {
      case PermissionDecision.ALLOW:
        return 'Permission granted';
      case PermissionDecision.ALLOW_ONCE:
        return 'Permission granted (single use)';
      case PermissionDecision.ALLOW_WITH_AUDIT:
        return 'Permission granted with audit logging';
      case PermissionDecision.DENY:
        return 'Permission denied';
      case PermissionDecision.ASK_USER:
        return 'Requires user approval';
      default:
        return 'Unknown decision';
    }
  }

  private matchGlob(pattern: string, value: string): boolean {
    const regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*')
      .replace(/\?/g, '[^/]');

    const regex = new RegExp(`^${regexStr}$`, 'i');
    return regex.test(value);
  }
}
