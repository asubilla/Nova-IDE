import {
  ResourceProfile,
  ResourceLimits,
  AutoScalingConfig,
  AgentType,
} from '../core/types';

export interface AgentResourceSnapshot {
  agentId: string;
  memoryMB: number;
  cpuPercent: number;
  diskMB: number;
  networkMbps: number;
  timestamp: Date;
}

export interface SystemResourceSnapshot {
  totalMemoryMB: number;
  usedMemoryMB: number;
  availableMemoryMB: number;
  cpuPercent: number;
  diskUsedMB: number;
  diskAvailableMB: number;
  networkInMbps: number;
  networkOutMbps: number;
  timestamp: Date;
}

export interface ResourceBudget {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxDiskMB: number;
  maxNetworkMbps: number;
  currentMemoryMB: number;
  currentCpuPercent: number;
  currentDiskMB: number;
  currentNetworkMbps: number;
  memoryUtilization: number;
  cpuUtilization: number;
  diskUtilization: number;
  networkUtilization: number;
}

export interface ScalingDecision {
  action: 'scale-up' | 'scale-down' | 'maintain';
  reason: string;
  currentAgents: number;
  targetAgents: number;
  metric: string;
  threshold: number;
  actual: number;
  timestamp: Date;
}

export interface ZombieAgent {
  agentId: string;
  agentType: AgentType;
  lastActivity: Date;
  idleDurationMs: number;
  memoryMB: number;
  reason: string;
}

export interface ResourceAlert {
  id: string;
  type: 'memory-high' | 'cpu-high' | 'disk-full' | 'network-spike' | 'zombie-detected' | 'budget-exceeded';
  severity: 'info' | 'warning' | 'critical';
  agentId?: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface ResourceDashboard {
  system: SystemResourceSnapshot;
  budget: ResourceBudget;
  agentSnapshots: AgentResourceSnapshot[];
  zombies: ZombieAgent[];
  alerts: ResourceAlert[];
  scalingDecisions: ScalingDecision[];
  uptime: number;
}

export type ResourceEventListener = (event: ResourceAlert) => void;

export class ResourceMonitor {
  private agentSnapshots: Map<string, AgentResourceSnapshot[]> = new Map();
  private systemSnapshots: SystemResourceSnapshot[] = [];
  private alerts: ResourceAlert[] = [];
  private scalingDecisions: ScalingDecision[] = [];
  private listeners: ResourceEventListener[] = [];
  private monitoringTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private startTime: Date = new Date();
  private resourceLimits: ResourceLimits;
  private autoScalingConfig: AutoScalingConfig;
  private currentAgentCount: number = 0;
  private maxConcurrentAgents: number;

  constructor(
    resourceLimits?: Partial<ResourceLimits>,
    autoScalingConfig?: Partial<AutoScalingConfig>,
    maxConcurrentAgents: number = 6
  ) {
    this.resourceLimits = {
      maxMemoryMB: 8192,
      maxCpuPercent: 90,
      maxDiskMB: 10240,
      maxNetworkMbps: 100,
      maxFileHandles: 1024,
      maxChildProcesses: 64,
      ...resourceLimits,
    };

    this.autoScalingConfig = {
      enabled: true,
      minAgents: 1,
      maxAgents: 10,
      scaleUpThreshold: 0.7,
      scaleDownThreshold: 0.3,
      cooldownMs: 30000,
      metricsWindowMs: 60000,
      ...autoScalingConfig,
    };

    this.maxConcurrentAgents = maxConcurrentAgents;
  }

  onAlert(listener: ResourceEventListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: ResourceEventListener): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private emitAlert(alert: ResourceAlert): void {
    this.alerts.push(alert);
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    for (const listener of this.listeners) {
      try {
        listener(alert);
      } catch {}
    }
  }

  start(): void {
    this.startTime = new Date();
    this.monitoringTimer = setInterval(() => this.collectMetrics(), 5000);
    this.cleanupTimer = setInterval(() => this.cleanupZombies(), 30000);
    this.collectMetrics();
  }

