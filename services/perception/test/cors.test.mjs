import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

async function startService(env = {}) {
  const entry = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: "0", ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const port = await new Promise((resolve, reject) => {
    let buffered = "";
    child.stdout.on("data", (chunk) => {
      buffered += chunk;
      const match = buffered.match(/http:\/\/localhost:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.stderr.on("data", (chunk) => reject(new Error(String(chunk))));
    child.on("exit", (code) => reject(new Error(`Service exited early with code ${code}.`)));
  });
  return { child, port };
}

test("preflight from allowlisted origin returns CORS headers", async () => {
  const { child, port } = await startService({
    CORS_ORIGINS: "http://localhost:5173,http://localhost:3000"
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/identify`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type"
      }
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/);
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /content-type/);
    assert.equal(response.headers.get("vary"), "origin");
  } finally {
    child.kill();
  }
});

test("GET from allowlisted origin echoes origin in ACAO", async () => {
  const { child, port } = await startService({ CORS_ORIGINS: "http://localhost:5173" });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { origin: "http://localhost:5173" }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
  } finally {
    child.kill();
  }
});

test("request from non-allowlisted origin has no ACAO header", async () => {
  const { child, port } = await startService({ CORS_ORIGINS: "http://localhost:5173" });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { origin: "https://evil.example.com" }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  } finally {
    child.kill();
  }
});

test("wildcard CORS_ORIGINS=* allows any origin", async () => {
  const { child, port } = await startService({ CORS_ORIGINS: "*" });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { origin: "https://anywhere.example.com" }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  } finally {
    child.kill();
  }
});
