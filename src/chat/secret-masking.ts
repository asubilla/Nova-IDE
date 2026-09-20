export enum SecretType {
  ApiKey = 'api_key',
  Password = 'password',
  Token = 'token',
  Jwt = 'jwt',
  PrivateKey = 'private_key',
  CreditCard = 'credit_card',
  Ssn = 'ssn',
  Email = 'email',
  IpAddress = 'ip_address',
  UrlWithCredentials = 'url_with_credentials',
  EnvSecret = 'env_secret',
}

export enum MaskingStrategy {
  Full = 'full',
  Partial = 'partial',
  Category = 'category',
  Custom = 'custom',
}

export enum SecretPolicy {
  Strict = 'strict',
  Normal = 'normal',
  Relaxed = 'relaxed',
  Custom = 'custom',
}

export interface SecretDetection {
  type: SecretType;
  value: string;
  start: number;
  end: number;
  confidence: number;
}

export interface SecretMap {
  original: string;
  masked: string;
  secrets: SecretDetection[];
  timestamp: Date;
}

export interface MaskingOptions {
  strategy?: MaskingStrategy;
  policy?: SecretPolicy;
  customMask?: string;
  customPatterns?: Array<{ type: SecretType; pattern: RegExp }>;
  includeEmail?: boolean;
  includeIp?: boolean;
  maxRevealChars?: number;
}

export interface SecretLeakResult {
  leaks: SecretDetection[];
  isSecure: boolean;
  policy: SecretPolicy;
  violationTypes: SecretType[];
}