  stop(): void {
    if (this.monitoringTimer) clearInterval(this.monitoringTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.monitoringTimer = null;
    this.cleanupTimer = null;
  }

  private collectMetrics(): void {
    const systemSnapshot = this.getSystemSnapshot();
    this.systemSnapshots.push(systemSnapshot);

    if (this.systemSnapshots.length > 120) {
      this.systemSnapshots = this.systemSnapshots.slice(-120);
    }

    this.checkThresholds(systemSnapshot);
    this.evaluateAutoScaling(systemSnapshot);
  }

  getSystemSnapshot(): SystemResourceSnapshot {
    const totalMemory = this.resourceLimits.maxMemoryMB;
    const usedMemory = this.calculateTotalAgentMemory();
    const cpuPercent = this.calculateAggregateCpu();
    const diskUsed = this.calculateTotalAgentDisk();

    return {
      totalMemoryMB: totalMemory,
      usedMemoryMB: usedMemory,
      availableMemoryMB: totalMemory - usedMemory,
      cpuPercent,
      diskUsedMB: diskUsed,
      diskAvailableMB: this.resourceLimits.maxDiskMB - diskUsed,
      networkInMbps: 0,
      networkOutMbps: 0,
      timestamp: new Date(),
    };
  }

  private calculateTotalAgentMemory(): number {
    let total = 0;
    for (const [, snapshots] of this.agentSnapshots) {
      const latest = snapshots[snapshots.length - 1];
      if (latest) total += latest.memoryMB;
    }
    return total;
  }

  private calculateAggregateCpu(): number {
    let total = 0;
    for (const [, snapshots] of this.agentSnapshots) {
      const latest = snapshots[snapshots.length - 1];
      if (latest) total += latest.cpuPercent;
    }
    return Math.min(total, 100);
  }

  private calculateTotalAgentDisk(): number {
    let total = 0;
    for (const [, snapshots] of this.agentSnapshots) {
      const latest = snapshots[snapshots.length - 1];
      if (latest) total += latest.diskMB;
    }
    return total;
  }

  private checkThresholds(snapshot: SystemResourceSnapshot): void {
    const memoryUtil = snapshot.usedMemoryMB / snapshot.totalMemoryMB;
    if (memoryUtil > 0.85) {
      this.emitAlert({
        id: `mem-${Date.now()}`,
        type: 'memory-high',
        severity: memoryUtil > 0.95 ? 'critical' : 'warning',
        message: `Memory usage at ${Math.round(memoryUtil * 100)}% (${snapshot.usedMemoryMB}/${snapshot.totalMemoryMB}MB)`,
        timestamp: new Date(),
        acknowledged: false,
      });
    }

    if (snapshot.cpuPercent > 80) {
      this.emitAlert({
        id: `cpu-${Date.now()}`,
        type: 'cpu-high',
        severity: snapshot.cpuPercent > 95 ? 'critical' : 'warning',
        message: `CPU usage at ${snapshot.cpuPercent}%`,
        timestamp: new Date(),
        acknowledged: false,
      });
    }

    const diskUtil = snapshot.diskUsedMB / this.resourceLimits.maxDiskMB;
    if (diskUtil > 0.9) {
      this.emitAlert({
        id: `disk-${Date.now()}`,
        type: 'disk-full',
        severity: diskUtil > 0.95 ? 'critical' : 'warning',
        message: `Disk usage at ${Math.round(diskUtil * 100)}% (${snapshot.diskUsedMB}/${this.resourceLimits.maxDiskMB}MB)`,
        timestamp: new Date(),
        acknowledged: false,
      });
    }
  }

  private evaluateAutoScaling(snapshot: SystemResourceSnapshot): void {
    if (!this.autoScalingConfig.enabled) return;

    const lastDecision = this.scalingDecisions[this.scalingDecisions.length - 1];
    if (lastDecision) {
      const timeSinceLastDecision = Date.now() - lastDecision.timestamp?.getTime() || 0;
      if (timeSinceLastDecision < this.autoScalingConfig.cooldownMs) return;
    }

    const utilization = (snapshot.usedMemoryMB / snapshot.totalMemoryMB + snapshot.cpuPercent / 100) / 2;

    let decision: ScalingDecision;

    if (utilization > this.autoScalingConfig.scaleUpThreshold && this.currentAgentCount < this.autoScalingConfig.maxAgents) {
      const target = Math.min(this.currentAgentCount + 1, this.autoScalingConfig.maxAgents);
      decision = {
        action: 'scale-up',
        reason: `Resource utilization (${Math.round(utilization * 100)}%) above scale-up threshold (${Math.round(this.autoScalingConfig.scaleUpThreshold * 100)}%)`,
        currentAgents: this.currentAgentCount,
        targetAgents: target,
        metric: 'utilization',
        threshold: this.autoScalingConfig.scaleUpThreshold,
        actual: utilization,
        timestamp: new Date(),
      };
    } else if (utilization < this.autoScalingConfig.scaleDownThreshold && this.currentAgentCount > this.autoScalingConfig.minAgents) {
      const target = Math.max(this.currentAgentCount - 1, this.autoScalingConfig.minAgents);
      decision = {
        action: 'scale-down',
        reason: `Resource utilization (${Math.round(utilization * 100)}%) below scale-down threshold (${Math.round(this.autoScalingConfig.scaleDownThreshold * 100)}%)`,
        currentAgents: this.currentAgentCount,
        targetAgents: target,
        metric: 'utilization',
        threshold: this.autoScalingConfig.scaleDownThreshold,
        actual: utilization,
        timestamp: new Date(),
      };
    } else {
      decision = {
        action: 'maintain',
        reason: 'Resource utilization within acceptable range',
        currentAgents: this.currentAgentCount,
        targetAgents: this.currentAgentCount,
        metric: 'utilization',
        threshold: this.autoScalingConfig.scaleUpThreshold,
        actual: utilization,
        timestamp: new Date(),
      };
    }

    this.scalingDecisions.push(decision);
    if (this.scalingDecisions.length > 50) {
      this.scalingDecisions = this.scalingDecisions.slice(-50);
    }
  }

  trackAgent(agentId: string, profile: ResourceProfile): void {
    if (!this.agentSnapshots.has(agentId)) {
      this.agentSnapshots.set(agentId, []);
    }

    this.agentSnapshots.get(agentId)!.push({
      agentId,
      memoryMB: profile.memoryMB,
      cpuPercent: profile.cpuPercent,
      diskMB: profile.diskMB,
      networkMbps: profile.networkMbps,
      timestamp: new Date(),
    });

    this.currentAgentCount++;
  }

  updateAgentSnapshot(snapshot: AgentResourceSnapshot): void {
    const snapshots = this.agentSnapshots.get(snapshot.agentId);
    if (snapshots) {
      snapshots.push(snapshot);
      if (snapshots.length > 60) {
        snapshots.splice(0, snapshots.length - 60);
      }
    }
  }

  untrackAgent(agentId: string): void {
    this.agentSnapshots.delete(agentId);
    this.currentAgentCount = Math.max(0, this.currentAgentCount - 1);
  }

  getResourceBudget(): ResourceBudget {
    const currentMemory = this.calculateTotalAgentMemory();
    const currentCpu = this.calculateAggregateCpu();
    const currentDisk = this.calculateTotalAgentDisk();

    return {
      maxMemoryMB: this.resourceLimits.maxMemoryMB,
      maxCpuPercent: this.resourceLimits.maxCpuPercent,
      maxDiskMB: this.resourceLimits.maxDiskMB,
      maxNetworkMbps: this.resourceLimits.maxNetworkMbps,
      currentMemoryMB: currentMemory,
      currentCpuPercent: currentCpu,
      currentDiskMB: currentDisk,
      currentNetworkMbps: 0,
      memoryUtilization: currentMemory / this.resourceLimits.maxMemoryMB,
      cpuUtilization: currentCpu / this.resourceLimits.maxCpuPercent,
      diskUtilization: currentDisk / this.resourceLimits.maxDiskMB,
      networkUtilization: 0,
    };
  }

  hasEnoughResources(profile: ResourceProfile): boolean {
    const budget = this.getResourceBudget();
    return (
      budget.currentMemoryMB + profile.memoryMB <= this.resourceLimits.maxMemoryMB &&
      budget.currentCpuPercent + profile.cpuPercent <= this.resourceLimits.maxCpuPercent &&
      budget.currentDiskMB + profile.diskMB <= this.resourceLimits.maxDiskMB
    );
  }

  private cleanupZombies(): void {
    const zombies = this.detectZombies();
    for (const zombie of zombies) {
      this.emitAlert({
        id: `zombie-${zombie.agentId}`,
        type: 'zombie-detected',
        severity: 'warning',
        agentId: zombie.agentId,
        message: `Zombie agent detected: ${zombie.agentId} (${zombie.reason})`,
        timestamp: new Date(),
        acknowledged: false,
      });
    }
  }

  detectZombies(): ZombieAgent[] {
    const zombies: ZombieAgent[] = [];
    const now = Date.now();
    const idleThreshold = 60000;

    for (const [agentId, snapshots] of this.agentSnapshots) {
      if (snapshots.length === 0) continue;

      const latest = snapshots[snapshots.length - 1];
      const idleDuration = now - latest.timestamp.getTime();

      if (idleDuration > idleThreshold) {
        zombies.push({
          agentId,
          agentType: 'feature-coder',
          lastActivity: latest.timestamp,
          idleDurationMs: idleDuration,
          memoryMB: latest.memoryMB,
          reason: `Idle for ${Math.round(idleDuration / 1000)}s`,
        });
      }
    }

    return zombies;
  }

  getAgentHistory(agentId: string): AgentResourceSnapshot[] {
    return this.agentSnapshots.get(agentId) || [];
  }

  getSystemHistory(): SystemResourceSnapshot[] {
    return [...this.systemSnapshots];
  }

  getRecentAlerts(count: number = 10): ResourceAlert[] {
    return this.alerts.slice(-count);
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  getDashboard(): ResourceDashboard {
    const budget = this.getResourceBudget();
    const system = this.getSystemSnapshot();
    const snapshots: AgentResourceSnapshot[] = [];

    for (const [, agentSnapshots] of this.agentSnapshots) {
      const latest = agentSnapshots[agentSnapshots.length - 1];
      if (latest) snapshots.push(latest);
    }

    return {
      system,
      budget,
      agentSnapshots: snapshots,
      zombies: this.detectZombies(),
      alerts: this.getRecentAlerts(20),
      scalingDecisions: this.scalingDecisions.slice(-10),
      uptime: Date.now() - this.startTime.getTime(),
    };
  }

  getAgentResourceUsage(agentId: string): {
    totalMemoryMB: number;
    totalCpuPercent: number;
    totalDiskMB: number;
    peakMemoryMB: number;
    peakCpuPercent: number;
    samples: number;
  } {
    const snapshots = this.agentSnapshots.get(agentId) || [];
    if (snapshots.length === 0) {
      return { totalMemoryMB: 0, totalCpuPercent: 0, totalDiskMB: 0, peakMemoryMB: 0, peakCpuPercent: 0, samples: 0 };
    }

    let totalMem = 0, totalCpu = 0, totalDisk = 0;
    let peakMem = 0, peakCpu = 0;

    for (const snap of snapshots) {
      totalMem += snap.memoryMB;
      totalCpu += snap.cpuPercent;
      totalDisk += snap.diskMB;
      if (snap.memoryMB > peakMem) peakMem = snap.memoryMB;
      if (snap.cpuPercent > peakCpu) peakCpu = snap.cpuPercent;
    }

    return {
      totalMemoryMB: Math.round(totalMem),
      totalCpuPercent: Math.round(totalCpu),
      totalDiskMB: Math.round(totalDisk),
      peakMemoryMB: peakMem,
      peakCpuPercent: peakCpu,
      samples: snapshots.length,
    };
  }

  getResourceSummary(): {
    totalAgentsTracked: number;
    totalMemoryUsedMB: number;
    totalCpuUsedPercent: number;
    totalDiskUsedMB: number;
    alertCount: number;
    zombieCount: number;
    lastScalingAction: ScalingDecision | null;
  } {
    return {
      totalAgentsTracked: this.agentSnapshots.size,
      totalMemoryUsedMB: this.calculateTotalAgentMemory(),
      totalCpuUsedPercent: this.calculateAggregateCpu(),
      totalDiskUsedMB: this.calculateTotalAgentDisk(),
      alertCount: this.alerts.filter(a => !a.acknowledged).length,
      zombieCount: this.detectZombies().length,
      lastScalingAction: this.scalingDecisions[this.scalingDecisions.length - 1] || null,
    };
  }
}
