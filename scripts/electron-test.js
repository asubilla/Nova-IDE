#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RELEASE = path.join(ROOT, "release");

const results = [];

function check(label, fn) {
  const start = Date.now();
  try {
    const value = fn();
    results.push({ label, passed: !!value, duration: Date.now() - start });
  } catch (err) {
    results.push({ label, passed: false, duration: Date.now() - start, error: err.message });
  }
}

console.log("=== Electron Packaging Test ===\n");

check("electron installed", () => {
  try {
    execSync("npx electron --version", { cwd: ROOT, encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
});

check("@electron/packager installed", () => {
  try {
    execSync("npx @electron/packager --version", { cwd: ROOT, encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
});

check("electron/main.ts exists", () => fs.existsSync(path.join(ROOT, "electron", "main.ts")));

check("electron/preload.ts exists", () => fs.existsSync(path.join(ROOT, "electron", "preload.ts")));

check("electron/package.js exists", () => fs.existsSync(path.join(ROOT, "electron", "package.js")));

check("dist/ directory exists", () => fs.existsSync(path.join(ROOT, "dist")));

check("web/ directory exists", () => fs.existsSync(path.join(ROOT, "web")));

check("web/index.html exists", () => fs.existsSync(path.join(ROOT, "web", "index.html")));

check("package.json valid", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  return !!(pkg.name && pkg.version);
});

check("TypeScript compiles electron/main.ts", () => {
  try {
    execSync(`npx tsc "electron/main.ts" --outDir "${path.join(ROOT, "dist", "electron-test")}" --target ES2020 --module commonjs --skipLibCheck`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: "pipe",
    });
    const compiled = fs.existsSync(path.join(ROOT, "dist", "electron-test", "main.js"));
    fs.rmSync(path.join(ROOT, "dist", "electron-test"), { recursive: true, force: true });
    return compiled;
  } catch {
    return false;
  }
});

check("TypeScript compiles electron/preload.ts", () => {
  try {
    execSync(`npx tsc "electron/preload.ts" --outDir "${path.join(ROOT, "dist", "electron-test")}" --target ES2020 --module commonjs --skipLibCheck`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: "pipe",
    });
    const compiled = fs.existsSync(path.join(ROOT, "dist", "electron-test", "preload.js"));
    fs.rmSync(path.join(ROOT, "dist", "electron-test"), { recursive: true, force: true });
    return compiled;
  } catch {
    return false;
  }
});

check("packaging script exports functions", () => {
  const pkg = require(path.join(ROOT, "electron", "package.js"));
  return !!(pkg.packageForWindows && pkg.packageForMac && pkg.packageForLinux);
});

check("release directory writable", () => {
  fs.mkdirSync(RELEASE, { recursive: true });
  const testFile = path.join(RELEASE, ".test-write");
  fs.writeFileSync(testFile, "test");
  fs.unlinkSync(testFile);
  return true;
});

check("build.ts compiles", () => {
  try {
    execSync(`npx tsc "electron/build.ts" --outDir "${path.join(ROOT, "dist", "electron-test")}" --target ES2020 --module commonjs --skipLibCheck`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: "pipe",
    });
    const compiled = fs.existsSync(path.join(ROOT, "dist", "electron-test", "build.js"));
    fs.rmSync(path.join(ROOT, "dist", "electron-test"), { recursive: true, force: true });
    return compiled;
  } catch {
    return false;
  }
});

check("smoke-test.ts compiles", () => {
  try {
    execSync(`npx tsc "electron/smoke-test.ts" --outDir "${path.join(ROOT, "dist", "electron-test")}" --target ES2020 --module commonjs --skipLibCheck`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: "pipe",
    });
    const compiled = fs.existsSync(path.join(ROOT, "dist", "electron-test", "smoke-test.js"));
    fs.rmSync(path.join(ROOT, "dist", "electron-test"), { recursive: true, force: true });
    return compiled;
  } catch {
    return false;
  }
});

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;

console.log("Results:\n");
for (const r of results) {
  const icon = r.passed ? "PASS" : "FAIL";
  console.log(`  [${icon}] ${r.label} (${r.duration}ms)`);
  if (r.error) console.log(`        ${r.error}`);
}

console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

if (failed > 0) {
  console.log("Some checks failed. Run 'node electron/package.js win' to test packaging.");
  process.exit(1);
} else {
  console.log("All checks passed. Packaging system is ready.");
}
