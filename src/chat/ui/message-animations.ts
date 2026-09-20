export type AnimationType = 'fadeIn' | 'slideUp' | 'slideLeft' | 'popIn' | 'bounce' | 'ripple' | 'typewriter';

export interface MessageAnimationConfig {
  speed?: number;
  enableParticles?: boolean;
  respectReducedMotion?: boolean;
  onAnimationStart?: (element: HTMLElement, type: AnimationType) => void;
  onAnimationEnd?: (element: HTMLElement, type: AnimationType) => void;
}

interface AnimationState {
  speedMultiplier: number;
  particlesEnabled: boolean;
  reducedMotion: boolean;
  activeAnimations: Set<HTMLElement>;
}

const BASE_DURATION = 300;

export class MessageAnimations {
  private config: Required<MessageAnimationConfig>;
  private state: AnimationState;

  constructor(config?: MessageAnimationConfig) {
    this.config = {
      speed: config?.speed ?? 1,
      enableParticles: config?.enableParticles ?? false,
      respectReducedMotion: config?.respectReducedMotion ?? true,
      onAnimationStart: config?.onAnimationStart ?? (() => {}),
      onAnimationEnd: config?.onAnimationEnd ?? (() => {}),
    };

    const prefersReduced = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.state = {
      speedMultiplier: this.config.speed,
      particlesEnabled: this.config.enableParticles,
      reducedMotion: this.config.respectReducedMotion && prefersReduced,
      activeAnimations: new Set(),
    };
  }

