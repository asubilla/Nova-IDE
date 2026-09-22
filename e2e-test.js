const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 9222;
const electron = path.join(__dirname, "node_modules", "electron", "dist", "electron.exe");

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const proc = spawn(electron, [".", `--remote-debugging-port=${PORT}`], {
    cwd: __dirname,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  let stdout = "";
  proc.stderr.on("data", (d) => (stderr += d));
  proc.stdout.on("data", (d) => (stdout += d));

  console.log("Electron PID:", proc.pid);

  // Wait for CDP
  let targets = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try {
      targets = await getJson(`http://127.0.0.1:${PORT}/json`);
      if (targets.length) break;
    } catch (e) { /* retry */ }
  }

  if (!targets || !targets.length) {
    console.log("FAIL: No CDP targets");
    console.log("stderr:", stderr.slice(0, 3000));
    proc.kill();
    process.exit(1);
  }

  console.log("Targets:", targets.map(t => t.type + ":" + t.title).join(", "));

  const page = targets.find(t => t.type === "page");
  if (!page) {
    console.log("FAIL: No page target");
    proc.kill();
    process.exit(1);
  }

  // WebSocket CDP
  const WebSocket = (() => {
    try { return require("ws"); } catch { return null; }
  })();

  if (!WebSocket) {
    console.log("ws not available, using fetch-based checks only");
  } else {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const errors = [];
    const logs = [];

    function send(method, params = {}) {
      const msgId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await new Promise((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        const args = (msg.params.args || []).map(a => a.value ?? a.description ?? "").join(" ");
        logs.push(`[${msg.params.type}] ${args}`);
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        errors.push(d.exception?.description || d.text || "exception");
      }
      if (msg.method === "Log.entryAdded") {
        const e = msg.params.entry;
        if (e.level === "error") errors.push(e.text);
      }
    });

    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    await sleep(3000);

    // Evaluate page state
    const evalResult = await send("Runtime.evaluate", {
      expression: `JSON.stringify({
        title: document.title,
        hasNova: typeof window.nova !== 'undefined',
        hasFs: typeof window.nova?.fs?.readFile === 'function',
        hasAppMin: typeof window.nova?.app?.minimize === 'function',
        hasTitlebar: !!document.getElementById('titlebar'),
        titlebarBtns: document.querySelectorAll('.titlebar-btn').length,
        bodyText: document.body ? document.body.innerText.slice(0, 300) : '',
        h1: document.querySelector('h1')?.innerText || '',
        isBuildMissing: document.body?.innerText.includes('Build assets missing'),
        url: location.href,
      })`,
      returnByValue: true,
    });

    console.log("PAGE STATE:", evalResult.result.value);

    // Screenshot
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const shotPath = path.join(__dirname, "e2e-screenshot.png");
    fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
    console.log("Screenshot:", shotPath);

    // Check window count via app - evaluate titlebar buttons
    console.log("CONSOLE LOGS:", logs.length ? logs.join("\n") : "(none)");
    console.log("CONSOLE ERRORS:", errors.length ? errors.join("\n") : "(none)");

    const state = JSON.parse(evalResult.result.value);
    const pass = state.hasNova && state.hasFs && state.hasAppMin && !state.isBuildMissing && state.hasTitlebar;
    console.log(pass ? "E2E PASS" : "E2E FAIL");

    ws.close();
    proc.kill();
    process.exit(pass ? 0 : 1);
  }

  // fallback without ws
  await sleep(3000);
  console.log("stderr:", stderr.slice(0, 3000));
  console.log("stdout:", stdout.slice(0, 3000));
  proc.kill();
  process.exit(1);
}

main().catch((e) => {
  console.error("E2E error:", e);
  process.exit(1);
});
