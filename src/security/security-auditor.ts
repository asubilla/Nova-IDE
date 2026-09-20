import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { VulnerabilityScanner, Vulnerability, Severity } from './vulnerability-scanner';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SecurityReport {
  timestamp: Date;
  projectPath: string;
  overallScore: number;
  vulnerabilities: Vulnerability[];
  recommendations: string[];
  passed: number;
  failed: number;
  scanDuration: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface DependencyVulnerability {
  package: string;
  version: string;
  severity: Severity;
  title: string;
  description: string;
  fixAvailable: boolean;
  fixVersion?: string;
  cweId?: string;
}

export interface SecretLeak {
  id: string;
  file: string;
  line: number;
  type: string;
  evidence: string;
  severity: Severity;
}

export interface PermissionIssue {
  file: string;
  currentPermissions: string;
  issue: string;
  severity: Severity;
  recommendation: string;
}

export interface NetworkExposure {
  port: number;
  service: string;
  protocol: string;
  bindAddress: string;
  risk: Severity;
  description: string;
}

export interface ConfigIssue {
  file: string;
  setting: string;
  value: string;
  issue: string;
  severity: Severity;
  recommendation: string;
}

export interface ContainerSecurity {
  image: string;
  issue: string;
  severity: Severity;
  recommendation: string;
  line?: number;
}

export interface AuthSecurity {
  component: string;
  issue: string;
  severity: Severity;
  recommendation: string;
}

export interface EncryptionAudit {
  component: string;
  algorithm: string;
  issue: string;
  severity: Severity;
  recommendation: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SECRET_PATTERNS: Array<{ pattern: RegExp; type: string; severity: Severity }> = [
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/gi, type: 'password', severity: 'critical' },
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]+['"]/gi, type: 'api_key', severity: 'critical' },
  { pattern: /(?:secret|token|auth[_-]?token)\s*[:=]\s*['"][^'"]+['"]/gi, type: 'token', severity: 'high' },
  { pattern: /(?:aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key)\s*[:=]\s*['"][^'"]+['"]/gi, type: 'aws_key', severity: 'critical' },
  { pattern: /(?:private[_-]?key|PRIVATE\s+KEY)\s*[:=]\s*['"]/gi, type: 'private_key', severity: 'critical' },
  { pattern: /(?:database[_-]?url|db[_-]?url|connection[_-]?string)\s*[:=]\s*['"][^'"]+['"]/gi, type: 'database_url', severity: 'critical' },
  { pattern: /(?:jwt[_-]?secret|session[_-]?secret)\s*[:=]\s*['"][^'"]+['"]/gi, type: 'jwt_secret', severity: 'critical' },
  { pattern: /(?:encryption[_-]?key|signing[_-]?key)\s*[:=]\s*['"][^'"]+['"]/gi, type: 'encryption_key', severity: 'critical' },
  { pattern: /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)?\s*PRIVATE\s+KEY-----/gi, type: 'private_key_file', severity: 'critical' },
];

const DANGEROUS_CONFIG_SETTINGS: Array<{ pattern: RegExp; setting: string; issue: string; severity: Severity }> = [
  { pattern: /debug\s*[:=]\s*true/gi, setting: 'debug', issue: 'Debug mode enabled in production config', severity: 'medium' },
  { pattern: /verbose\s*[:=]\s*true/gi, setting: 'verbose', issue: 'Verbose logging may expose sensitive information', severity: 'low' },
  { pattern: /cors\s*[:=]\s*['"][*]['"]/gi, setting: 'cors', issue: 'CORS allows all origins', severity: 'medium' },
  { pattern: /helmet\s*[:=]\s*false/gi, setting: 'helmet', issue: 'Security headers disabled', severity: 'high' },
  { pattern: /ssl\s*[:=]\s*false/gi, setting: 'ssl', issue: 'SSL/TLS disabled', severity: 'high' },
  { pattern: /https\s*[:=]\s*false/gi, setting: 'https', issue: 'HTTPS disabled', severity: 'high' },
  { pattern: /trust[_-]?proxy\s*[:=]\s*true/gi, setting: 'trust_proxy', issue: 'Trust proxy enabled, IP may be spoofed', severity: 'medium' },
  { pattern: /secure\s*[:=]\s*false/gi, setting: 'secure', issue: 'Secure cookie flag disabled', severity: 'medium' },
  { pattern: /httpOnly\s*[:=]\s*false/gi, setting: 'httpOnly', issue: 'HttpOnly cookie flag disabled', severity: 'medium' },
  { pattern: /sameSite\s*[:=]\s*['"]none['"]/gi, setting: 'sameSite', issue: 'SameSite cookie set to none', severity: 'medium' },
];

const NODE_MODULES_IGNORE = ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage'];

// ─── SecurityAuditor ─────────────────────────────────────────────────────────

export class SecurityAuditor {
  private scanner: VulnerabilityScanner;
  private lastReport?: SecurityReport;

  constructor() {
    this.scanner = new VulnerabilityScanner();
  }

  async scanProject(projectPath: string): Promise<SecurityReport> {
    const start = Date.now();
    const allVulnerabilities: Vulnerability[] = [];
    const recommendations: string[] = [];

    const [codeVulns, secretLeaks, depVulns, configIssues, permIssues] = await Promise.all([
      this.scanCodeVulnerabilities(projectPath),
      this.scanSecrets(projectPath),
      this.scanDependencies(projectPath),
      this.scanConfigSecurity(projectPath),
      this.scanPermissions(projectPath),
    ]);

    for (const vuln of codeVulns) {
      allVulnerabilities.push(vuln);
    }

    for (const leak of secretLeaks) {
      allVulnerabilities.push({
        id: leak.id,
        severity: leak.severity,
        category: 'secrets',
        title: `Hardcoded ${leak.type} found`,
        description: `Secret of type "${leak.type}" found in ${leak.file}:${leak.line}`,
        file: leak.file,
        line: leak.line,
        recommendation: 'Move secrets to environment variables or a vault',
        evidence: leak.evidence,
      });
    }

    for (const issue of configIssues) {
      allVulnerabilities.push({
        id: randomUUID(),
        severity: issue.severity,
        category: 'config',
        title: issue.issue,
        description: `Configuration issue in ${issue.file}: ${issue.setting} = ${issue.value}`,
        file: issue.file,
        recommendation: issue.recommendation,
      });
    }

    for (const issue of permIssues) {
      allVulnerabilities.push({
        id: randomUUID(),
        severity: issue.severity,
        category: 'permissions',
        title: issue.issue,
        description: `File permission issue: ${issue.file} has ${issue.currentPermissions}`,
        file: issue.file,
        recommendation: issue.recommendation,
      });
    }

    if (codeVulns.length > 0) {
      recommendations.push('Fix code vulnerabilities found by SAST scanning');
    }
    if (secretLeaks.length > 0) {
      recommendations.push('Remove hardcoded secrets and use environment variables or a secrets vault');
    }
    if (configIssues.length > 0) {
      recommendations.push('Review and fix configuration security issues');
    }
    if (permIssues.length > 0) {
      recommendations.push('Fix file permission issues to prevent unauthorized access');
    }

    recommendations.push('Run npm audit regularly to check for dependency vulnerabilities');
    recommendations.push('Implement automated security scanning in CI/CD pipeline');
    recommendations.push('Use HTTPS for all network communications');
    recommendations.push('Implement rate limiting on all API endpoints');

    const summary = {
      critical: allVulnerabilities.filter(v => v.severity === 'critical').length,
      high: allVulnerabilities.filter(v => v.severity === 'high').length,
      medium: allVulnerabilities.filter(v => v.severity === 'medium').length,
      low: allVulnerabilities.filter(v => v.severity === 'low').length,
    };

    const totalChecks = 20;
    const failed = summary.critical * 4 + summary.high * 3 + summary.medium * 2 + summary.low;
    const passed = Math.max(0, totalChecks - failed);
    const overallScore = Math.round((passed / totalChecks) * 100);

    const report: SecurityReport = {
      timestamp: new Date(),
      projectPath,
      overallScore,
      vulnerabilities: allVulnerabilities,
      recommendations,
      passed,
      failed,
      scanDuration: Date.now() - start,
      summary,
    };

    this.lastReport = report;
    return report;
  }

  async scanDependencies(projectPath: string): Promise<DependencyVulnerability[]> {
    const results: DependencyVulnerability[] = [];
    const packageJsonPath = path.join(projectPath, 'package.json');

    try {
      const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      const knownVulnerable: Record<string, { severity: Severity; title: string; fix: string; cwe?: string }> = {
        'lodash': { severity: 'high', title: 'Prototype Pollution in lodash', fix: '>=4.17.21', cwe: 'CWE-1321' },
        'minimist': { severity: 'high', title: 'Prototype Pollution in minimist', fix: '>=1.2.6', cwe: 'CWE-1321' },
        'node-fetch': { severity: 'medium', title: 'node-fetch exposure of sensitive information', fix: '>=2.6.7' },
        'axios': { severity: 'medium', title: 'Server-Side Request Forgery in axios', fix: '>=0.21.2' },
        'express': { severity: 'low', title: 'Open redirect in express', fix: '>=4.19.2' },
        'ws': { severity: 'high', title: 'ReDoS in ws', fix: '>=7.5.10' },
        'jsonwebtoken': { severity: 'high', title: 'JWT verification bypass', fix: '>=9.0.0' },
        'mongoose': { severity: 'high', title: 'Prototype Pollution in mongoose', fix: '>=5.13.15' },
      };

      for (const [name, version] of Object.entries(allDeps)) {
        const vulnInfo = knownVulnerable[name];
        if (vulnInfo) {
          results.push({
            package: name,
            version: String(version),
            severity: vulnInfo.severity,
            title: vulnInfo.title,
            description: `Vulnerability detected in ${name}@${version}`,
            fixAvailable: true,
            fixVersion: vulnInfo.fix,
            cweId: vulnInfo.cwe,
          });
        }
      }
    } catch {
      // package.json not found or invalid
    }

    return results;
  }

  async scanSecrets(projectPath: string): Promise<SecretLeak[]> {
    const results: SecretLeak[] = [];
    const files = await this.getAllFiles(projectPath, ['.ts', '.js', '.json', '.yaml', '.yml', '.env', '.config', '.xml', '.toml']);

    for (const file of files) {
      try {
        const content = await fs.promises.readFile(file, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          if (line.trim().startsWith('//') || line.trim().startsWith('#')) continue;

          for (const { pattern, type, severity } of SECRET_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(line)) {
              const relativePath = path.relative(projectPath, file);
              results.push({
                id: randomUUID(),
                file: relativePath,
                line: i + 1,
                type,
                evidence: line.trim().substring(0, 100),
                severity,
              });
              break;
            }
          }
        }
      } catch {
        // skip unreadable files
      }
    }

    return results;
  }

  async scanPermissions(projectPath: string): Promise<PermissionIssue[]> {
    const results: PermissionIssue[] = [];

    try {
      const files = await this.getAllFiles(projectPath, ['.ts', '.js', '.json', '.env']);

      for (const file of files) {
        try {
          const stat = await fs.promises.stat(file);
          const mode = stat.mode;
          const permOctal = (mode & 0o777).toString(8);
          const relativePath = path.relative(projectPath, file);

          if (permOctal === '777') {
            results.push({
              file: relativePath,
              currentPermissions: permOctal,
              issue: 'File has world-writable permissions (777)',
              severity: 'high',
              recommendation: 'Restrict permissions to owner-only (600 or 644)',
            });
          } else if (permOctal === '777' || permOctal === '776' || permOctal === '775') {
            results.push({
              file: relativePath,
              currentPermissions: permOctal,
              issue: 'File has overly permissive write access',
              severity: 'medium',
              recommendation: 'Remove group and other write permissions',
            });
          }

          if (relativePath.includes('.env') && permOctal !== '600' && permOctal !== '400') {
            results.push({
              file: relativePath,
              currentPermissions: permOctal,
              issue: 'Environment file does not have restrictive permissions',
              severity: 'high',
              recommendation: 'Set permissions to 600 (owner read/write only)',
            });
          }
        } catch {
          // skip files we can't stat
        }
      }
    } catch {
      // directory read failure
    }

    return results;
  }

  async scanNetworkExposure(): Promise<NetworkExposure[]> {
    const results: NetworkExposure[] = [];

    const commonPorts = [
      { port: 22, service: 'SSH', protocol: 'tcp', risk: 'medium' as Severity, description: 'SSH service exposed' },
      { port: 80, service: 'HTTP', protocol: 'tcp', risk: 'medium' as Severity, description: 'HTTP service (unencrypted)' },
      { port: 443, service: 'HTTPS', protocol: 'tcp', risk: 'low' as Severity, description: 'HTTPS service' },
      { port: 3000, service: 'Dev Server', protocol: 'tcp', risk: 'medium' as Severity, description: 'Development server commonly exposed' },
      { port: 3306, service: 'MySQL', protocol: 'tcp', risk: 'high' as Severity, description: 'Database port exposed' },
      { port: 5432, service: 'PostgreSQL', protocol: 'tcp', risk: 'high' as Severity, description: 'Database port exposed' },
      { port: 6379, service: 'Redis', protocol: 'tcp', risk: 'critical' as Severity, description: 'Redis exposed without authentication' },
      { port: 8080, service: 'Alt HTTP', protocol: 'tcp', risk: 'medium' as Severity, description: 'Alternate HTTP service' },
      { port: 27017, service: 'MongoDB', protocol: 'tcp', risk: 'critical' as Severity, description: 'MongoDB exposed' },
      { port: 9200, service: 'Elasticsearch', protocol: 'tcp', risk: 'high' as Severity, description: 'Elasticsearch exposed' },
    ];

    try {
      const { execSync } = await import('child_process');
      const netstat = execSync('netstat -an 2>/dev/null || ss -tlnp 2>/dev/null || echo ""', { encoding: 'utf-8', timeout: 5000 });
      const listening = netstat.split('\n').filter(l => l.includes('LISTEN') || l.includes('LISTENING'));

      for (const line of listening) {
        for (const { port, service, protocol, risk, description } of commonPorts) {
          if (line.includes(`:${port}`) || line.includes(`.${port}`)) {
            results.push({ port, service, protocol, bindAddress: '0.0.0.0', risk, description });
          }
        }
      }
    } catch {
      for (const { port, service, protocol, risk, description } of commonPorts) {
        results.push({ port, service, protocol, bindAddress: 'unknown', risk, description });
      }
    }

    return results;
  }

  async scanCodeVulnerabilities(projectPath: string): Promise<Vulnerability[]> {
    const allVulns: Vulnerability[] = [];
    const files = await this.getAllFiles(projectPath, ['.ts', '.js', '.tsx', '.jsx']);

    for (const file of files) {
      try {
        const content = await fs.promises.readFile(file, 'utf-8');
        const vulns = this.scanner.scanAll(content);
        const relativePath = path.relative(projectPath, file);
        for (const vuln of vulns) {
          vuln.file = relativePath;
          allVulns.push(vuln);
        }
      } catch {
        // skip unreadable files
      }
    }

    return allVulns;
  }

  async scanConfigSecurity(projectPath: string): Promise<ConfigIssue[]> {
    const results: ConfigIssue[] = [];
    const configFiles = [
      'package.json', 'tsconfig.json', '.eslintrc.json', '.env',
      'docker-compose.yml', 'Dockerfile', '.npmrc', 'jest.config.js',
      'webpack.config.js', 'vite.config.ts', 'next.config.js',
    ];

    for (const configFile of configFiles) {
      const filePath = path.join(projectPath, configFile);
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');

        for (const { pattern, setting, issue, severity } of DANGEROUS_CONFIG_SETTINGS) {
          pattern.lastIndex = 0;
          if (pattern.test(content)) {
            results.push({
              file: configFile,
              setting,
              value: content.match(pattern)?.[0] ?? 'unknown',
              issue,
              severity,
              recommendation: this.getRecommendationForSetting(setting),
            });
          }
        }
      } catch {
        // config file not found
      }
    }

    return results;
  }

  async scanContainer(): Promise<ContainerSecurity[]> {
    const results: ContainerSecurity[] = [];
    const dockerfilePath = path.resolve(process.cwd(), 'Dockerfile');

    try {
      const content = await fs.promises.readFile(dockerfilePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('FROM ') && (line.includes(':latest') || !line.includes(':'))) {
          results.push({
            image: line,
            issue: 'Using latest or unpinned base image',
            severity: 'medium',
            recommendation: 'Pin base image to a specific version or digest',
            line: i + 1,
          });
        }

        if (line.startsWith('COPY ') && line.includes('.env')) {
          results.push({
            image: '',
            issue: 'Copying .env file into container',
            severity: 'high',
            recommendation: 'Use environment variables or Docker secrets instead',
            line: i + 1,
          });
        }

        if (line.startsWith('ADD ') && (line.includes('http://') || line.includes('https://'))) {
          results.push({
            image: '',
            issue: 'ADD instruction fetching remote URL',
            severity: 'medium',
            recommendation: 'Use COPY and handle downloads separately with verification',
            line: i + 1,
          });
        }

        if (line.includes('chmod 777') || line.includes('chmod a+rwx')) {
          results.push({
            image: '',
            issue: 'Overly permissive chmod in container',
            severity: 'high',
            recommendation: 'Use minimal required permissions',
            line: i + 1,
          });
        }

        if (line.startsWith('USER ') && line.includes('root')) {
          results.push({
            image: '',
            issue: 'Running container as root',
            severity: 'medium',
            recommendation: 'Use a non-root user for running applications',
            line: i + 1,
          });
        }
      }
    } catch {
      // Dockerfile not found
    }

    const dockerComposePath = path.resolve(process.cwd(), 'docker-compose.yml');
    try {
      const content = await fs.promises.readFile(dockerComposePath, 'utf-8');

      if (content.includes('privileged: true')) {
        results.push({
          image: 'docker-compose',
          issue: 'Privileged container detected',
          severity: 'critical',
          recommendation: 'Remove privileged mode and use specific capabilities',
        });
      }

      if (content.includes('network_mode: host')) {
        results.push({
          image: 'docker-compose',
          issue: 'Host network mode used',
          severity: 'high',
          recommendation: 'Use bridge networking with explicit port mappings',
        });
      }
    } catch {
      // docker-compose.yml not found
    }

    return results;
  }

  async scanAuth(): Promise<AuthSecurity[]> {
    const results: AuthSecurity[] = [];

    const authPatterns = [
      { pattern: /jwt\.sign\s*\([^)]*expiresIn\s*:\s*['"](\d+)y['"]/gi, issue: 'JWT token expiration set to years', severity: 'high' as Severity, recommendation: 'Set JWT expiration to hours or days, not years' },
      { pattern: /jwt\.verify\s*\([^)]*(?:algorithms\s*:)/gi, issue: 'JWT verification with specific algorithms', severity: 'low' as Severity, recommendation: 'Ensure strong algorithm (RS256) is used' },
      { pattern: /bcrypt\.compare/gi, issue: 'Using bcrypt for password comparison', severity: 'low' as Severity, recommendation: 'Ensure bcrypt rounds >= 12' },
      { pattern: /password\s*===?\s*['"]/gi, issue: 'Plaintext password comparison', severity: 'critical' as Severity, recommendation: 'Use bcrypt.compare for password hashing' },
      { pattern: /cookie.*secure\s*:\s*false/gi, issue: 'Cookie secure flag disabled', severity: 'medium' as Severity, recommendation: 'Enable secure flag on cookies in production' },
      { pattern: /cookie.*httpOnly\s*:\s*false/gi, issue: 'Cookie httpOnly flag disabled', severity: 'medium' as Severity, recommendation: 'Enable httpOnly flag to prevent XSS cookie theft' },
      { pattern: /no.?auth|auth\s*:\s*false|skipAuth\s*:\s*true/gi, issue: 'Authentication bypass detected', severity: 'critical' as Severity, recommendation: 'Remove authentication bypasses' },
    ];

    const files = await this.getAllFiles(process.cwd(), ['.ts', '.js']);

    for (const file of files) {
      try {
        const content = await fs.promises.readFile(file, 'utf-8');
        const lines = content.split('\n');
        const relativePath = path.relative(process.cwd(), file);

        for (let i = 0; i < lines.length; i++) {
          for (const { pattern, issue, severity, recommendation } of authPatterns) {
            pattern.lastIndex = 0;
            if (pattern.test(lines[i])) {
              results.push({
                component: `${relativePath}:${i + 1}`,
                issue,
                severity,
                recommendation,
              });
            }
          }
        }
      } catch {
        // skip unreadable
      }
    }

    return results;
  }

  async scanEncryption(): Promise<EncryptionAudit[]> {
    const results: EncryptionAudit[] = [];

    const cryptoPatterns = [
      { pattern: /createCipher\b/gi, algorithm: 'DES/Blowfish', issue: 'Using deprecated createCipher (weak key derivation)', severity: 'critical' as Severity, recommendation: 'Use createCipheriv with explicit IV' },
      { pattern: /md5\b/gi, algorithm: 'MD5', issue: 'Using MD5 hash algorithm', severity: 'high' as Severity, recommendation: 'Use SHA-256 or better' },
      { pattern: /\bsha1\b/gi, algorithm: 'SHA-1', issue: 'Using deprecated SHA-1', severity: 'medium' as Severity, recommendation: 'Use SHA-256 or SHA-3' },
      { pattern: /createHash\s*\(\s*['"]md5['"]/gi, algorithm: 'MD5', issue: 'MD5 hash created for security purpose', severity: 'high' as Severity, recommendation: 'Use crypto.createHash("sha256")' },
      { pattern: /\bdes\b|\b3des\b|\btripledes\b/gi, algorithm: 'DES/3DES', issue: 'Using weak DES/3DES encryption', severity: 'critical' as Severity, recommendation: 'Use AES-256-GCM' },
      { pattern: /createDecipher\b/gi, algorithm: 'DES/Blowfish', issue: 'Using deprecated createDecipher', severity: 'critical' as Severity, recommendation: 'Use createDecipheriv with explicit IV' },
      { pattern: /randomBytes\s*\(\s*\d+\s*\)/gi, algorithm: 'PRNG', issue: 'Ensure randomBytes is used for security-sensitive values', severity: 'low' as Severity, recommendation: 'Verify randomBytes usage is for cryptographic purposes' },
      { pattern: /pbkdf2Sync?\s*\(/gi, algorithm: 'PBKDF2', issue: 'PBKDF2 detected; verify iteration count >= 100000', severity: 'low' as Severity, recommendation: 'Use at least 100000 iterations with SHA-512' },
      { pattern: /scryptSync?\s*\(/gi, algorithm: 'scrypt', issue: 'scrypt detected; verify parameters are sufficient', severity: 'low' as Severity, recommendation: 'Use N >= 16384, r >= 8, p >= 1' },
    ];

    const files = await this.getAllFiles(process.cwd(), ['.ts', '.js']);

    for (const file of files) {
      try {
        const content = await fs.promises.readFile(file, 'utf-8');
        const lines = content.split('\n');
        const relativePath = path.relative(process.cwd(), file);

        for (let i = 0; i < lines.length; i++) {
          for (const { pattern, algorithm, issue, severity, recommendation } of cryptoPatterns) {
            pattern.lastIndex = 0;
            if (pattern.test(lines[i])) {
              results.push({
                component: `${relativePath}:${i + 1}`,
                algorithm,
                issue,
                severity,
                recommendation,
              });
            }
          }
        }
      } catch {
        // skip
      }
    }

    return results;
  }

  generateReport(): SecurityReport {
    return this.lastReport ?? {
      timestamp: new Date(),
      projectPath: process.cwd(),
      overallScore: 0,
      vulnerabilities: [],
      recommendations: ['No scan has been performed yet. Run scanProject() first.'],
      passed: 0,
      failed: 0,
      scanDuration: 0,
      summary: { critical: 0, high: 0, medium: 0, low: 0 },
    };
  }

  renderReport(report: SecurityReport): string {
    const lines: string[] = [];

    lines.push('='.repeat(72));
    lines.push('  NOVA SECURITY AUDIT REPORT');
    lines.push('='.repeat(72));
    lines.push('');
    lines.push(`  Generated:  ${report.timestamp.toISOString()}`);
    lines.push(`  Project:    ${report.projectPath}`);
    lines.push(`  Duration:   ${report.scanDuration}ms`);
    lines.push('');
    lines.push('-'.repeat(72));
    lines.push(`  OVERALL SCORE: ${report.overallScore}/100 ${this.getScoreLabel(report.overallScore)}`);
    lines.push('-'.repeat(72));
    lines.push('');
    lines.push('  SUMMARY');
    lines.push(`    Critical: ${report.summary.critical}`);
    lines.push(`    High:     ${report.summary.high}`);
    lines.push(`    Medium:   ${report.summary.medium}`);
    lines.push(`    Low:      ${report.summary.low}`);
    lines.push(`    Total:    ${report.vulnerabilities.length}`);
    lines.push(`    Passed:   ${report.passed}`);
    lines.push(`    Failed:   ${report.failed}`);
    lines.push('');

    if (report.vulnerabilities.length > 0) {
      lines.push('-'.repeat(72));
      lines.push('  VULNERABILITIES');
      lines.push('-'.repeat(72));

      const sorted = [...report.vulnerabilities].sort((a, b) => {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
      });

      for (const vuln of sorted) {
        const sev = vuln.severity.toUpperCase().padEnd(8);
        lines.push(`  [${sev}] ${vuln.title}`);
        lines.push(`    Category:   ${vuln.category}`);
        if (vuln.file) lines.push(`    File:       ${vuln.file}${vuln.line ? `:${vuln.line}` : ''}`);
        if (vuln.cweId) lines.push(`    CWE:        ${vuln.cweId}`);
        lines.push(`    Detail:     ${vuln.description}`);
        lines.push(`    Fix:        ${vuln.recommendation}`);
        lines.push('');
      }
    }

    if (report.recommendations.length > 0) {
      lines.push('-'.repeat(72));
      lines.push('  RECOMMENDATIONS');
      lines.push('-'.repeat(72));
      for (let i = 0; i < report.recommendations.length; i++) {
        lines.push(`  ${i + 1}. ${report.recommendations[i]}`);
      }
      lines.push('');
    }

    lines.push('='.repeat(72));
    lines.push('  END OF REPORT');
    lines.push('='.repeat(72));

    return lines.join('\n');
  }

  private getScoreLabel(score: number): string {
    if (score >= 90) return '[EXCELLENT]';
    if (score >= 70) return '[GOOD]';
    if (score >= 50) return '[FAIR]';
    if (score >= 30) return '[POOR]';
    return '[CRITICAL]';
  }

  private getRecommendationForSetting(setting: string): string {
    const map: Record<string, string> = {
      debug: 'Disable debug mode in production',
      verbose: 'Reduce verbose logging in production',
      cors: 'Configure CORS with specific allowed origins',
      helmet: 'Enable helmet for security headers',
      ssl: 'Enable SSL/TLS for encrypted communication',
      https: 'Enable HTTPS for all communications',
      trust_proxy: 'Review trust proxy settings; only trust known proxies',
      secure: 'Enable Secure flag on all cookies',
      httpOnly: 'Enable HttpOnly flag on session cookies',
      sameSite: 'Set SameSite to Lax or Strict',
    };
    return map[setting] ?? 'Review this security configuration';
  }

  private async getAllFiles(dir: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (NODE_MODULES_IGNORE.includes(entry.name)) continue;
          const subFiles = await this.getAllFiles(fullPath, extensions);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // directory read failure
    }

    return files;
  }
}
