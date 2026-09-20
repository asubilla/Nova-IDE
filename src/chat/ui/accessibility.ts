export interface AccessibilityConfig {
  enableHighContrast?: boolean;
  enableReducedMotion?: boolean;
  enableScreenReader?: boolean;
  announceMessages?: boolean;
  focusTrapContainer?: HTMLElement;
}

export interface AccessibilityReport {
  highContrastEnabled: boolean;
  reducedMotionEnabled: boolean;
  ariaLiveRegions: number;
  focusTrapsActive: number;
  keyboardNavigableElements: number;
  missingAltTexts: number;
  missingAriaLabels: number;
  contrastIssues: ContrastIssue[];
}

interface ContrastIssue {
  element: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
}

interface FocusTrapState {
  container: HTMLElement;
  previousFocus: HTMLElement | null;
  keydownHandler: ((e: KeyboardEvent) => void) | null;
}

interface A11yState {
  liveRegions: HTMLElement[];
  focusTraps: FocusTrapState[];
  skipLinksAdded: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
}

export class AccessibilityManager {
  private config: AccessibilityConfig;
  private state: A11yState;

  constructor(config?: AccessibilityConfig) {
    this.config = {
      enableHighContrast: config?.enableHighContrast ?? false,
      enableReducedMotion: config?.enableReducedMotion ?? false,
      enableScreenReader: config?.enableScreenReader ?? true,
      announceMessages: config?.announceMessages ?? true,
      focusTrapContainer: config?.focusTrapContainer,
    };

    const prefersReduced = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.state = {
      liveRegions: [],
      focusTraps: [],
      skipLinksAdded: false,
      highContrast: this.config.enableHighContrast ?? false,
      reducedMotion: this.config.enableReducedMotion || prefersReduced,
    };

    if (this.state.highContrast) this.enableHighContrast();
    if (this.state.reducedMotion) this.enableReducedMotion();
  }

  announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (!this.config.enableScreenReader) return;

    let region = this.state.liveRegions.find((r) => r.getAttribute('aria-live') === priority);
    if (!region) {
      region = document.createElement('div');
      region.setAttribute('aria-live', priority);
      region.setAttribute('aria-atomic', 'true');
      region.setAttribute('role', priority === 'assertive' ? 'alert' : 'status');
      region.className = 'sr-only';
      region.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
      document.body.appendChild(region);
      this.state.liveRegions.push(region);
    }

