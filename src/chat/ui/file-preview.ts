import { ChatAttachment } from '../chat-types';
import { ImagePreview } from './image-preview';

const IMAGE_EXT = ['png','jpg','jpeg','gif','webp','svg','bmp','ico'];
const VIDEO_EXT = ['mp4','webm','ogg','mov','avi'];
const AUDIO_EXT = ['mp3','wav','ogg','flac','aac','m4a'];
const CODE_EXT = ['ts','tsx','js','jsx','py','java','cpp','c','h','cs','rb','go','rs','php','swift','kt','html','css','scss','json','yaml','yml','toml','xml','sql','sh','bash','ps1'];
const PDF_EXT = ['pdf'];
const ARCHIVE_EXT = ['zip','rar','7z','tar','gz','bz2'];

const ICONS: Record<string, string> = {
  pdf: '\ud83d\udcc4', doc: '\ud83d\udcc3', docx: '\ud83d\udcc3',
  xls: '\ud83d\udcca', xlsx: '\ud83d\udcca', ppt: '\ud83d\udcca', pptx: '\ud83d\udcca',
  zip: '\ud83d\udce6', rar: '\ud83d\udce6', '7z': '\ud83d\udce6', tar: '\ud83d\udce6', gz: '\ud83d\udce6',
  mp4: '\ud83c\udfac', webm: '\ud83c\udfac', mov: '\ud83c\udfac',
  mp3: '\ud83c\udfb5', wav: '\ud83c\udfb5', flac: '\ud83c\udfb5',
  png: '\ud83d\uddbc\ufe0f', jpg: '\ud83d\uddbc\ufe0f', jpeg: '\ud83d\uddbc\ufe0f', gif: '\ud83d\uddbc\ufe0f',
  ts: '\ud83d\ude80', js: '\ud83d\ude80', py: '\ud83d\ude80', java: '\ud83d\ude80',
  json: '\ud83d\udd22', xml: '\ud83d\udd22', yaml: '\ud83d\udd22',
  txt: '\ud83d\udcdd', md: '\ud83d\udcdd',
};

export class FilePreview {
  private imagePreview: ImagePreview;

  constructor() {
    this.imagePreview = new ImagePreview();
  }

  getFileIcon(filename: string): string {
    const ext = this.getExtension(filename);
    return ICONS[ext] ?? '\ud83d\udcc1';
  }

  renderFile(attachment: ChatAttachment): HTMLElement {
    const ext = this.getExtension(attachment.fileName);
    if (IMAGE_EXT.includes(ext)) return this.renderImageFile(attachment);
    if (PDF_EXT.includes(ext)) return this.renderPdfPreview(attachment.url, attachment.fileName);
    if (VIDEO_EXT.includes(ext)) return this.renderVideoPlayer(attachment.url, attachment.fileName);
    if (AUDIO_EXT.includes(ext)) return this.renderAudioPlayer(attachment.url, attachment.fileName);
    if (CODE_EXT.includes(ext)) return this.renderCodeFile(attachment.fileName);
    if (ARCHIVE_EXT.includes(ext)) return this.renderArchivePreview(attachment.fileName, attachment.fileSize);
    return this.renderGenericFile(attachment);
  }

  private renderImageFile(attachment: ChatAttachment): HTMLElement {
    const container = document.createElement('div');
    container.className = 'file-preview-image';
    container.appendChild(this.imagePreview.renderImage(attachment.url, attachment.fileName));
    return container;
  }

  renderPdfPreview(url: string, filename: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'file-preview-pdf';

    const header = document.createElement('div');
    header.className = 'file-preview-header';
    header.innerHTML = `
      <span class="file-preview-icon">${this.getFileIcon(filename)}</span>
      <div class="file-preview-info">
        <div class="file-preview-name">${this.escapeHtml(filename)}</div>
        <div class="file-preview-type">PDF Document</div>
      </div>`;

    const viewer = document.createElement('iframe');
    viewer.className = 'file-preview-pdf-viewer';
    viewer.src = url;
    viewer.setAttribute('loading', 'lazy');

    const actions = this.createActionButtons(url, filename);
    container.append(header, viewer, actions);
    return container;
  }

