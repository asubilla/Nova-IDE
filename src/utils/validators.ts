import { isValidUrl } from './guards';

interface ValidationResult {
  valid: boolean;
  error?: string;
}

const API_KEY_PATTERNS: Record<string, RegExp> = {
  openai: /^sk-[a-zA-Z0-9]{20,}$/,
  anthropic: /^sk-ant-[a-zA-Z0-9\-]{20,}$/,
  google: /^AIza[a-zA-Z0-9\-_]{30,}$/,
};

export function validateApiKey(key: string, provider: string): ValidationResult {
  if (!key || key.trim().length === 0) {
    return { valid: false, error: 'API key cannot be empty' };
  }

  const pattern = API_KEY_PATTERNS[provider.toLowerCase()];
  if (pattern && !pattern.test(key)) {
    return {
      valid: false,
      error: `Invalid ${provider} API key format. Expected pattern: ${pattern.source}`,
    };
  }

  if (key.length < 10) {
    return { valid: false, error: 'API key is too short' };
  }

  return { valid: true };
}

export function validateUrl(url: string): ValidationResult {
  if (!url || url.trim().length === 0) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  if (!isValidUrl(url)) {
    return { valid: false, error: 'Invalid URL format' };
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL must use http or https protocol' };
    }
  } catch {
    return { valid: false, error: 'Invalid URL' };
  }

  return { valid: true };
}

export function validateFileName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'File name cannot be empty' };
  }

  if (name.length > 255) {
    return { valid: false, error: 'File name is too long (max 255 characters)' };
  }

  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
  if (invalidChars.test(name)) {
    return { valid: false, error: 'File name contains invalid characters' };
  }

  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
  if (reservedNames.test(name)) {
    return { valid: false, error: 'File name uses a reserved system name' };
  }

  if (name.startsWith('.') || name.endsWith('.')) {
    return { valid: false, error: 'File name cannot start or end with a dot' };
  }

  if (name.includes('..')) {
    return { valid: false, error: 'File name cannot contain consecutive dots' };
  }

  return { valid: true };
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/data:/gi, '')
    .trim();
}
