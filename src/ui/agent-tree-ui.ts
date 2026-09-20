import { AgentInfo, AgentDisplayStatus } from './agent-status-ui';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentTreeUIOptions {
  showStatus?: boolean;
  showProgress?: boolean;
  autoExpand?: boolean;
  selectable?: boolean;
}

export interface TreeNode {
  agent: AgentInfo;
  depth: number;
  isLast: boolean;
  isExpanded: boolean;
  children: TreeNode[];
  parent: TreeNode | null;
}

type AgentClickCallback = (agentId: string, agent: AgentInfo) => void;
type ArrowClickCallback = (agentId: string, expanded: boolean) => void;

// ─── Status Icons ───────────────────────────────────────────────────────────

const STATUS_ICONS: Record<AgentDisplayStatus, string> = {
  queued: '\uD83D\uDFE1',
  loading: '\uD83D\uDD35',
  processing: '\uD83D\uDFE2',
  running: '\uD83D\uDFE2',
  paused: '\u23F8\uFE0F',
  retrying: '\uD83D\uDFE0',
  waiting: '\u23F3',
  completed: '\u2705',
  failed: '\u274C',
  cancelled: '\u26D4',
  timeout: '\u23F0',
};

// ─── AgentTreeUI ────────────────────────────────────────────────────────────

export class AgentTreeUI {
  private container: HTMLElement;
  private options: Required<AgentTreeUIOptions>;
  private panelEl: HTMLElement | null = null;
  private agents: Map<string, AgentInfo> = new Map();
  private expandedNodes: Set<string> = new Set();
  private selectedAgentId: string | null = null;
  private agentClickCallbacks: AgentClickCallback[] = [];
  private arrowClickCallbacks: ArrowClickCallback[] = [];
  private searchQuery: string = '';
  private highlightedAgentId: string | null = null;

