export interface ImagePreviewData {
  url: string;
  caption?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
}

interface LightboxState {
  images: ImagePreviewData[];
  currentIndex: number;
  zoom: number;
  isOpen: boolean;
}

export class ImagePreview {
  private lightbox: LightboxState = {
    images: [],
    currentIndex: 0,
    zoom: 1,
    isOpen: false,
  };

  private lightboxEl: HTMLElement | null = null;
  private boundKeyHandler = this.handleKeydown.bind(this);
  private boundTouchStart: ((e: TouchEvent) => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;
  private boundTouchEnd: (() => void) | null = null;

  renderThumbnail(url: string, caption?: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'image-thumbnail-wrapper';

    const img = document.createElement('img');
    img.className = 'image-thumbnail';
    img.src = url;
    img.alt = caption ?? '';
    img.loading = 'lazy';

    img.addEventListener('load', () => {
      wrapper.classList.add('image-loaded');
    });

    img.addEventListener('error', () => {
      wrapper.classList.add('image-error');
      wrapper.innerHTML = '<div class="image-fallback">Failed to load image</div>';
    });

    wrapper.appendChild(img);
    return wrapper;
  }

  renderImage(url: string, caption?: string, thumbnail?: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'image-inline';

    const displayUrl = thumbnail ?? url;

    const img = document.createElement('img');
    img.className = 'image-inline-img';
    img.src = displayUrl;
    img.alt = caption ?? '';
    img.loading = 'lazy';
    img.style.cursor = 'zoom-in';

    const spinner = document.createElement('div');
    spinner.className = 'image-loading-spinner';
    spinner.textContent = 'Loading...';
    container.appendChild(spinner);

    img.addEventListener('load', () => {
      spinner.remove();
      container.appendChild(img);
    });

    img.addEventListener('error', () => {
      spinner.remove();
      const fallback = document.createElement('div');
      fallback.className = 'image-fallback';
      fallback.textContent = 'Failed to load image';
      container.appendChild(fallback);
    });

    img.addEventListener('click', () => {
      this.openLightbox([{ url, caption, thumbnail, width: img.naturalWidth, height: img.naturalHeight }]);
    });

    if (caption) {
      const captionEl = document.createElement('div');
      captionEl.className = 'image-caption';
      captionEl.textContent = caption;
      container.appendChild(captionEl);
    }

    return container;
  }

  openLightbox(images: ImagePreviewData[], startIndex = 0): void {
    this.lightbox = { images, currentIndex: startIndex, zoom: 1, isOpen: true };
    this.createLightboxElement();
    document.addEventListener('keydown', this.boundKeyHandler);
    document.body.style.overflow = 'hidden';
  }

  closeLightbox(): void {
    this.lightbox.isOpen = false;
    this.removeLightboxElement();
    document.removeEventListener('keydown', this.boundKeyHandler);
    document.body.style.overflow = '';
  }

  nextImage(): void {
    if (this.lightbox.currentIndex < this.lightbox.images.length - 1) {
      this.lightbox.currentIndex++;
      this.lightbox.zoom = 1;
      this.updateLightboxContent();
    }
  }

  prevImage(): void {
    if (this.lightbox.currentIndex > 0) {
      this.lightbox.currentIndex--;
      this.lightbox.zoom = 1;
      this.updateLightboxContent();
    }
  }

  zoomIn(): void {
    this.lightbox.zoom = Math.min(this.lightbox.zoom + 0.5, 5);
    this.applyZoom();
  }

  zoomOut(): void {
    this.lightbox.zoom = Math.max(this.lightbox.zoom - 0.5, 0.5);
    this.applyZoom();
  }

  resetZoom(): void {
    this.lightbox.zoom = 1;
    this.applyZoom();
  }

  async downloadImage(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = this.extractFilename(url);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  }

  async copyImageUrl(url: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }

  private createLightboxElement(): void {
    this.removeLightboxElement();

    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeLightbox();
      }
    });

    const content = document.createElement('div');
    content.className = 'lightbox-content';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lightbox-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => this.closeLightbox());

    const counter = document.createElement('div');
    counter.className = 'lightbox-counter';
    counter.id = 'lightbox-counter';

    const imgContainer = document.createElement('div');
    imgContainer.className = 'lightbox-image-container';
    imgContainer.id = 'lightbox-image-container';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'lightbox-nav lightbox-prev';
    prevBtn.textContent = '\u2039';
    prevBtn.addEventListener('click', () => this.prevImage());

    const nextBtn = document.createElement('button');
    nextBtn.className = 'lightbox-nav lightbox-next';
    nextBtn.textContent = '\u203a';
    nextBtn.addEventListener('click', () => this.nextImage());

    const controls = document.createElement('div');
    controls.className = 'lightbox-controls';

    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'lightbox-control-btn';
    zoomInBtn.textContent = '+';
    zoomInBtn.addEventListener('click', () => this.zoomIn());

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'lightbox-control-btn';
    zoomOutBtn.textContent = '-';
    zoomOutBtn.addEventListener('click', () => this.zoomOut());

    const resetBtn = document.createElement('button');
    resetBtn.className = 'lightbox-control-btn';
    resetBtn.textContent = '1:1';
    resetBtn.addEventListener('click', () => this.resetZoom());

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'lightbox-control-btn';
    downloadBtn.textContent = '\u2193';
    downloadBtn.addEventListener('click', () => {
      const current = this.lightbox.images[this.lightbox.currentIndex];
      if (current) this.downloadImage(current.url);
    });

    controls.append(zoomOutBtn, zoomInBtn, resetBtn, downloadBtn);

    const caption = document.createElement('div');
    caption.className = 'lightbox-caption';
    caption.id = 'lightbox-caption';

    content.append(closeBtn, counter, imgContainer, prevBtn, nextBtn, controls, caption);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    this.lightboxEl = overlay;

    this.setupTouchHandlers(imgContainer);
    this.updateLightboxContent();
  }

  private removeLightboxElement(): void {
    if (this.lightboxEl) {
      this.lightboxEl.remove();
      this.lightboxEl = null;
    }
    this.removeTouchHandlers();
  }

  private updateLightboxContent(): void {
    if (!this.lightboxEl || !this.lightbox.isOpen) return;

    const imgContainer = this.lightboxEl.querySelector('#lightbox-image-container');
    const counter = this.lightboxEl.querySelector('#lightbox-counter');
    const captionEl = this.lightboxEl.querySelector('#lightbox-caption');

    if (imgContainer) {
      const current = this.lightbox.images[this.lightbox.currentIndex];
      imgContainer.innerHTML = '';

      const img = document.createElement('img');
      img.className = 'lightbox-img';
      img.src = current.url;
      img.alt = current.caption ?? '';
      img.style.transform = `scale(${this.lightbox.zoom})`;
      imgContainer.appendChild(img);
    }

    if (counter) {
      counter.textContent = `${this.lightbox.currentIndex + 1} / ${this.lightbox.images.length}`;
    }

    if (captionEl) {
      const current = this.lightbox.images[this.lightbox.currentIndex];
      captionEl.textContent = current?.caption ?? '';
      (captionEl as HTMLElement).style.display = current?.caption ? 'block' : 'none';
    }

    const prevBtn = this.lightboxEl.querySelector('.lightbox-prev') as HTMLElement;
    const nextBtn = this.lightboxEl.querySelector('.lightbox-next') as HTMLElement;
    if (prevBtn) prevBtn.style.display = this.lightbox.currentIndex > 0 ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = this.lightbox.currentIndex < this.lightbox.images.length - 1 ? 'flex' : 'none';
  }

  private applyZoom(): void {
    const img = this.lightboxEl?.querySelector('.lightbox-img') as HTMLElement | null;
    if (img) {
      img.style.transform = `scale(${this.lightbox.zoom})`;
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (!this.lightbox.isOpen) return;
    switch (e.key) {
      case 'Escape':
        this.closeLightbox();
        break;
      case 'ArrowLeft':
        this.prevImage();
        break;
      case 'ArrowRight':
        this.nextImage();
        break;
      case '+':
      case '=':
        this.zoomIn();
        break;
      case '-':
        this.zoomOut();
        break;
      case '0':
        this.resetZoom();
        break;
    }
  }

  private setupTouchHandlers(container: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    let startDist = 0;
    let isSwiping = false;

    this.boundTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        startDist = Math.sqrt(dx * dx + dy * dy);
      } else if (e.touches.length === 1) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isSwiping = true;
      }
    };

    this.boundTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = dist / startDist;
        this.lightbox.zoom = Math.min(Math.max(this.lightbox.zoom * scale, 0.5), 5);
        startDist = dist;
        this.applyZoom();
      }
    };

    this.boundTouchEnd = () => {
      if (isSwiping) {
        isSwiping = false;
      }
      startDist = 0;
    };

    container.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    container.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    container.addEventListener('touchend', this.boundTouchEnd);
  }

  private removeTouchHandlers(): void {
    const container = this.lightboxEl?.querySelector('#lightbox-image-container');
    if (container && this.boundTouchStart && this.boundTouchMove && this.boundTouchEnd) {
      container.removeEventListener('touchstart', this.boundTouchStart as EventListener);
      container.removeEventListener('touchmove', this.boundTouchMove as EventListener);
      container.removeEventListener('touchend', this.boundTouchEnd as EventListener);
    }
    this.boundTouchStart = null;
    this.boundTouchMove = null;
    this.boundTouchEnd = null;
  }

  private extractFilename(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split('/');
      return segments[segments.length - 1] || 'image';
    } catch {
      return 'image';
    }
  }
}
