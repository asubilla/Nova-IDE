export type DiagramType =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'state'
  | 'er'
  | 'gantt'
  | 'pie'
  | 'mindmap';

export interface MermaidRendererConfig {
  theme?: 'default' | 'dark' | 'forest' | 'neutral' | 'base';
  backgroundColor?: string;
  onRender?: (svg: string) => void;
  onError?: (error: Error) => void;
}

export interface DiagramInfo {
  type: DiagramType;
  label: string;
  keywords: string[];
  example: string;
}

const DIAGRAM_INFO: DiagramInfo[] = [
  {
    type: 'flowchart',
    label: 'Flowchart',
    keywords: ['graph', 'flowchart', 'TD', 'LR', 'RL', 'BT'],
    example: 'graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[OK]\n  B -->|No| D[Cancel]',
  },
  {
    type: 'sequence',
    label: 'Sequence Diagram',
    keywords: ['sequenceDiagram', 'participant', '->', '-->>'],
    example:
      'sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>B: Hello\n  B-->>A: Hi there',
  },
  {
    type: 'class',
    label: 'Class Diagram',
    keywords: ['classDiagram', 'class', 'Animal', 'Dog', 'Cat'],
    example:
      'classDiagram\n  class Animal {\n    +String name\n    +int age\n    +makeSound()\n  }\n  class Dog {\n    +bark()\n  }\n  Animal <|-- Dog',
  },
  {
    type: 'state',
    label: 'State Diagram',
    keywords: ['stateDiagram', 'state', 'transition'],
    example:
      'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Processing : submit\n  Processing --> Idle : complete\n  Processing --> Error : fail\n  Error --> Idle : retry',
  },
  {
    type: 'er',
    label: 'ER Diagram',
    keywords: ['erDiagram', 'ENTITY', 'relationship'],
    example:
      'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE-ITEM : contains\n  CUSTOMER {\n    int id\n    string name\n  }',
  },
  {
    type: 'gantt',
    label: 'Gantt Chart',
    keywords: ['gantt', 'title', 'section', 'task'],
    example:
      'gantt\n  title Project Plan\n  section Phase 1\n  Task A :a1, 2024-01-01, 30d\n  Task B :after a1, 20d',
  },
  {
    type: 'pie',
    label: 'Pie Chart',
    keywords: ['pie', 'title'],
    example:
      'pie title Languages\n  "JavaScript" : 40\n  "Python" : 30\n  "Rust" : 20\n  "Other" : 10',
  },
  {
    type: 'mindmap',
    label: 'Mindmap',
    keywords: ['mindmap', 'root'],
    example:
      'mindmap\n  root((Project))\n    Frontend\n      React\n      CSS\n    Backend\n      Node\n      Python',
  },
];

export class MermaidRenderer {
  private container: HTMLElement | null = null;
  private svgContainer: HTMLDivElement | null = null;
  private controlsEl: HTMLDivElement | null = null;
  private config: MermaidRendererConfig;
  private currentSvg: string = '';
  private zoom: number = 1;
  private panX: number = 0;
  private panY: number = 0;
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private isFullscreen: boolean = false;
  private mermaidReady: boolean = false;

  constructor(config: MermaidRendererConfig = {}) {
    this.config = {
      theme: 'default',
      backgroundColor: 'transparent',
      ...config,
    };
    this.initMermaid();
  }

