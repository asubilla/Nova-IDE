import { describe, it, expect, beforeEach } from 'vitest';
import {
  SecretMasking,
  SecretType,
  MaskingStrategy,
  SecretPolicy,
} from '../../src/chat/secret-masking';

describe('SecretMasking', () => {
  let masking: SecretMasking;

  beforeEach(() => {
    masking = new SecretMasking();
  });

  // ─── AWS Key Detection ──────────────────────────────────────────

  describe('detectSecrets', () => {
    it('should detect AWS access keys', () => {
      const text = 'aws_access_key_id=AKIAIOSFODNN7EXAMPLE';
      const detections = masking.detectSecrets(text);
      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some(d => d.type === SecretType.ApiKey)).toBe(true);
    });

    it('should detect API keys with sk- prefix', () => {
      const text = 'const key = "sk-proj-1234567890abcdef1234567890"';
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.ApiKey)).toBe(true);
    });

    it('should detect GitHub tokens', () => {
      const text = 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234';
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.ApiKey)).toBe(true);
    });
  });

  // ─── Password Detection ─────────────────────────────────────────

  describe('password detection', () => {
    it('should detect password assignments', () => {
      const text = 'password: SuperSecret123!';
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.Password)).toBe(true);
    });

    it('should detect secret key assignments', () => {
      const text = 'secret_key: abcdefghijklmnop';
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.Password || d.type === SecretType.Token)).toBe(true);
    });
  });

  // ─── JWT Detection ──────────────────────────────────────────────

  describe('JWT detection', () => {
    it('should detect JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const text = `Authorization: Bearer ${jwt}`;
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.Jwt)).toBe(true);
    });
  });

  // ─── Private Key Detection ──────────────────────────────────────

  describe('private key detection', () => {
    it('should detect RSA private keys', () => {
      const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.PrivateKey)).toBe(true);
    });

    it('should detect generic private keys', () => {
      const text = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBg...\n-----END PRIVATE KEY-----';
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.PrivateKey)).toBe(true);
    });
  });

  // ─── Credit Card Detection ──────────────────────────────────────

  describe('credit card detection', () => {
    it('should detect Visa card numbers', () => {
      const text = 'Card: 4111111111111111';
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.CreditCard)).toBe(true);
    });

    it('should detect Mastercard numbers', () => {
      const text = 'Card: 5555555555554444';
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.CreditCard)).toBe(true);
    });
  });

  // ─── Email Detection ────────────────────────────────────────────

  describe('email detection', () => {
    it('should detect email addresses', () => {
      const strictMasking = new SecretMasking({ policy: SecretPolicy.Strict });
      const text = 'Contact: user@example.com';
      const detections = strictMasking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.Email)).toBe(true);
    });

    it('should not detect emails in normal policy', () => {
      const text = 'Contact: user@example.com';
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.Email)).toBe(false);
    });
  });

  // ─── URL with Credentials ───────────────────────────────────────

  describe('URL with credentials', () => {
    it('should detect URLs with embedded credentials', () => {
      const text = 'https://user:pass@example.com/api';
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.UrlWithCredentials)).toBe(true);
    });
  });

  // ─── Env Variable Detection ─────────────────────────────────────

  describe('env variable detection', () => {
    it('should detect API_KEY assignments', () => {
      const text = 'API_KEY=abcdef1234567890abcdef';
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.EnvSecret)).toBe(true);
    });

    it('should detect DB_PASSWORD assignments', () => {
      const text = 'DATABASE_PASSWORD=mysecretdbpass';
      const detections = masking.detectSecrets(text);
      expect(detections.some(d => d.type === SecretType.EnvSecret)).toBe(true);
    });
  });

  // ─── Masking Strategies ─────────────────────────────────────────

  describe('maskSecrets', () => {
    it('should mask with full strategy', () => {
      const text = 'password: MySecret123';
      const masked = masking.maskSecrets(text, { strategy: MaskingStrategy.Full });
      expect(masked).not.toContain('MySecret123');
      expect(masked).not.toContain('password:');
    });

    it('should mask with partial strategy', () => {
      const text = 'password: MySecret123';
      const masked = masking.maskSecrets(text, { strategy: MaskingStrategy.Partial });
      expect(masked).toContain('pas');
      expect(masked).toContain('***');
    });

    it('should mask with category strategy', () => {
      const text = 'password: MySecret123';
      const masked = masking.maskSecrets(text, { strategy: MaskingStrategy.Category });
      expect(masked).toContain('[PASSWORD]');
    });

    it('should mask with custom strategy', () => {
      const text = 'password: MySecret123';
      const masked = masking.maskSecrets(text, {
        strategy: MaskingStrategy.Custom,
        customMask: '[HIDDEN]',
      });
      expect(masked).toContain('[HIDDEN]');
    });
  });

  // ─── Unmasking ──────────────────────────────────────────────────

  describe('unmaskSecrets', () => {
    it('should unmask secrets using secret map', () => {
      const original = 'password: MySecret123';
      const map = masking.createSecretMap(original);
      const unmasked = masking.unmaskSecrets(map.masked, map);
      expect(unmasked).toContain('MySecret123');
    });
  });

  // ─── Validate Secret Leak ───────────────────────────────────────

  describe('validateSecretLeak', () => {
    it('should report leaks in strict mode', () => {
      const result = masking.validateSecretLeak(
        'password: MySecret123',
        SecretPolicy.Strict,
      );
      expect(result.isSecure).toBe(false);
      expect(result.leaks.length).toBeGreaterThan(0);
    });

    it('should report secure for clean content', () => {
      const result = masking.validateSecretLeak('No secrets here');
      expect(result.isSecure).toBe(true);
      expect(result.leaks.length).toBe(0);
    });
  });

  // ─── Masking Helpers ────────────────────────────────────────────

  describe('masking helpers', () => {
    it('should mask for display with partial', () => {
      const masked = masking.maskForDisplay('password: MySecret123');
      expect(masked).not.toContain('MySecret123');
      expect(masked).toContain('***');
    });

    it('should mask for log with category', () => {
      const masked = masking.maskForLog('password: MySecret123');
      expect(masked).toContain('[PASSWORD]');
    });

    it('should get secret types', () => {
      const types = masking.getSecretTypes('password: test12345678');
      expect(types.length).toBeGreaterThan(0);
    });
  });

  // ─── Policy Filtering ───────────────────────────────────────────

  describe('policy filtering', () => {
    it('should filter by strict policy', () => {
      const strict = new SecretMasking({ policy: SecretPolicy.Strict });
      const detections = strict.detectSecrets('user@test.com');
      expect(detections.length).toBeGreaterThan(0);
    });

    it('should filter by relaxed policy', () => {
      const relaxed = new SecretMasking({ policy: SecretPolicy.Relaxed });
      const detections = relaxed.detectSecrets('user@test.com');
      expect(detections.length).toBe(0);
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle empty text', () => {
      const detections = masking.detectSecrets('');
      expect(detections.length).toBe(0);
    });

    it('should handle text with no secrets', () => {
      const detections = masking.detectSecrets('Hello world, no secrets here!');
      expect(detections.length).toBe(0);
    });

    it('should handle multiple secrets in one text', () => {
      const text = 'password: secret123 and API_KEY=abcdef1234567890abcdef';
      const detections = masking.detectSecrets(text);
      expect(detections.length).toBeGreaterThanOrEqual(2);
    });

    it('should deduplicate overlapping detections', () => {
      const text = 'password: AKIAIOSFODNN7EXAMPLE';
      const detections = masking.detectSecrets(text);
      const positions = detections.map(d => `${d.start}-${d.end}`);
      const unique = new Set(positions);
      expect(positions.length).toBe(unique.size);
    });
  });

  // ─── Custom Patterns ────────────────────────────────────────────

  describe('custom patterns', () => {
    it('should detect custom patterns', () => {
      const custom = new SecretMasking({
        customPatterns: [{
          type: SecretType.Token,
          pattern: /MY_CUSTOM_SECRET_[A-Z0-9]+/g,
        }],
      });

      const detections = custom.detectSecrets('Token: MY_CUSTOM_SECRET_ABC123');
      expect(detections.some(d => d.type === SecretType.Token)).toBe(true);
    });
  });
});
