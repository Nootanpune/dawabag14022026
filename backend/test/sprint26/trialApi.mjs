// Starts a second API process for this test with a different deployment (APP_ENV)
// on its own port, against the same database and Redis, and stops it afterwards.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Starts the API with `env` overrides; resolves { base, stop } once /health answers, or { exitCode, log } if it refused to start. */
export async function startApi(port, env) {
  // Sprint 41: like the main API (scripts/dev-up.sh), as the restricted login when one is configured
  const login = process.env.DB_APP_LOGIN && process.env.DB_APP_PASSWORD ? { DB_USER: process.env.DB_APP_LOGIN, DB_PASSWORD: process.env.DB_APP_PASSWORD } : {};
  const merged = { ...process.env, ...login, PORT: String(port), API_URL: `http://localhost:${port}`, DISABLE_SCHEDULER: 'true', ...env };
  for (const [k, v] of Object.entries(merged)) if (v === undefined) delete merged[k];
  const child = spawn('npx', ['ts-node', '--transpile-only', 'src/index.ts'], { cwd: backend, env: merged, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  // npx starts ts-node as a child: signal the whole process group
  const kill = (sig) => { try { process.kill(-child.pid, sig); } catch { /* gone */ } };
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  let exitCode = null;
  child.on('exit', (c) => { exitCode = c ?? 1; });
  const base = `http://localhost:${port}/api/v1`;
  for (let i = 0; i < 90; i++) {
    if (exitCode !== null) return { exitCode, log };
    try {
      const r = await fetch(`http://localhost:${port}/health`);
      if (r.ok) return { base, log: () => log, stop: () => new Promise((res) => { child.once('exit', res); kill('SIGTERM'); setTimeout(() => kill('SIGKILL'), 5000); }) };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  kill('SIGKILL');
  return { exitCode: -1, log };
}

export async function callAt(base, method, path, { body, token } = {}) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