  constructor(container: HTMLElement, options: AgentTreeUIOptions = {}) {
    this.container = container;
    this.options = {
      showStatus: options.showStatus ?? true,
      showProgress: options.showProgress ?? true,
      autoExpand: options.autoExpand ?? true,
      selectable: options.selectable ?? true,
    };
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  render(): HTMLElement {
    if (!this.panelEl) {
      this.panelEl = document.createElement('div');
      this.panelEl.className = 'agent-tree-ui';
      this.container.appendChild(this.panelEl);
    }

    this.panelEl.innerHTML = '';
    this.panelEl.setAttribute('role', 'tree');
    this.panelEl.setAttribute('aria-label', 'Agent Tree');

    const tree = this.buildTree();

    if (tree.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agent-tree-ui__empty';
      empty.textContent = 'No agents';
      this.panelEl.appendChild(empty);
      return this.panelEl;
    }

    for (const node of tree) {
      this.renderTreeItem(node, this.panelEl);
    }

    return this.panelEl;
  }

  // ─── Build Tree ────────────────────────────────────────────────────────

  private buildTree(): TreeNode[] {
    const agentMap = new Map<string, AgentInfo>();
    for (const agent of this.agents.values()) {
      agentMap.set(agent.id, agent);
    }

    const childSet = new Set<string>();
    for (const agent of agentMap.values()) {
      if (agent.children) {
        for (const childId of agent.children) {
          childSet.add(childId);
        }
      }
    }

    const rootAgents: AgentInfo[] = [];
    for (const agent of agentMap.values()) {
      if (!childSet.has(agent.id)) {
        rootAgents.push(agent);
      }
    }

    rootAgents.sort((a, b) => {
      const statusOrder: Record<AgentDisplayStatus, number> = {
        running: 0, processing: 1, loading: 2, queued: 3, paused: 4,
        retrying: 5, waiting: 6, completed: 7, failed: 8, cancelled: 9, timeout: 10,
      };
      return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    });

    return rootAgents.map((agent, index) =>
      this.buildTreeNode(agent, 0, index === rootAgents.length - 1, null, agentMap)
    );
  }

  private buildTreeNode(
    agent: AgentInfo,
    depth: number,
    isLast: boolean,
    parent: TreeNode | null,
    agentMap: Map<string, AgentInfo>
  ): TreeNode {
    const children: TreeNode[] = [];

    if (agent.children && agent.children.length > 0) {
      const childAgents = agent.children
        .map((id) => agentMap.get(id))
        .filter((a): a is AgentInfo => a !== undefined);

      childAgents.sort((a, b) => {
        const statusOrder: Record<AgentDisplayStatus, number> = {
          running: 0, processing: 1, loading: 2, queued: 3, paused: 4,
          retrying: 5, waiting: 6, completed: 7, failed: 8, cancelled: 9, timeout: 10,
        };
        return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
      });

      for (let i = 0; i < childAgents.length; i++) {
        children.push(
          this.buildTreeNode(childAgents[i], depth + 1, i === childAgents.length - 1, null, agentMap)
        );
      }
    }

    const node: TreeNode = {
      agent,
      depth,
      isLast,
      isExpanded: this.expandedNodes.has(agent.id),
      children,
      parent,
    };

    for (const child of children) {
      child.parent = node;
    }

    return node;
  }

  // ─── Render Tree Item ──────────────────────────────────────────────────

  private renderTreeItem(node: TreeNode, parent: HTMLElement): void {
    const item = document.createElement('div');
    item.className = `agent-tree-ui__item agent-tree-ui__item--${node.agent.status}`;
    item.dataset.agentId = node.agent.id;
    item.setAttribute('role', 'treeitem');
    item.style.paddingLeft = `${node.depth * 24 + 8}px`;

    if (node.agent.id === this.selectedAgentId) {
      item.classList.add('agent-tree-ui__item--selected');
    }
    if (node.agent.id === this.highlightedAgentId) {
      item.classList.add('agent-tree-ui__item--highlighted');
    }

    const connector = this.renderConnector(node.depth, node.isLast);
    item.appendChild(connector);

    if (node.children.length > 0) {
      const arrow = this.renderArrow(node.agent.id, node.isExpanded);
      item.appendChild(arrow);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'agent-tree-ui__spacer';
      item.appendChild(spacer);
    }

    const statusIcon = document.createElement('span');
    statusIcon.className = `agent-tree-ui__status-icon agent-tree-ui__status-icon--${node.agent.status}`;
    statusIcon.textContent = STATUS_ICONS[node.agent.status];
    if (node.agent.status === 'running') {
      statusIcon.classList.add('agent-tree-ui__status-icon--pulse');
    }
    if (node.agent.status === 'loading') {
      statusIcon.classList.add('agent-tree-ui__status-icon--pulsing');
    }
    item.appendChild(statusIcon);

    const name = document.createElement('span');
    name.className = 'agent-tree-ui__name';
    name.textContent = node.agent.name;
    item.appendChild(name);

    if (this.options.showStatus) {
      const statusBadge = document.createElement('span');
      statusBadge.className = `agent-tree-ui__status-badge agent-tree-ui__status-badge--${node.agent.status}`;
      statusBadge.textContent = node.agent.status.toUpperCase();
      item.appendChild(statusBadge);
    }

    if (this.options.showProgress && node.agent.progress !== undefined) {
      const progress = document.createElement('span');
      progress.className = 'agent-tree-ui__progress';
      progress.textContent = `[${Math.floor(node.agent.progress)}%]`;
      item.appendChild(progress);
    }

    if (node.agent.childCount !== undefined && node.agent.childCount > 0) {
      const childCount = document.createElement('span');
      childCount.className = 'agent-tree-ui__child-count';
      childCount.textContent = `(${node.agent.childCount})`;
      item.appendChild(childCount);
    }

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      this.emitAgentClick(node.agent.id, node.agent);
    });

    parent.appendChild(item);

