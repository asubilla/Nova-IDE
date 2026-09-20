import { EventEmitter } from 'events';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ArrowIndicatorConfig {
  size?: number;
  color?: string;
  hoverColor?: string;
  tooltipOffset?: number;
}

// ─── AgentArrowIndicator ────────────────────────────────────────────────────

export class AgentArrowIndicator extends EventEmitter {
  private element: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private config: Required<ArrowIndicatorConfig>;
  private isExpanded = false;
  private currentAgentId: string | null = null;
  private hasChildren = false;

  private static readonly DEFAULT_CONFIG: Required<ArrowIndicatorConfig> = {
    size: 24,
    color: '#4fc1ff',
    hoverColor: '#6fd4ff',
    tooltipOffset: 8,
  };

  constructor(config?: ArrowIndicatorConfig) {
    super();
    this.config = { ...AgentArrowIndicator.DEFAULT_CONFIG, ...config };
  }

  render(agentId: string, hasChildren: boolean): HTMLElement {
    this.currentAgentId = agentId;
    this.hasChildren = hasChildren;

    if (!this.element) {
      this.element = document.createElement('div');
      this.element.className = 'agent-arrow-indicator';
      this.element.style.cssText = `
        display: inline-flex; align-items: center; justify-content: center;
        width: ${this.config.size}px; height: ${this.config.size}px;
        cursor: pointer; border-radius: 4px; transition: all 0.15s;
        position: relative;
      `;
    }

    this.element.innerHTML = '';
    this.element.style.background = 'transparent';

    if (hasChildren) {
      this.element.appendChild(this.renderExpandIcon(this.isExpanded));
    } else {
      this.element.appendChild(this.renderExternalLinkIcon());
    }

    this.setupEventListeners();

    return this.element;
  }

  renderExpandIcon(isExpanded: boolean): HTMLElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(this.config.size - 8));
    svg.setAttribute('height', String(this.config.size - 8));
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    if (isExpanded) {
      path.setAttribute('d', 'M4 10L8 6L12 10');
      path.setAttribute('stroke', this.config.color);
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    } else {
      path.setAttribute('d', 'M6 4L10 8L6 12');
      path.setAttribute('stroke', this.config.color);
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    }

    svg.appendChild(path);

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;justify-content:center;';
    wrapper.appendChild(svg);
    return wrapper;
  }

  renderExternalLinkIcon(): HTMLElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(this.config.size - 8));
    svg.setAttribute('height', String(this.config.size - 8));
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('stroke', this.config.color);
    g.setAttribute('stroke-width', '1.5');
    g.setAttribute('stroke-linecap', 'round');
    g.setAttribute('stroke-linejoin', 'round');

    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'M6 3H4C3.44772 3 3 3.44772 3 4V12C3 12.5523 3.44772 13 4 13H12C12.5523 13 13 12.5523 13 12V10');
    g.appendChild(path1);

    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('d', 'M9 3H13V7');
    g.appendChild(path2);

    const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path3.setAttribute('d', 'M13 3L7 9');
    g.appendChild(path3);

    svg.appendChild(g);

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;justify-content:center;';
    wrapper.appendChild(svg);
    return wrapper;
  }

  renderArrowToSubAgent(parentId: string, childId: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'agent-arrow-connector';
    container.style.cssText = `
      display: flex; align-items: center; gap: 4px;
      padding: 2px 0; position: relative;
    `;

    const line = document.createElement('div');
    line.style.cssText = `
      width: 1px; height: 16px; background: ${this.config.color}44;
      position: absolute; left: ${this.config.size / 2}px; top: 0;
    `;
    container.appendChild(line);

    const arrow = document.createElement('div');
    arrow.style.cssText = `
      width: ${this.config.size}px; height: ${this.config.size}px;
      display: flex; align-items: center; justify-content: center;
    `;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M8 3V13M8 13L4 9M8 13L12 9');
    path.setAttribute('stroke', this.config.color);
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    arrow.appendChild(svg);
    container.appendChild(arrow);

    container.dataset.parentId = parentId;
    container.dataset.childId = childId;

    return container;
  }

  onClick(callback: (agentId: string) => void): void {
    this.on('click', callback);
  }

  renderTooltip(text: string): HTMLElement {
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'agent-arrow-tooltip';
      this.tooltip.style.cssText = `
        position: absolute; bottom: calc(100% + ${this.config.tooltipOffset}px);
        left: 50%; transform: translateX(-50%);
        background: #333; color: #d4d4d4; padding: 4px 8px;
        border-radius: 4px; font-size: 11px; white-space: nowrap;
        pointer-events: none; opacity: 0; transition: opacity 0.15s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3); z-index: 100;
      `;
    }

    this.tooltip.textContent = text;
    return this.tooltip;
  }

  setExpanded(expanded: boolean): void {
    this.isExpanded = expanded;
    if (this.element) {
      this.render(this.currentAgentId ?? '', this.hasChildren);
    }
  }

  toggleExpanded(): void {
    this.setExpanded(!this.isExpanded);
    this.emit('toggle', this.currentAgentId, this.isExpanded);
  }

  destroy(): void {
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    this.removeAllListeners();
  }

  private setupEventListeners(): void {
    if (!this.element) return;

    this.element.addEventListener('click', () => {
      if (this.hasChildren) {
        this.toggleExpanded();
      }
      this.emit('click', this.currentAgentId);
    });

    this.element.addEventListener('mouseenter', () => {
      if (this.element) {
        this.element.style.background = `${this.config.color}22`;
      }
      this.showTooltip();
    });

    this.element.addEventListener('mouseleave', () => {
      if (this.element) {
        this.element.style.background = 'transparent';
      }
      this.hideTooltip();
    });
  }

  private showTooltip(): void {
    if (!this.tooltip || !this.element) return;
    const text = this.hasChildren
      ? this.isExpanded ? 'Collapse sub-agents' : 'Expand sub-agents'
      : 'Open agent details';
    this.renderTooltip(text);
    this.element.appendChild(this.tooltip);
    requestAnimationFrame(() => {
      if (this.tooltip) this.tooltip.style.opacity = '1';
    });
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.style.opacity = '0';
      setTimeout(() => {
        this.tooltip?.remove();
      }, 150);
    }
  }
}
