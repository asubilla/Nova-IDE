export interface LinkMetadata {
  url: string;
  title: string;
  description: string;
  image?: string;
  favicon?: string;
  siteName: string;
  fetchedAt: number;
}

interface LinkPreviewOptions {
  cacheDuration?: number;
  debounceMs?: number;
  maxPreviews?: number;
}

const DEFAULT_OPTIONS: Required<LinkPreviewOptions> = {
  cacheDuration: 5 * 60 * 1000,
  debounceMs: 300,
  maxPreviews: 5,
};

export class LinkPreview {
  private cache = new Map<string, LinkMetadata>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private options: Required<LinkPreviewOptions>;

  constructor(options?: LinkPreviewOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  isValidUrl(text: string): boolean {
    try {
      const url = new URL(text);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  extractUrls(text: string): string[] {
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const matches = text.match(urlPattern) ?? [];
    const unique = [...new Set(matches)];
    return unique.slice(0, this.options.maxPreviews);
  }

  async fetchMetadata(url: string): Promise<LinkMetadata> {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.fetchedAt < this.options.cacheDuration) {
      return cached;
    }

    const metadata: LinkMetadata = {
      url,
      title: this.extractTitleFromUrl(url),
      description: `Preview for ${url}`,
      image: undefined,
      favicon: this.getFaviconUrl(url),
      siteName: this.extractDomain(url),
      fetchedAt: Date.now(),
    };

    this.cache.set(url, metadata);
    return metadata;
  }

  renderCard(metadata: LinkMetadata): HTMLElement {
    const card = document.createElement('a');
    card.className = 'link-preview-card';
    card.href = metadata.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    card.innerHTML = `
      <div class="link-preview-inner">
        <div class="link-preview-text">
          <div class="link-preview-site">
            ${metadata.favicon ? `<img class="link-preview-favicon" src="${metadata.favicon}" alt="" onerror="this.style.display='none'">` : ''}
            <span class="link-preview-site-name">${this.escapeHtml(metadata.siteName)}</span>
          </div>
          <div class="link-preview-title">${this.escapeHtml(metadata.title)}</div>
          <div class="link-preview-description">${this.escapeHtml(metadata.description)}</div>
          <div class="link-preview-url">${this.escapeHtml(this.truncateUrl(metadata.url))}</div>
        </div>
        ${metadata.image ? `<div class="link-preview-image"><img src="${metadata.image}" alt="" onerror="this.parentElement.remove()"></div>` : ''}
      </div>
    `;

    return card;
  }

  renderSkeleton(): HTMLElement {
    const skeleton = document.createElement('div');
    skeleton.className = 'link-preview-card link-preview-loading';
    skeleton.innerHTML = `
      <div class="link-preview-inner">
        <div class="link-preview-text">
          <div class="link-preview-site skeleton-line skeleton-short"></div>
          <div class="link-preview-title skeleton-line skeleton-medium"></div>
          <div class="link-preview-description skeleton-line skeleton-long"></div>
        </div>
      </div>
    `;
    return skeleton;
  }

  renderError(url: string): HTMLElement {
    const el = document.createElement('a');
    el.className = 'link-preview-card link-preview-error';
    el.href = url;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.innerHTML = `
      <div class="link-preview-inner">
        <div class="link-preview-text">
          <div class="link-preview-title">${this.escapeHtml(this.truncateUrl(url))}</div>
          <div class="link-preview-description">Unable to load preview</div>
        </div>
      </div>
    `;
    return el;
  }

  async render(url: string): Promise<HTMLElement> {
    if (!this.isValidUrl(url)) {
      return this.renderError(url);
    }

    const skeleton = this.renderSkeleton();

    try {
      const metadata = await this.fetchMetadata(url);
      return this.renderCard(metadata);
    } catch {
      return this.renderError(url);
    }
  }

  renderUrlPreviews(text: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const urls = this.extractUrls(text);

    if (urls.length === 0) {
      fragment.appendChild(document.createTextNode(text));
      return fragment;
    }

    let lastIndex = 0;
    const fullPattern = urls.map(this.escapeRegExp).join('|');
    const regex = new RegExp(fullPattern, 'gi');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const url = match[0];
      const container = document.createElement('div');
      container.appendChild(this.renderSkeleton());
      fragment.appendChild(container);

      this.render(url).then((card) => {
        container.replaceChildren(card);
      });

      lastIndex = match.index + url.length;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    return fragment;
  }

  debouncedRender(url: string, callback: (element: HTMLElement) => void): void {
    const existing = this.debounceTimers.get(url);
    if (existing) {
      clearTimeout(existing);
    }

    this.debounceTimers.set(
      url,
      setTimeout(() => {
        this.render(url).then(callback);
        this.debounceTimers.delete(url);
      }, this.options.debounceMs)
    );
  }

  clearCache(): void {
    this.cache.clear();
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  private extractTitleFromUrl(url: string): string {
    const domain = this.extractDomain(url);
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  private getFaviconUrl(url: string): string {
    try {
      const { origin } = new URL(url);
      return `${origin}/favicon.ico`;
    } catch {
      return '';
    }
  }

  private truncateUrl(url: string, maxLen = 60): string {
    return url.length > maxLen ? url.slice(0, maxLen - 3) + '...' : url;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
