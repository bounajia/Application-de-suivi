import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

function worker({ network = async () => new Response('asset'), cached = undefined } = {}) {
  const events = {};
  const saved = [];
  const added = [];
  const cache = { async match() { return cached; }, async put(request) { saved.push(request.url); }, async addAll(files) { added.push(...files); } };
  const self = { location: { origin: 'https://suivi.example.test' }, addEventListener(type, fn) { events[type] = fn; }, skipWaiting() {}, clients: { async claim() {} } };
  vm.runInNewContext(source, { self, URL, fetch: network, caches: { async open() { return cache; }, async match() { return new Response('page hors connexion'); }, async keys() { return []; }, async delete() {} } });
  function request(path, { method = 'GET', mode = 'cors' } = {}) {
    let handled = false;
    let response;
    events.fetch({ request: { url: new URL(path, self.location.origin).href, method, mode }, respondWith(result) { handled = true; response = result; } });
    return { handled, response };
  }
  return { events, request, added, saved };
}

test('service worker does not intercept private API calls, uploads or third-party traffic', () => {
  const w = worker();
  for (const pathname of ['/api/projects', '/api/auth/me', '/api/export', '/api/projects/id/attachments/file/download']) {
    assert.equal(w.request(pathname).handled, false, pathname);
    assert.equal(w.request(pathname, { mode: 'navigate' }).handled, false, pathname);
  }
  assert.equal(w.request('/assets/example.js', { method: 'POST' }).handled, false);
  assert.equal(w.request('https://other.example.test/assets/example.js').handled, false);
  assert.equal(w.request('/uploads/private.pdf').handled, false);
  assert.deepEqual(w.saved, []);
});

test('offline navigation uses an explanatory public page without caching private content', async () => {
  const w = worker({ network: async () => { throw new TypeError('offline'); } });
  const result = w.request('/projects', { mode: 'navigate' });
  assert.equal(result.handled, true);
  assert.equal(await (await result.response).text(), 'page hors connexion');
  assert.deepEqual(w.saved, []);
});

test('PWA install resources exist and manifest includes Android/iOS icon assets', async () => {
  const w = worker();
  let installation;
  w.events.install({ waitUntil(promise) { installation = promise; } });
  await installation;
  assert.ok(w.added.includes('/offline.html'));
  assert.ok(w.added.every((url) => !url.startsWith('/api/') && url !== '/'));
  for (const filename of w.added) assert.ok((await readFile(new URL(`../public${filename}`, import.meta.url))).length > 0, filename);
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  for (const size of [192, 512]) {
    const entry = manifest.icons.find((icon) => icon.sizes === `${size}x${size}`);
    assert.ok(entry, `${size}px icon declared`);
    const bytes = await readFile(new URL(`../public${entry.src}`, import.meta.url));
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  const appleIcon = await readFile(new URL('../public/apple-touch-icon.png', import.meta.url));
  assert.equal(appleIcon.readUInt32BE(16), 180);
});