interface SecretPattern {
  type: SecretType;
  patterns: RegExp[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    type: SecretType.ApiKey,
    patterns: [
      /(?:aws[_\-]?(?:access[_\-]?)?key[_\-]?(?:id)?|AKIA)\s*[:=]\s*['"]?([A-Z0-9]{16,})['"]?/gi,
      /(?:google[_\-]?(?:api|cloud)[\-_]?key|AIza)\s*[:=]\s*['"]?([A-Za-z0-9_\-]{35,})['"]?/gi,
      /(?:azure[_\-]?(?:client[_\-]?)?secret|subscription[_\-]?id)\s*[:=]\s*['"]?([A-Za-z0-9_\-]{32,})['"]?/gi,
      /(?:sk[_\-]?(?:live|proj|api)?[-_]?)[A-Za-z0-9]{20,}/g,
      /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/g,
      /(?:stripe[_\-]?(?:secret|publishable)[\-_]?key)\s*[:=]\s*['"]?(sk(?:live|test)_[A-Za-z0-9]{24,})['"]?/gi,
      /xox[baprs]-[A-Za-z0-9\-]+/g,
      /(?:滴滴|wechat|wechatpay|alipay)[\-_]?(?:key|secret|token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?/gi,
    ],
    severity: 'critical',
  },
  {
    type: SecretType.Password,
    patterns: [
      /(?:password|passwd|pwd|pass)\s*[:=]\s*['"]?([^\s'"<>]{8,})['"]?/gi,
      /(?:secret|secret[_\-]?key)\s*[:=]\s*['"]?([^\s'"<>]{8,})['"]?/gi,
    ],
    severity: 'critical',
  },
  {
    type: SecretType.Token,
    patterns: [
      /(?:access[_\-]?token|auth[_\-]?token|bearer)\s*[:=]\s*['"]?([A-Za-z0-9_\-\.]{20,})['"]?/gi,
      /(?:client[_\-]?secret|app[_\-]?secret)\s*[:=]\s*['"]?([A-Za-z0-9_\-]{20,})['"]?/gi,
    ],
    severity: 'critical',
  },
  {
    type: SecretType.Jwt,
    patterns: [
      /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
    ],
    severity: 'critical',
  },
  {
    type: SecretType.PrivateKey,
    patterns: [
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
      /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g,
    ],
    severity: 'critical',
  },
  {
    type: SecretType.CreditCard,
    patterns: [
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g,
    ],
    severity: 'high',
  },
  {
    type: SecretType.Ssn,
    patterns: [
      /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
    ],
    severity: 'high',
  },
  {
    type: SecretType.Email,
    patterns: [
      /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    ],
    severity: 'low',
  },
  {
    type: SecretType.IpAddress,
    patterns: [
      /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    ],
    severity: 'low',
  },
  {
    type: SecretType.UrlWithCredentials,
    patterns: [
      /https?:\/\/[^:]+:[^@]+@[^\s]+/gi,
    ],
    severity: 'critical',
  },
  {
    type: SecretType.EnvSecret,
    patterns: [
      /(?:API[_\-]?KEY|SECRET[_\-]?KEY|PRIVATE[_\-]?KEY|ACCESS[_\-]?KEY|AUTH[_\-]?TOKEN|DB[_\-]?PASSWORD|DATABASE[_\-]?PASSWORD|ENCRYPTION[_\-]?KEY)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.\/+=]{8,}['"]?/gi,
    ],
    severity: 'high',
  },
];

export class SecretMasking {
  private patterns: SecretPattern[];
  private policy: SecretPolicy;
  private customPatterns: Array<{ type: SecretType; pattern: RegExp }>;
  private secretMaps = new Map<string, SecretMap>();

  constructor(options: MaskingOptions = {}) {
    this.policy = options.policy ?? SecretPolicy.Normal;
    this.patterns = [...SECRET_PATTERNS];
    this.customPatterns = options.customPatterns ?? [];

    if (options.includeEmail === false) {
      this.patterns = this.patterns.filter(p => p.type !== SecretType.Email);
    }
    if (options.includeIp === false) {
      this.patterns = this.patterns.filter(p => p.type !== SecretType.IpAddress);
    }
  }

  detectSecrets(text: string): SecretDetection[] {
    const detections: SecretDetection[] = [];
    const allPatterns = [...this.patterns, ...this.customPatterns.map(cp => ({
      type: cp.type,
      patterns: [cp.pattern],
      severity: 'high' as const,
    }))];

    for (const patternGroup of allPatterns) {
      if (!this.shouldDetectType(patternGroup.type)) continue;

      for (const pattern of patternGroup.patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const value = match[0];
          detections.push({
            type: patternGroup.type,
            value,
            start: match.index,
            end: match.index + value.length,
            confidence: this.calculateConfidence(patternGroup.type, value),
          });
        }
      }
    }

    return this.deduplicateDetections(detections).sort((a, b) => a.start - b.start);
  }

  maskSecrets(text: string, options?: MaskingOptions): string {
    const strategy = options?.strategy ?? MaskingStrategy.Full;
    const detections = this.detectSecrets(text);

    let masked = text;
    let offset = 0;

    for (const detection of detections) {
      const mask = this.generateMask(detection, strategy, options?.maxRevealChars ?? 4, options?.customMask);
      masked = masked.substring(0, detection.start + offset) + mask + masked.substring(detection.end + offset);
      offset += mask.length - (detection.end - detection.start);
    }

    return masked;
  }

  unmaskSecrets(text: string, secretMap: SecretMap): string {
    let result = text;
    const secrets = [...secretMap.secrets].sort((a, b) => b.start - a.start);

    for (const secret of secrets) {
      const mask = this.generateMask(secret, MaskingStrategy.Full);
      const idx = result.indexOf(mask);
      if (idx !== -1) {
        result = result.substring(0, idx) + secret.value + result.substring(idx + mask.length);
      }
    }

    return result;
  }

  validateSecretLeak(content: string, policy?: SecretPolicy): SecretLeakResult {
    const effectivePolicy = policy ?? this.policy;
    const detections = this.detectSecrets(content);

    const filteredDetections = detections.filter(d => {
      switch (effectivePolicy) {
        case SecretPolicy.Strict:
          return true;
        case SecretPolicy.Normal:
          return d.type !== SecretType.Email && d.type !== SecretType.IpAddress;
        case SecretPolicy.Relaxed:
          return this.getSeverity(d.type) === 'critical';
        case SecretPolicy.Custom:
          return true;
        default:
          return false;
      }
    });

    const violationTypes = [...new Set(filteredDetections.map(d => d.type))];

    return {
      leaks: filteredDetections,
      isSecure: filteredDetections.length === 0,
      policy: effectivePolicy,
      violationTypes,
    };
  }

  maskForDisplay(text: string): string {
    return this.maskSecrets(text, {
      strategy: MaskingStrategy.Partial,
      policy: SecretPolicy.Normal,
      maxRevealChars: 4,
    });
  }

  maskForLog(text: string): string {
    return this.maskSecrets(text, {
      strategy: MaskingStrategy.Category,
      policy: SecretPolicy.Strict,
    });
  }

  getSecretTypes(text: string): SecretType[] {
    const detections = this.detectSecrets(text);
    return [...new Set(detections.map(d => d.type))];
  }

  createSecretMap(text: string): SecretMap {
    const detections = this.detectSecrets(text);
    const map: SecretMap = {
      original: text,
      masked: this.maskSecrets(text, { strategy: MaskingStrategy.Full }),
      secrets: detections,
      timestamp: new Date(),
    };
    this.secretMaps.set(text, map);
    return map;
  }

  private shouldDetectType(type: SecretType): boolean {
    switch (this.policy) {
      case SecretPolicy.Strict:
        return true;
      case SecretPolicy.Normal:
        return type !== SecretType.Email && type !== SecretType.IpAddress;
      case SecretPolicy.Relaxed:
        return this.getSeverity(type) === 'critical';
      default:
        return true;
    }
  }

  private getSeverity(type: SecretType): string {
    for (const p of this.patterns) {
      if (p.type === type) return p.severity;
    }
    return 'medium';
  }

  private calculateConfidence(type: SecretType, value: string): number {
    let confidence = 0.7;

    switch (type) {
      case SecretType.Jwt:
        confidence = 0.95;
        break;
      case SecretType.PrivateKey:
        confidence = 0.99;
        break;
      case SecretType.ApiKey:
        confidence = value.length > 30 ? 0.9 : 0.8;
        break;
      case SecretType.CreditCard:
        confidence = this.luhnCheck(value) ? 0.9 : 0.5;
        break;
      case SecretType.Ssn:
        confidence = 0.75;
        break;
      case SecretType.Password:
        confidence = value.length >= 12 ? 0.85 : 0.7;
        break;
      default:
        confidence = 0.7;
    }

    return Math.min(confidence, 1);
  }

  private luhnCheck(num: string): boolean {
    const digits = num.replace(/\D/g, '');
    let sum = 0;
    let alternate = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = parseInt(digits[i], 10);
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  }

  private generateMask(
    detection: SecretDetection,
    strategy: MaskingStrategy,
    maxRevealChars = 4,
    customMask?: string,
  ): string {
    switch (strategy) {
      case MaskingStrategy.Full:
        return '*'.repeat(detection.value.length);
      case MaskingStrategy.Partial: {
        const prefix = detection.value.substring(0, 3);
        const suffix = detection.value.substring(detection.value.length - maxRevealChars);
        return `${prefix}${'*'.repeat(Math.max(0, detection.value.length - 3 - maxRevealChars))}${suffix}`;
      }
      case MaskingStrategy.Category:
        return `[${detection.type.toUpperCase()}]`;
      case MaskingStrategy.Custom:
        return customMask ?? `[REDACTED:${detection.type}]`;
      default:
        return '*'.repeat(detection.value.length);
    }
  }

  private deduplicateDetections(detections: SecretDetection[]): SecretDetection[] {
    const seen = new Set<string>();
    return detections.filter(d => {
      const key = `${d.start}-${d.end}-${d.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