  private async initMermaid(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).mermaid) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
        script.onload = () => {
          this.configureMermaid();
          this.mermaidReady = true;
        };
        document.head.appendChild(script);
      } else if ((window as unknown as Record<string, unknown>).mermaid) {
        this.configureMermaid();
        this.mermaidReady = true;
      }
    } catch {
      this.mermaidReady = false;
    }
  }

  private configureMermaid(): void {
    const mermaid = (window as unknown as Record<string, unknown>).mermaid as {
      initialize: (config: Record<string, unknown>) => void;
    };
    if (mermaid) {
      mermaid.initialize({
        startOnLoad: false,
        theme: this.config.theme,
        securityLevel: 'loose',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      });
    }
  }

  async render(code: string, container: HTMLElement): Promise<void> {
    this.container = container;
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-wrapper';

    const controls = this.renderControls();
    this.controlsEl = controls;

    this.svgContainer = document.createElement('div');
    this.svgContainer.className = 'mermaid-svg-container';

    const placeholder = document.createElement('div');
    placeholder.className = 'mermaid-placeholder';
    placeholder.textContent = 'Rendering diagram...';

    this.svgContainer.appendChild(placeholder);
    wrapper.appendChild(controls);
    wrapper.appendChild(this.svgContainer);

    container.appendChild(wrapper);

    const validation = this.validate(code);
    if (!validation.valid) {
      this.showError(new Error(validation.error!));
      return;
    }

    try {
      await this.renderDiagram(code);
    } catch (err) {
      this.showError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async renderDiagram(code: string): Promise<void> {
    if (!this.svgContainer) return;

    if (!this.mermaidReady) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (this.mermaidReady) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 5000);
      });
    }

    const mermaid = (window as unknown as Record<string, unknown>).mermaid as {
      render: (id: string, text: string) => Promise<{ svg: string }>;
    };

    if (!mermaid) {
      this.showStaticFallback(code);
      return;
    }

    try {
      const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { svg } = await mermaid.render(id, code);
      this.currentSvg = svg;

      if (this.svgContainer) {
        this.svgContainer.innerHTML = '';
        const svgWrapper = document.createElement('div');
        svgWrapper.className = 'mermaid-svg-inner';
        svgWrapper.innerHTML = svg;
        svgWrapper.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
        this.svgContainer.appendChild(svgWrapper);
      }

      this.config.onRender?.(svg);
    } catch (err) {
      this.showError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private showStaticFallback(code: string): void {
    if (!this.svgContainer) return;
    this.svgContainer.innerHTML = '';

    const fallback = document.createElement('div');
    fallback.className = 'mermaid-fallback';

    const pre = document.createElement('pre');
    pre.className = 'mermaid-fallback-code';
    pre.textContent = code;

    const label = document.createElement('div');
    label.className = 'mermaid-fallback-label';
    label.textContent = 'Mermaid library not loaded. Showing raw code:';

    fallback.appendChild(label);
    fallback.appendChild(pre);
    this.svgContainer.appendChild(fallback);
  }

  validate(code: string): { valid: boolean; error?: string } {
    const trimmed = code.trim();
    if (!trimmed) {
      return { valid: false, error: 'Empty diagram code' };
    }

    const hasDiagramType = DIAGRAM_INFO.some((d) =>
      d.keywords.some((kw) => trimmed.startsWith(kw) || trimmed.includes(kw))
    );

    if (!hasDiagramType) {
      return {
        valid: false,
        error: `Unrecognized diagram type. Supported: ${DIAGRAM_INFO.map((d) => d.label).join(', ')}`,
      };
    }

    const openBrackets = (trimmed.match(/\{/g) || []).length;
    const closeBrackets = (trimmed.match(/\}/g) || []).length;
    if (openBrackets !== closeBrackets) {
      return { valid: false, error: 'Mismatched braces { } in diagram' };
    }

    const openParens = (trimmed.match(/\(/g) || []).length;
    const closeParens = (trimmed.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      return { valid: false, error: 'Mismatched parentheses ( ) in diagram' };
    }

    return { valid: true };
  }

  getSupportedDiagrams(): DiagramInfo[] {
    return [...DIAGRAM_INFO];
  }

  async exportSVG(): Promise<string> {
    if (!this.currentSvg) throw new Error('No diagram rendered');
    return this.currentSvg;
  }

  async exportPNG(): Promise<Blob> {
    if (!this.currentSvg) throw new Error('No diagram rendered');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    const img = new Image();
    const svgBlob = new Blob([this.currentSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    return new Promise((resolve, reject) => {
      img.onload = () => {
        canvas.width = img.naturalWidth * 2;
        canvas.height = img.naturalHeight * 2;
        ctx.scale(2, 2);
        ctx.fillStyle = this.config.backgroundColor || '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create PNG blob'));
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG for PNG conversion'));
      };
      img.src = url;
    });
  }

  zoomIn(): void {
    this.zoom = Math.min(3, this.zoom + 0.2);
    this.applyTransform();
  }

  zoomOut(): void {
    this.zoom = Math.max(0.2, this.zoom - 0.2);
    this.applyTransform();
  }

  resetZoom(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }

  fullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    this.container?.classList.toggle('mermaid-fullscreen', this.isFullscreen);
  }

  private applyTransform(): void {
    const inner = this.svgContainer?.querySelector('.mermaid-svg-inner') as HTMLElement;
    if (inner) {
      inner.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }
  }

  private renderControls(): HTMLDivElement {
    const controls = document.createElement('div');
    controls.className = 'mermaid-controls';

    const zoomInBtn = this.createButton('+', 'Zoom In', () => this.zoomIn());
    const zoomOutBtn = this.createButton('−', 'Zoom Out', () => this.zoomOut());
    const resetBtn = this.createButton('↺', 'Reset Zoom', () => this.resetZoom());

    const separator = document.createElement('span');
    separator.className = 'mermaid-controls-sep';

    const exportSVGBtn = this.createButton('SVG', 'Export SVG', () => {
      this.exportSVG().then((svg) => {
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'diagram.svg';
        a.click();
        URL.revokeObjectURL(url);
      });
    });

    const exportPNGBtn = this.createButton('PNG', 'Export PNG', () => {
      this.exportPNG().then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'diagram.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    });

    const copySVGBtn = this.createButton('Copy', 'Copy SVG', () => {
      navigator.clipboard.writeText(this.currentSvg).catch(() => {});
    });

    const fullscreenBtn = this.createButton('⛶', 'Fullscreen', () => this.fullscreen());

    controls.appendChild(zoomOutBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(zoomInBtn);
    controls.appendChild(separator);
    controls.appendChild(exportSVGBtn);
    controls.appendChild(exportPNGBtn);
    controls.appendChild(copySVGBtn);
    controls.appendChild(fullscreenBtn);

    return controls;
  }

  private createButton(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'mermaid-ctrl-btn';
    btn.type = 'button';
    btn.title = title;
    btn.textContent = text;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      onClick();
    });
    return btn;
  }

  private showError(error: Error): void {
    if (!this.svgContainer) return;
    this.svgContainer.innerHTML = '';

    const errorEl = document.createElement('div');
    errorEl.className = 'mermaid-error';

    const icon = document.createElement('div');
    icon.className = 'mermaid-error-icon';
    icon.textContent = '⚠';

    const message = document.createElement('div');
    message.className = 'mermaid-error-message';
    message.textContent = error.message;

    errorEl.appendChild(icon);
    errorEl.appendChild(message);
    this.svgContainer.appendChild(errorEl);

    this.config.onError?.(error);
  }
}