    region.textContent = '';
    requestAnimationFrame(() => {
      region!.textContent = message;
    });
  }

  addAriaLabels(element: HTMLElement, labels: Record<string, string>): void {
    for (const [key, value] of Object.entries(labels)) {
      if (key === 'label') {
        element.setAttribute('aria-label', value);
      } else if (key === 'describedby') {
        element.setAttribute('aria-describedby', value);
      } else if (key === 'labelledby') {
        element.setAttribute('aria-labelledby', value);
      } else {
        element.setAttribute(`aria-${key}`, value);
      }
    }
  }

  makeKeyboardNavigable(element: HTMLElement): void {
    element.setAttribute('tabindex', '0');

    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        element.click();
      }
      if (e.key === 'Escape') {
        element.blur();
      }
    });
  }

  addFocusManagement(container: HTMLElement): void {
    const focusableSelector = [
      'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    container.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    const firstFocusable = container.querySelector<HTMLElement>(focusableSelector);
    if (firstFocusable) firstFocusable.focus();
  }

  enableHighContrast(): void {
    this.state.highContrast = true;
    document.documentElement.classList.add('nova-high-contrast');

    const style = document.getElementById('nova-a11y-high-contrast') ?? document.createElement('style');
    style.id = 'nova-a11y-high-contrast';
    style.textContent = `
      .nova-high-contrast {
        --nova-bg: #000000 !important;
        --nova-fg: #ffffff !important;
        --nova-border: #ffffff !important;
        --nova-link: #6eb5ff !important;
        --nova-focus: #ffdd00 !important;
      }
      .nova-high-contrast *:focus {
        outline: 3px solid var(--nova-focus) !important;
        outline-offset: 2px !important;
      }
      .nova-high-contrast .chat-message.received { background: #1a1a1a !important; color: #ffffff !important; }
      .nova-high-contrast .chat-message.sent { background: #003366 !important; color: #ffffff !important; }
    `;
    if (!style.parentNode) document.head.appendChild(style);
  }

  enableReducedMotion(): void {
    this.state.reducedMotion = true;
    document.documentElement.classList.add('nova-reduced-motion');

    const style = document.getElementById('nova-a11y-reduced-motion') ?? document.createElement('style');
    style.id = 'nova-a11y-reduced-motion';
    style.textContent = `
      .nova-reduced-motion *,
      .nova-reduced-motion *::before,
      .nova-reduced-motion *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    `;
    if (!style.parentNode) document.head.appendChild(style);
  }

  addSkipLinks(): void {
    if (this.state.skipLinksAdded) return;
    this.state.skipLinksAdded = true;

    const skipNav = document.createElement('a');
    skipNav.href = '#nova-chat-main';
    skipNav.className = 'nova-skip-link';
    skipNav.textContent = 'Skip to main content';
    skipNav.style.cssText = `
      position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;z-index:10000;
      background:var(--nova-focus,#ffdd00);color:#000;padding:8px 16px;font-size:14px;font-weight:600;
      text-decoration:none;border-radius:0 0 4px 4px;
    `;
    skipNav.addEventListener('focus', () => {
      skipNav.style.left = '0';
      skipNav.style.top = '0';
      skipNav.style.width = 'auto';
      skipNav.style.height = 'auto';
      skipNav.style.overflow = 'visible';
    });
    skipNav.addEventListener('blur', () => {
      skipNav.style.left = '-9999px';
    });

    document.body.insertBefore(skipNav, document.body.firstChild);
  }

  getAccessibilityReport(): AccessibilityReport {
    const contrastIssues: ContrastIssue[] = [];
    let missingAltTexts = 0;
    let missingAriaLabels = 0;
    let keyboardNavigable = 0;

    const images = document.querySelectorAll('img');
    images.forEach((img) => {
      if (!img.getAttribute('alt') && !img.getAttribute('aria-label')) missingAltTexts++;
    });

    const interactive = document.querySelectorAll('button, a, input, select, textarea, [tabindex]');
    interactive.forEach((el) => {
      if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !(el as HTMLElement).textContent?.trim()) {
        missingAriaLabels++;
      }
      if ((el as HTMLElement).offsetParent !== null) keyboardNavigable++;
    });

    return {
      highContrastEnabled: this.state.highContrast,
      reducedMotionEnabled: this.state.reducedMotion,
      ariaLiveRegions: this.state.liveRegions.length,
      focusTrapsActive: this.state.focusTraps.length,
      keyboardNavigableElements: keyboardNavigable,
      missingAltTexts,
      missingAriaLabels,
      contrastIssues,
    };
  }

  trapFocus(container: HTMLElement): () => void {
    const state: FocusTrapState = {
      container,
      previousFocus: document.activeElement as HTMLElement,
      keydownHandler: null,
    };

    state.keydownHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', state.keydownHandler);
    this.state.focusTraps.push(state);

    const firstFocusable = container.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (firstFocusable) firstFocusable.focus();

    return () => this.releaseFocus(state);
  }

  private releaseFocus(state: FocusTrapState): void {
    if (state.keydownHandler) {
      state.container.removeEventListener('keydown', state.keydownHandler);
    }
    state.previousFocus?.focus();
    this.state.focusTraps = this.state.focusTraps.filter((s) => s !== state);
  }

  setupAltText(element: HTMLElement, text: string): void {
    if (element instanceof HTMLImageElement) {
      element.alt = text;
    }
    element.setAttribute('aria-label', text);
  }

  setupTabindex(element: HTMLElement, index: number): void {
    element.setAttribute('tabindex', String(index));
  }

  destroy(): void {
    this.state.liveRegions.forEach((r) => r.remove());
    this.state.liveRegions = [];

    this.state.focusTraps.forEach((s) => this.releaseFocus(s));
    this.state.focusTraps = [];

    document.documentElement.classList.remove('nova-high-contrast', 'nova-reduced-motion');
    document.getElementById('nova-a11y-high-contrast')?.remove();
    document.getElementById('nova-a11y-reduced-motion')?.remove();
  }
}
