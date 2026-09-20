import { v4 as uuidv4 } from 'uuid';

export interface BreakpointEntry {
  id: string;
  file: string;
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
  enabled: boolean;
  hitCount: number;
  verified: boolean;
  createdAt: Date;
  lastHitAt?: Date;
}

export interface BreakpointGutterIcon {
  line: number;
  enabled: boolean;
  conditional: boolean;
  logpoint: boolean;
  color: string;
  shape: 'circle' | 'diamond' | 'circle-outline';
}

export class BreakpointManager {
  private breakpoints: Map<string, BreakpointEntry[]> = new Map();
  private conditions: Map<string, string> = new Map();

  addBreakpoint(file: string, line: number, condition?: string, hitCondition?: string, logMessage?: string): BreakpointEntry {
    const entry: BreakpointEntry = {
      id: uuidv4(),
      file,
      line,
      condition,
      hitCondition,
      logMessage,
      enabled: true,
      hitCount: 0,
      verified: false,
      createdAt: new Date(),
    };

    const existing = this.breakpoints.get(file) || [];
    const dup = existing.find((bp) => bp.line === line && bp.column === undefined);
    if (dup) {
      if (condition) {
        dup.condition = condition;
        this.conditions.set(dup.id, condition);
      }
      return dup;
    }

    existing.push(entry);
    this.breakpoints.set(file, existing);
    if (condition) {
      this.conditions.set(entry.id, condition);
    }
    return entry;
  }

  removeBreakpoint(file: string, line: number): void {
    const breakpoints = this.breakpoints.get(file);
    if (!breakpoints) return;
    const idx = breakpoints.findIndex((bp) => bp.line === line);
    if (idx < 0) return;
    const removed = breakpoints.splice(idx, 1)[0];
    this.conditions.delete(removed.id);
    if (breakpoints.length === 0) {
      this.breakpoints.delete(file);
    }
  }

  removeBreakpointById(id: string): void {
    const entries = Array.from(this.breakpoints.entries());
    for (const [file, bps] of entries) {
      const idx = bps.findIndex((bp) => bp.id === id);
      if (idx >= 0) {
        const removed = bps.splice(idx, 1)[0];
        this.conditions.delete(removed.id);
        if (bps.length === 0) this.breakpoints.delete(file);
        return;
      }
    }
  }

  toggleBreakpoint(file: string, line: number): BreakpointEntry | null {
    const breakpoints = this.breakpoints.get(file);
    if (!breakpoints) return null;
    const bp = breakpoints.find((b) => b.line === line);
    if (bp) {
      bp.enabled = !bp.enabled;
      return bp;
    }
    return null;
  }

  getBreakpoints(file?: string): BreakpointEntry[] {
    if (file) {
      return this.breakpoints.get(file) || [];
    }
    const all: BreakpointEntry[] = [];
    const values = Array.from(this.breakpoints.values());
    for (const bps of values) {
      all.push(...bps);
    }
    return all;
  }

  getBreakpointsForFile(file: string): BreakpointEntry[] {
    return this.getBreakpoints(file);
  }

  getBreakpointConditions(): Map<string, string> {
    return new Map(this.conditions);
  }

  getConditionForBreakpoint(id: string): string | undefined {
    return this.conditions.get(id);
  }

  validateBreakpoint(file: string, line: number): { valid: boolean; reason?: string } {
    if (line < 1) return { valid: false, reason: 'Line number must be >= 1' };
    if (!file || file.trim().length === 0) return { valid: false, reason: 'File path is required' };
    const existing = this.breakpoints.get(file);
    if (existing) {
      const count = existing.filter((bp) => bp.enabled).length;
      if (count >= 100) return { valid: false, reason: 'Maximum breakpoints per file exceeded (100)' };
    }
    return { valid: true };
  }

  enableAll(): void {
    const values = Array.from(this.breakpoints.values());
    for (const bps of values) {
      for (const bp of bps) {
        bp.enabled = true;
      }
    }
  }