    if (node.isExpanded && node.children.length > 0) {
      const childContainer = document.createElement('div');
      childContainer.className = 'agent-tree-ui__children';
      childContainer.setAttribute('role', 'group');

      for (const child of node.children) {
        this.renderTreeItem(child, childContainer);
      }

      parent.appendChild(childContainer);
    }
  }

  // ─── Render Connector ──────────────────────────────────────────────────

  private renderConnector(depth: number, isLast: boolean): HTMLElement {
    const connector = document.createElement('span');
    connector.className = 'agent-tree-ui__connector';

    if (depth === 0) {
      return connector;
    }

    const lines: string[] = [];
    for (let i = 0; i < depth - 1; i++) {
      lines.push('\u2502  ');
    }
    lines.push(isLast ? '\u2514\u2500\u2500' : '\u251C\u2500\u2500');

    connector.textContent = lines.join('');
    return connector;
  }

  // ─── Render Arrow ──────────────────────────────────────────────────────

  private renderArrow(agentId: string, isExpanded: boolean): HTMLElement {
    const arrow = document.createElement('span');
    arrow.className = `agent-tree-ui__arrow ${isExpanded ? 'agent-tree-ui__arrow--expanded' : 'agent-tree-ui__arrow--collapsed'}`;
    arrow.textContent = isExpanded ? '\u25BC' : '\u25B6';
    arrow.setAttribute('role', 'button');
    arrow.setAttribute('aria-expanded', String(isExpanded));
    arrow.tabIndex = 0;

    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle(agentId);
      this.emitArrowClick(agentId, !isExpanded);
    });

    arrow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.toggle(agentId);
        this.emitArrowClick(agentId, !isExpanded);
      }
    });

    return arrow;
  }

  // ─── Expand/Collapse ───────────────────────────────────────────────────

  expand(agentId: string): void {
    this.expandedNodes.add(agentId);
    this.render();
  }

  collapse(agentId: string): void {
    this.expandedNodes.delete(agentId);
    this.render();
  }

  toggle(agentId: string): void {
    if (this.expandedNodes.has(agentId)) {
      this.expandedNodes.delete(agentId);
    } else {
      this.expandedNodes.add(agentId);
    }
    this.render();
  }

  expandAll(): void {
    for (const agent of this.agents.values()) {
      if (agent.children && agent.children.length > 0) {
        this.expandedNodes.add(agent.id);
      }
    }
    this.render();
  }

  collapseAll(): void {
    this.expandedNodes.clear();
    this.render();
  }

  // ─── Select Agent ──────────────────────────────────────────────────────

  selectAgent(agentId: string): void {
    if (this.options.selectable) {
      this.selectedAgentId = agentId;
      this.render();
    }
  }

  // ─── Click Handlers ────────────────────────────────────────────────────

  onAgentClick(callback: AgentClickCallback): { dispose: () => void } {
    this.agentClickCallbacks.push(callback);
    return {
      dispose: () => {
        const idx = this.agentClickCallbacks.indexOf(callback);
        if (idx !== -1) this.agentClickCallbacks.splice(idx, 1);
      },
    };
  }

  onArrowClick(callback: ArrowClickCallback): { dispose: () => void } {
    this.arrowClickCallbacks.push(callback);
    return {
      dispose: () => {
        const idx = this.arrowClickCallbacks.indexOf(callback);
        if (idx !== -1) this.arrowClickCallbacks.splice(idx, 1);
      },
    };
  }

  // ─── Search Agent ──────────────────────────────────────────────────────

  searchAgent(query: string): string[] {
    this.searchQuery = query.toLowerCase();
    const results: string[] = [];

    for (const agent of this.agents.values()) {
      if (
        agent.name.toLowerCase().includes(this.searchQuery) ||
        agent.type.toLowerCase().includes(this.searchQuery) ||
        agent.id.toLowerCase().includes(this.searchQuery)
      ) {
        results.push(agent.id);
      }
    }

    return results;
  }

  // ─── Highlight Agent ───────────────────────────────────────────────────

  highlightAgent(agentId: string): void {
    this.highlightedAgentId = agentId;
    this.render();

    setTimeout(() => {
      if (this.highlightedAgentId === agentId) {
        this.highlightedAgentId = null;
        this.render();
      }
    }, 3000);
  }

  // ─── Update Agents ─────────────────────────────────────────────────────

  updateAgents(agents: AgentInfo[]): void {
    this.agents.clear();
    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }

    if (this.options.autoExpand) {
      this.autoExpandNodes();
    }

    this.render();
  }

  // ─── Get Selected ──────────────────────────────────────────────────────

  getSelectedAgentId(): string | null {
    return this.selectedAgentId;
  }

  // ─── Get Expanded ──────────────────────────────────────────────────────

  getExpandedIds(): string[] {
    return Array.from(this.expandedNodes);
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private autoExpandNodes(): void {
    for (const agent of this.agents.values()) {
      if (
        agent.status === 'running' ||
        agent.status === 'processing' ||
        agent.status === 'loading'
      ) {
        this.expandedNodes.add(agent.id);
      }
    }
  }

  private emitAgentClick(agentId: string, agent: AgentInfo): void {
    for (const cb of this.agentClickCallbacks) {
      cb(agentId, agent);
    }
  }

  private emitArrowClick(agentId: string, expanded: boolean): void {
    for (const cb of this.arrowClickCallbacks) {
      cb(agentId, expanded);
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  destroy(): void {
    this.agents.clear();
    this.expandedNodes.clear();
    this.agentClickCallbacks = [];
    this.arrowClickCallbacks = [];
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
  }
}