  renderVideoPlayer(url: string, filename: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'file-preview-video';

    const header = document.createElement('div');
    header.className = 'file-preview-header';
    header.innerHTML = `
      <span class="file-preview-icon">${this.getFileIcon(filename)}</span>
      <div class="file-preview-info">
        <div class="file-preview-name">${this.escapeHtml(filename)}</div>
        <div class="file-preview-type">Video</div>
      </div>`;

    const video = document.createElement('video');
    video.className = 'file-preview-video-player';
    video.src = url;
    video.controls = true;
    video.preload = 'metadata';
    (video as any).controlsList = 'nodownload';

    const actions = this.createActionButtons(url, filename);
    container.append(header, video, actions);
    return container;
  }

  renderAudioPlayer(url: string, filename: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'file-preview-audio';

    const header = document.createElement('div');
    header.className = 'file-preview-header';
    header.innerHTML = `
      <span class="file-preview-icon">${this.getFileIcon(filename)}</span>
      <div class="file-preview-info">
        <div class="file-preview-name">${this.escapeHtml(filename)}</div>
        <div class="file-preview-type">Audio</div>
      </div>`;

    const audio = document.createElement('audio');
    audio.className = 'file-preview-audio-player';
    audio.src = url;
    audio.controls = true;
    audio.preload = 'metadata';

    const actions = this.createActionButtons(url, filename);
    container.append(header, audio, actions);
    return container;
  }

  renderCodeFile(filename: string, content?: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'file-preview-code';

    const ext = this.getExtension(filename);
    const header = document.createElement('div');
    header.className = 'file-preview-header';
    header.innerHTML = `
      <span class="file-preview-icon">${this.getFileIcon(filename)}</span>
      <div class="file-preview-info">
        <div class="file-preview-name">${this.escapeHtml(filename)}</div>
        <div class="file-preview-type badge-code">${ext.toUpperCase()} File</div>
      </div>`;

    const pre = document.createElement('pre');
    pre.className = 'file-preview-code-block';
    const code = document.createElement('code');
    code.textContent = content ?? `// ${filename}`;
    pre.appendChild(code);

    container.append(header, pre);
    return container;
  }

  renderArchivePreview(filename: string, fileSize?: number): HTMLElement {
    const container = document.createElement('div');
    container.className = 'file-preview-archive';
    const ext = this.getExtension(filename);
    const sizeText = fileSize ? ` \u00b7 ${this.formatFileSize(fileSize)}` : '';
    container.innerHTML = `
      <div class="file-preview-header">
        <span class="file-preview-icon">${this.getFileIcon(filename)}</span>
        <div class="file-preview-info">
          <div class="file-preview-name">${this.escapeHtml(filename)}</div>
          <div class="file-preview-type badge-archive">${ext.toUpperCase()} Archive${sizeText}</div>
        </div>
      </div>`;
    return container;
  }

  renderGenericFile(attachment: ChatAttachment): HTMLElement {
    const container = document.createElement('div');
    container.className = 'file-preview-generic';
    const typeInfo = `${this.escapeHtml(attachment.fileType)} \u00b7 ${this.formatFileSize(attachment.fileSize)}`;
    container.innerHTML = `
      <div class="file-preview-header">
        <span class="file-preview-icon">${this.getFileIcon(attachment.fileName)}</span>
        <div class="file-preview-info">
          <div class="file-preview-name">${this.escapeHtml(attachment.fileName)}</div>
          <div class="file-preview-type">${typeInfo}</div>
        </div>
      </div>`;
    const actions = this.createActionButtons(attachment.url, attachment.fileName);
    container.appendChild(actions);
    return container;
  }

  private createActionButtons(url: string, filename: string): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'file-preview-actions';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'file-action-btn';
    downloadBtn.textContent = 'Download';
    downloadBtn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    const previewBtn = document.createElement('button');
    previewBtn.className = 'file-action-btn';
    previewBtn.textContent = 'Open';
    previewBtn.addEventListener('click', () => window.open(url, '_blank'));

    const shareBtn = document.createElement('button');
    shareBtn.className = 'file-action-btn';
    shareBtn.textContent = 'Copy Link';
    shareBtn.addEventListener('click', () => navigator.clipboard.writeText(url));

    bar.append(downloadBtn, previewBtn, shareBtn);
    return bar;
  }

  private getExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
}