  animateMessageIn(element: HTMLElement, type: AnimationType): Promise<void> {
    if (this.state.reducedMotion) {
      element.style.opacity = '1';
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.state.activeAnimations.add(element);
      this.config.onAnimationStart(element, type);

      const duration = BASE_DURATION / this.state.speedMultiplier;

      switch (type) {
        case 'fadeIn':
          this.applyFadeIn(element, duration, resolve);
          break;
        case 'slideUp':
          this.applySlideUp(element, duration, resolve);
          break;
        case 'slideLeft':
          this.applySlideLeft(element, duration, resolve);
          break;
        case 'popIn':
          this.applyPopIn(element, duration, resolve);
          break;
        case 'bounce':
          this.applyBounce(element, duration, resolve);
          break;
        case 'ripple':
          this.applyRipple(element, duration, resolve);
          break;
        case 'typewriter':
          this.applyTypewriter(element, duration, resolve);
          break;
        default:
          element.style.opacity = '1';
          resolve();
      }
    });
  }

  animateMessageOut(element: HTMLElement, type: AnimationType): Promise<void> {
    if (this.state.reducedMotion) {
      element.remove();
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.state.activeAnimations.add(element);
      const duration = BASE_DURATION / this.state.speedMultiplier;

      element.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;
      element.style.opacity = '0';

      switch (type) {
        case 'fadeIn':
          element.style.transform = 'translateY(-10px)';
          break;
        case 'slideUp':
          element.style.transform = 'translateY(40px)';
          break;
        case 'slideLeft':
          element.style.transform = 'translateX(-40px)';
          break;
        case 'popIn':
          element.style.transform = 'scale(0.8)';
          break;
        case 'bounce':
          element.style.transform = 'scale(1.2)';
          break;
        default:
          element.style.transform = 'translateY(-10px)';
      }

      const cleanup = () => {
        element.removeEventListener('transitionend', cleanup);
        this.state.activeAnimations.delete(element);
        this.config.onAnimationEnd(element, type);
        element.remove();
        resolve();
      };

      element.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, duration + 50);
    });
  }

  animateReaction(element: HTMLElement, emoji: string): Promise<void> {
    if (this.state.reducedMotion) return Promise.resolve();

    return new Promise((resolve) => {
      const badge = document.createElement('span');
      badge.className = 'reaction-burst';
      badge.textContent = emoji;
      badge.style.cssText = 'position:absolute;font-size:24px;pointer-events:none;z-index:10;';

      const rect = element.getBoundingClientRect();
      badge.style.left = `${rect.width / 2}px`;
      badge.style.top = `${rect.height / 2}px`;

      element.style.position = 'relative';
      element.appendChild(badge);

      const duration = 600 / this.state.speedMultiplier;
      badge.animate([
        { transform: 'scale(0) translateY(0)', opacity: 1 },
        { transform: 'scale(1.5) translateY(-30px)', opacity: 1, offset: 0.5 },
        { transform: 'scale(1) translateY(-50px)', opacity: 0 },
      ], { duration, easing: 'ease-out' }).onfinish = () => {
        badge.remove();
        resolve();
      };
    });
  }

  animateTyping(element: HTMLElement): { stop: () => void } {
    const dots = element.querySelectorAll('.typing-dot');
    let running = true;

    const animate = () => {
      if (!running) return;
      dots.forEach((dot, i) => {
        const htmlDot = dot as HTMLElement;
        const delay = i * 150 / this.state.speedMultiplier;
        htmlDot.animate([
          { transform: 'translateY(0)', opacity: 0.4 },
          { transform: 'translateY(-4px)', opacity: 1 },
          { transform: 'translateY(0)', opacity: 0.4 },
        ], { duration: 600 / this.state.speedMultiplier, delay, iterations: Infinity });
      });
    };

    if (!this.state.reducedMotion) animate();

    return {
      stop: () => {
        running = false;
        dots.forEach((dot) => {
          (dot as HTMLElement).getAnimations().forEach((a) => a.cancel());
        });
      },
    };
  }

  animatePresence(element: HTMLElement, status: 'online' | 'offline' | 'away'): void {
    if (this.state.reducedMotion) return;

    const indicator = element.querySelector('.presence-indicator') as HTMLElement | null;
    if (!indicator) return;

    const colors: Record<string, string> = {
      online: '#22c55e',
      away: '#f59e0b',
      offline: '#6b7280',
    };

    indicator.animate([
      { transform: 'scale(1)', backgroundColor: indicator.style.backgroundColor },
      { transform: 'scale(1.5)', backgroundColor: colors[status] },
      { transform: 'scale(1)', backgroundColor: colors[status] },
    ], { duration: 300 / this.state.speedMultiplier, easing: 'ease-out' });

    indicator.style.backgroundColor = colors[status];
  }

  setAnimationSpeed(speed: number): void {
    this.state.speedMultiplier = Math.max(0.1, Math.min(5, speed));
  }

  enableParticles(): void {
    this.state.particlesEnabled = true;
  }

  spawnParticles(element: HTMLElement, count = 8): void {
    if (!this.state.particlesEnabled || this.state.reducedMotion) return;

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'message-particle';
      const angle = (i / count) * Math.PI * 2;
      const distance = 30 + Math.random() * 40;
      const size = 4 + Math.random() * 4;
      const duration = 400 / this.state.speedMultiplier;

      particle.style.cssText = `
        position:fixed;width:${size}px;height:${size}px;border-radius:50%;
        background:var(--nova-accent,#6366f1);pointer-events:none;z-index:9999;
        left:${centerX}px;top:${centerY}px;
      `;

      document.body.appendChild(particle);

      particle.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance}px) scale(0)`, opacity: 0 },
      ], { duration, easing: 'ease-out' }).onfinish = () => particle.remove();
    }
  }

  destroy(): void {
    this.state.activeAnimations.forEach((el) => {
      el.getAnimations().forEach((a) => a.cancel());
    });
    this.state.activeAnimations.clear();
  }

  private applyFadeIn(el: HTMLElement, duration: number, resolve: () => void): void {
    el.style.opacity = '0';
    el.style.transition = `opacity ${duration}ms ease`;
    requestAnimationFrame(() => {
      el.style.opacity = '1';
    });
    const cleanup = () => {
      el.removeEventListener('transitionend', cleanup);
      this.finishAnimation(el, resolve);
    };
    el.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, duration + 50);
  }

  private applySlideUp(el: HTMLElement, duration: number, resolve: () => void): void {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    const cleanup = () => {
      el.removeEventListener('transitionend', cleanup);
      this.finishAnimation(el, resolve);
    };
    el.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, duration + 50);
  }

  private applySlideLeft(el: HTMLElement, duration: number, resolve: () => void): void {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-30px)';
    el.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    });
    const cleanup = () => {
      el.removeEventListener('transitionend', cleanup);
      this.finishAnimation(el, resolve);
    };
    el.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, duration + 50);
  }

  private applyPopIn(el: HTMLElement, duration: number, resolve: () => void): void {
    el.style.opacity = '0';
    el.style.transform = 'scale(0.5)';
    el.style.transition = `opacity ${duration}ms ease, transform ${duration}ms cubic-bezier(0.175,0.885,0.32,1.275)`;
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'scale(1)';
    });
    const cleanup = () => {
      el.removeEventListener('transitionend', cleanup);
      this.finishAnimation(el, resolve);
    };
    el.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, duration + 50);
  }

  private applyBounce(el: HTMLElement, duration: number, resolve: () => void): void {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = `opacity ${duration}ms ease, transform ${duration}ms cubic-bezier(0.68,-0.55,0.265,1.55)`;
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    const cleanup = () => {
      el.removeEventListener('transitionend', cleanup);
      this.finishAnimation(el, resolve);
    };
    el.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, duration + 50);
  }

  private applyRipple(el: HTMLElement, duration: number, resolve: () => void): void {
    el.style.opacity = '0';
    el.style.transform = 'scale(0.95)';
    el.style.boxShadow = '0 0 0 0 rgba(99,102,241,0.4)';
    el.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease, box-shadow ${duration}ms ease`;
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'scale(1)';
      el.style.boxShadow = '0 0 0 8px rgba(99,102,241,0)';
    });
    const cleanup = () => {
      el.removeEventListener('transitionend', cleanup);
      el.style.boxShadow = '';
      this.finishAnimation(el, resolve);
    };
    el.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, duration + 50);
  }

  private applyTypewriter(el: HTMLElement, duration: number, resolve: () => void): void {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent) textNodes.push(node);
    }

    const fullTexts = textNodes.map((n) => n.textContent!);
    const totalChars = fullTexts.reduce((sum, t) => sum + t.length, 0);
    const charDuration = duration / Math.max(totalChars, 1);

    el.style.opacity = '1';
    textNodes.forEach((n) => (n.textContent = ''));

    let charIndex = 0;
    const type = () => {
      if (charIndex >= totalChars) {
        this.finishAnimation(el, resolve);
        return;
      }
      let remaining = charIndex;
      for (let i = 0; i < textNodes.length; i++) {
        if (remaining < fullTexts[i].length) {
          textNodes[i].textContent = fullTexts[i].substring(0, remaining + 1);
          break;
        }
        remaining -= fullTexts[i].length;
      }
      charIndex++;
      setTimeout(type, charDuration);
    };

    setTimeout(type, charDuration);
  }

  private finishAnimation(el: HTMLElement, resolve: () => void): void {
    this.state.activeAnimations.delete(el);
    this.config.onAnimationEnd(el, 'fadeIn' as AnimationType);
    resolve();
  }
}
