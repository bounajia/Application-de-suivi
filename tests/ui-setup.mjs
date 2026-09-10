import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';

export default async function setup() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  await access(path.join(root, 'dist', 'index.html')).catch(() => { throw new Error('Exécutez npm.cmd run build avant les tests navigateur.'); });
  const dataDir = await mkdtemp(path.join(tmpdir(), 'suivi-e2e-'));
  const child = spawn(process.execPath, ['--experimental-sqlite', path.join(root, 'tests', 'ui-server.mjs')], {
    cwd: root,
    env: { ...process.env, SUIVI_E2E_DATA_DIR: dataDir, PUBLIC_ORIGIN: 'http://127.0.0.1:3002', TRUST_PROXY: '0' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  async function close() {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      if (child.connected) child.send({ shutdown: true });
      const timeout = setTimeout(() => child.kill(), 8_000);
      await exited;
      clearTimeout(timeout);
    }
    assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(tmpdir()));
    assert.ok(path.basename(dataDir).startsWith('suivi-e2e-'));
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Serveur de test indisponible. ${logs}`)), 20_000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Serveur de test arrêté (${code}). ${logs}`)); });
      child.on('message', (message) => { if (message?.ready) { clearTimeout(timeout); resolve(); } });
    });
  } catch (error) { await close(); throw error; }
  return close;
}
