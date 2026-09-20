export interface CustomTool {
  id: string;
  name: string;
  description: string;
  creator: string;
  version: string;
  code: string;
  language: string;
  inputSchema: any;
  outputSchema: any;
  permissions: string[];
  usageCount: number;
  avgExecutionTime: number;
  errorRate: number;
  createdAt: Date;
}

export class ToolCreator {
  private tools: Map<string, CustomTool> = new Map();
  private creatorIndex: Map<string, Set<string>> = new Map();

  createTool(tool: Omit<CustomTool, 'id' | 'usageCount' | 'avgExecutionTime' | 'errorRate' | 'createdAt'>): CustomTool {
    const id = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const full: CustomTool = { ...tool, id, usageCount: 0, avgExecutionTime: 0, errorRate: 0, createdAt: new Date() };
    this.tools.set(id, full);
    if (!this.creatorIndex.has(tool.creator)) this.creatorIndex.set(tool.creator, new Set());
    this.creatorIndex.get(tool.creator)!.add(id);
    return full;
  }

  async executeTool(toolId: string, input: any): Promise<{ result: any; executionTime: number; success: boolean; error?: string }> {
    const tool = this.tools.get(toolId);
    if (!tool) return { result: null, executionTime: 0, success: false, error: 'Tool not found' };
    const start = Date.now();
    try {
      const fn = new Function('input', tool.code);
      const result = await fn(input);
      const executionTime = Date.now() - start;
      tool.usageCount++;
      tool.avgExecutionTime = (tool.avgExecutionTime * (tool.usageCount - 1) + executionTime) / tool.usageCount;
      return { result, executionTime, success: true };
    } catch (error) {
      tool.usageCount++;
      tool.errorRate = (tool.errorRate * (tool.usageCount - 1) + 1) / tool.usageCount;
      return { result: null, executionTime: Date.now() - start, success: false, error: (error as Error).message };
    }
  }

  getTool(id: string): CustomTool | undefined { return this.tools.get(id); }
  getCreatorTools(creator: string): CustomTool[] { const ids = this.creatorIndex.get(creator); if (!ids) return []; return [...ids].map(id => this.tools.get(id)!).filter(Boolean); }
  getAllTools(): CustomTool[] { return [...this.tools.values()]; }
  deleteTool(id: string): boolean { return this.tools.delete(id); }

  getStats(): { totalTools: number; totalExecutions: number; avgErrorRate: number; topTools: { name: string; usage: number }[] } {
    const tools = [...this.tools.values()];
    const topTools = tools.sort((a, b) => b.usageCount - a.usageCount).slice(0, 10).map(t => ({ name: t.name, usage: t.usageCount }));
    return { totalTools: tools.length, totalExecutions: tools.reduce((s, t) => s + t.usageCount, 0), avgErrorRate: tools.length ? tools.reduce((s, t) => s + t.errorRate, 0) / tools.length : 0, topTools };
  }
}
