export interface DragDropConfig {
  maxFileSize?: number;
  maxFiles?: number;
  allowedTypes?: string[];
  onFilesSelected?: (files: DragDropFile[]) => void;
  onFileRemoved?: (fileId: string) => void;
  onUploadProgress?: (fileId: string, progress: number) => void;
  onUploadComplete?: (fileId: string, url: string) => void;
  onUploadError?: (fileId: string, error: string) => void;
}

export interface DragDropFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  preview?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  url?: string;
  error?: string;
}

interface DragDropState {
  isDragging: boolean;
  dragCounter: number;
  files: DragDropFile[];
  dropZone: HTMLElement | null;
  fileList: HTMLElement | null;
  pasteHandler: ((e: ClipboardEvent) => void) | null;
}

const DEFAULT_MAX_SIZE = 50 * 1024 * 1024;
const DEFAULT_MAX_FILES = 20;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

export class DragDrop {
  private config: Required<DragDropConfig>;
  private state: DragDropState;
  private fileIdCounter = 0;

  constructor(config?: DragDropConfig) {
    this.config = {
      maxFileSize: config?.maxFileSize ?? DEFAULT_MAX_SIZE,
      maxFiles: config?.maxFiles ?? DEFAULT_MAX_FILES,
      allowedTypes: config?.allowedTypes ?? [],
      onFilesSelected: config?.onFilesSelected ?? (() => {}),
      onFileRemoved: config?.onFileRemoved ?? (() => {}),
      onUploadProgress: config?.onUploadProgress ?? (() => {}),
      onUploadComplete: config?.onUploadComplete ?? (() => {}),
      onUploadError: config?.onUploadError ?? (() => {}),
    };
    this.state = {
      isDragging: false,
      dragCounter: 0,
      files: [],
      dropZone: null,
      fileList: null,
      pasteHandler: null,
    };
  }