  disableAll(): void {
    const values = Array.from(this.breakpoints.values());
    for (const bps of values) {
      for (const bp of bps) {
        bp.enabled = false;
      }
    }
  }

  enableBreakpoint(id: string): void {
    const values = Array.from(this.breakpoints.values());
    for (const bps of values) {
      const bp = bps.find((b) => b.id === id);
      if (bp) {
        bp.enabled = true;
        return;
      }
    }
  }

  disableBreakpoint(id: string): void {
    const values = Array.from(this.breakpoints.values());
    for (const bps of values) {
      const bp = bps.find((b) => b.id === id);
      if (bp) {
        bp.enabled = false;
        return;
      }
    }
  }

  incrementHitCount(id: string): void {
    const values = Array.from(this.breakpoints.values());
    for (const bps of values) {
      const bp = bps.find((b) => b.id === id);
      if (bp) {
        bp.hitCount++;
        bp.lastHitAt = new Date();
        return;
      }
    }
  }

  shouldBreak(id: string): boolean {
    const values = Array.from(this.breakpoints.values());
    for (const bps of values) {
      const bp = bps.find((b) => b.id === id);
      if (bp && bp.enabled) {
        if (bp.hitCondition) {
          const target = parseInt(bp.hitCondition, 10);
          if (!isNaN(target)) return bp.hitCount % target === 0;
        }
        return true;
      }
    }
    return false;
  }

  exportBreakpoints(): string {
    const data: Array<{
      id: string;
      file: string;
      line: number;
      column?: number;
      condition?: string;
      hitCondition?: string;
      logMessage?: string;
      enabled: boolean;
    }> = [];
    const values = Array.from(this.breakpoints.values());
    for (const bps of values) {
      for (const bp of bps) {
        data.push({
          id: bp.id,
          file: bp.file,
          line: bp.line,
          column: bp.column,
          condition: bp.condition,
          hitCondition: bp.hitCondition,
          logMessage: bp.logMessage,
          enabled: bp.enabled,
        });
      }
    }
    return JSON.stringify(data, null, 2);
  }

  importBreakpoints(json: string): number {
    let imported = 0;
    try {
      const data = JSON.parse(json) as Array<{
        file: string;
        line: number;
        column?: number;
        condition?: string;
        hitCondition?: string;
        logMessage?: string;
        enabled?: boolean;
      }>;
      for (const item of data) {
        this.addBreakpoint(item.file, item.line, item.condition, item.hitCondition, item.logMessage);
        imported++;
      }
    } catch {
      // malformed JSON
    }
    return imported;
  }

  clear(): void {
    this.breakpoints.clear();
    this.conditions.clear();
  }

  getTotalBreakpointCount(): number {
    let count = 0;
    const values = Array.from(this.breakpoints.values());
    for (const bps of values) {
      count += bps.length;
    }
    return count;
  }

  getEnabledBreakpointCount(): number {
    let count = 0;
    const values = Array.from(this.breakpoints.values());
    for (const bps of values) {
      count += bps.filter((bp) => bp.enabled).length;
    }
    return count;
  }

  renderBreakpointGutter(line: number, file: string): BreakpointGutterIcon {
    const breakpoints = this.breakpoints.get(file) || [];
    const bp = breakpoints.find((b) => b.line === line);
    if (bp) {
      return {
        line,
        enabled: bp.enabled,
        conditional: !!bp.condition,
        logpoint: !!bp.logMessage,
        color: bp.enabled ? (bp.condition ? '#FFC107' : bp.logMessage ? '#9C27B0' : '#E53935') : '#666666',
        shape: bp.condition ? 'diamond' : 'circle',
      };
    }
    return {
      line,
      enabled: false,
      conditional: false,
      logpoint: false,
      color: '#999999',
      shape: 'circle-outline',
    };
  }

  renderConditionalBreakpoint(condition: string): string {
    if (condition.startsWith('$log(') || condition.startsWith('$log ')) {
      return `💬 ${condition}`;
    }
    return `◆ ${condition}`;
  }
}