  init(element: HTMLElement): void {
    this.state.dropZone = this.renderDropZone();
    this.state.fileList = this.renderFileList();

    element.appendChild(this.state.dropZone);
    element.appendChild(this.state.fileList);

    this.state.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.state.dropZone.addEventListener('drop', (e) => this.handleDrop(e));
    this.state.dropZone.addEventListener('dragenter', (e) => this.handleDragEnter(e));
    this.state.dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));

    this.state.pasteHandler = (e: ClipboardEvent) => this.handlePaste(e);
    document.addEventListener('paste', this.state.pasteHandler);

    const input = this.state.dropZone.querySelector<HTMLInputElement>('.drag-drop-input');
    if (input) {
      input.addEventListener('change', () => {
        if (input.files) this.processFiles(Array.from(input.files));
        input.value = '';
      });
    }
  }

  handleDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  handleDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.state.isDragging = false;
    this.state.dragCounter = 0;
    this.updateDropZoneVisual();

    if (e.dataTransfer?.files) {
      this.processFiles(Array.from(e.dataTransfer.files));
    }
  }

  handleDragEnter(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.state.dragCounter++;
    this.state.isDragging = true;
    this.updateDropZoneVisual();
  }

  handleDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.state.dragCounter--;
    if (this.state.dragCounter === 0) {
      this.state.isDragging = false;
      this.updateDropZoneVisual();
    }
  }

  handlePaste(e: ClipboardEvent): void {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) this.processFiles(files);
  }

  renderDropZone(): HTMLElement {
    const zone = document.createElement('div');
    zone.className = 'drag-drop-zone';
    zone.setAttribute('role', 'button');
    zone.setAttribute('tabindex', '0');
    zone.setAttribute('aria-label', 'File upload area. Click or drop files here.');

    zone.innerHTML = `
      <input type="file" class="drag-drop-input" multiple style="display:none" aria-hidden="true" />
      <div class="drag-drop-zone-content">
        <div class="drag-drop-zone-icon">&#128194;</div>
        <div class="drag-drop-zone-text">Drag & drop files here, or <span class="drag-drop-browse">browse</span></div>
        <div class="drag-drop-zone-hint">Max ${this.formatSize(this.config.maxFileSize)} per file &bull; Ctrl+V to paste</div>
      </div>
    `;

    const browseBtn = zone.querySelector('.drag-drop-browse') as HTMLElement;
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      zone.querySelector<HTMLInputElement>('.drag-drop-input')?.click();
    });
    zone.addEventListener('click', () => zone.querySelector<HTMLInputElement>('.drag-drop-input')?.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        zone.querySelector<HTMLInputElement>('.drag-drop-input')?.click();
      }
    });

    return zone;
  }

  renderFileList(): HTMLElement {
    const list = document.createElement('div');
    list.className = 'drag-drop-file-list';
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Uploaded files');
    return list;
  }

  validateFile(file: File): { valid: boolean; error?: string } {
    if (file.size > this.config.maxFileSize) {
      return { valid: false, error: `File exceeds ${this.formatSize(this.config.maxFileSize)} limit` };
    }
    if (this.config.allowedTypes.length > 0 && !this.config.allowedTypes.includes(file.type)) {
      return { valid: false, error: `File type "${file.type || 'unknown'}" is not allowed` };
    }
    if (this.state.files.length >= this.config.maxFiles) {
      return { valid: false, error: `Maximum ${this.config.maxFiles} files allowed` };
    }
    return { valid: true };
  }

  uploadFile(fileId: string): void {
    const file = this.state.files.find((f) => f.id === fileId);
    if (!file || file.status === 'uploading' || file.status === 'complete') return;

    file.status = 'uploading';
    file.progress = 0;
    this.renderFileItem(file);

    const simulateProgress = () => {
      if (file.status !== 'uploading') return;
      file.progress = Math.min(100, file.progress + Math.random() * 30);
      this.config.onUploadProgress(fileId, file.progress);
      this.renderFileItem(file);

      if (file.progress >= 100) {
        file.status = 'complete';
        file.url = URL.createObjectURL(file.file);
        this.config.onUploadComplete(fileId, file.url);
        this.renderFileItem(file);
      } else {
        setTimeout(simulateProgress, 200 + Math.random() * 300);
      }
    };

    simulateProgress();
  }

  removeFile(fileId: string): void {
    const file = this.state.files.find((f) => f.id === fileId);
    if (file?.preview) URL.revokeObjectURL(file.preview);
    if (file?.url) URL.revokeObjectURL(file.url);
    this.state.files = this.state.files.filter((f) => f.id !== fileId);
    this.config.onFileRemoved(fileId);
    this.updateFileList();
  }

  getFiles(): DragDropFile[] {
    return [...this.state.files];
  }

  clear(): void {
    this.state.files.forEach((f) => {
      if (f.preview) URL.revokeObjectURL(f.preview);
      if (f.url) URL.revokeObjectURL(f.url);
    });
    this.state.files = [];
    this.updateFileList();
  }

  destroy(): void {
    if (this.state.pasteHandler) {
      document.removeEventListener('paste', this.state.pasteHandler);
    }
    this.clear();
    this.state.dropZone?.remove();
    this.state.fileList?.remove();
    this.state.dropZone = null;
    this.state.fileList = null;
  }

  private processFiles(rawFiles: File[]): void {
    const validated: DragDropFile[] = [];

    for (const raw of rawFiles) {
      const check = this.validateFile(raw);
      const id = `file-${++this.fileIdCounter}`;
      const dragFile: DragDropFile = {
        id,
        file: raw,
        name: raw.name,
        size: raw.size,
        type: raw.type,
        progress: 0,
        status: check.valid ? 'pending' : 'error',
        error: check.error,
      };

      if (check.valid && IMAGE_TYPES.includes(raw.type)) {
        dragFile.preview = URL.createObjectURL(raw);
      }

      this.state.files.push(dragFile);
      validated.push(dragFile);
    }

    this.updateFileList();
    this.config.onFilesSelected(validated);
    validated.filter((f) => f.status === 'pending').forEach((f) => this.uploadFile(f.id));
  }

  private updateDropZoneVisual(): void {
    if (!this.state.dropZone) return;
    this.state.dropZone.classList.toggle('drag-drop-zone-active', this.state.isDragging);
  }

  private updateFileList(): void {
    if (!this.state.fileList) return;
    this.state.fileList.innerHTML = '';
    if (this.state.files.length === 0) {
      this.state.fileList.style.display = 'none';
      return;
    }
    this.state.fileList.style.display = '';
    for (const file of this.state.files) {
      this.state.fileList.appendChild(this.renderFileItem(file));
    }
  }

  private renderFileItem(file: DragDropFile): HTMLElement {
    const existing = this.state.fileList?.querySelector(`[data-file-id="${file.id}"]`);
    const el = existing ? existing as HTMLElement : document.createElement('div');
    el.className = `drag-drop-file-item drag-drop-file-${file.status}`;
    el.setAttribute('role', 'listitem');
    el.setAttribute('data-file-id', file.id);

    const previewHtml = file.preview
      ? `<img src="${file.preview}" alt="${this.escapeHtml(file.name)}" class="drag-drop-file-preview" />`
      : `<div class="drag-drop-file-icon">${this.getFileIcon(file.type)}</div>`;

    el.innerHTML = `
      ${previewHtml}
      <div class="drag-drop-file-info">
        <div class="drag-drop-file-name" title="${this.escapeHtml(file.name)}">${this.escapeHtml(file.name)}</div>
        <div class="drag-drop-file-size">${this.formatSize(file.size)}</div>
        ${file.error ? `<div class="drag-drop-file-error">${this.escapeHtml(file.error)}</div>` : ''}
      </div>
      ${file.status === 'uploading' ? `
        <div class="drag-drop-file-progress">
          <div class="drag-drop-file-progress-bar" style="width:${file.progress}%"></div>
        </div>
      ` : ''}
      ${file.status === 'complete' ? '<div class="drag-drop-file-check">&#10003;</div>' : ''}
      <button class="drag-drop-file-remove" aria-label="Remove ${this.escapeHtml(file.name)}" data-file-id="${file.id}">&times;</button>
    `;

    if (!existing) {
      const removeBtn = el.querySelector('.drag-drop-file-remove') as HTMLButtonElement;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeFile(file.id);
      });
    }

    return el;
  }

  private getFileIcon(type: string): string {
    if (type.startsWith('image/')) return '&#128444;';
    if (type.startsWith('video/')) return '&#127909;';
    if (type.startsWith('audio/')) return '&#127925;';
    if (type.includes('pdf')) return '&#128196;';
    if (type.includes('zip') || type.includes('rar') || type.includes('tar')) return '&#128230;';
    if (type.includes('json') || type.includes('javascript') || type.includes('typescript')) return '&#128187;';
    return '&#128196;';
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
