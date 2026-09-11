import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { createApp } from '../server/index.mjs';

const PASSWORD = 'Chantier-test-2026!';
const OWNER = { name: 'Samira Responsable', email: 'samira@example.test', password: PASSWORD };
const PROJECT = { title: 'Réhabilitation école Atlas', description: 'Réfection de la toiture', startDate: '2026-01-01', endDate: '2026-12-31', progress: 20, status: 'in_progress' };
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

async function fixture(t, setup = true) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'suivi-api-test-'));
  let app;
  let server;
  let base;
  async function start() {
    app = await createApp({ dataDir, staticDir: path.join(dataDir, 'no-static-directory') });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    if (!server) return;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    app.locals.close();
    server = null;
  }
  t.after(async () => {
    await stop();
    assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(tmpdir()));
    assert.ok(path.basename(dataDir).startsWith('suivi-api-test-'));
    await rm(dataDir, { recursive: true, force: true });
  });
  await start();
  async function request(url, { method = 'GET', body, cookie, headers = {} } = {}) {
    const response = await fetch(`${base}/api${url}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const isJson = response.headers.get('content-type')?.includes('application/json');
    return { status: response.status, headers: response.headers, cookie: response.headers.get('set-cookie')?.split(';')[0], bytes, data: isJson && bytes.length ? JSON.parse(bytes.toString()) : null };
  }
  const f = {
    request,
    dataDir,
    get base() { return base; },
    get db() { return app.locals.db; },
    async restart() { await stop(); await start(); },
    async signup(name = 'Youssef Technicien', email = 'youssef@example.test', extra = {}) {
      const result = await request('/auth/signup', { method: 'POST', body: { name, email, password: PASSWORD, ...extra } });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      return result;
    },
    async login(email, password = PASSWORD) {
      const result = await request('/auth/login', { method: 'POST', body: { email, password } });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.ok(result.cookie);
      return result;
    },
    async activeUser(name = 'Youssef Technicien', email = 'youssef@example.test', role = 'user') {
      const result = await f.signup(name, email);
      const approved = await request(`/users/${result.data.user.id}`, { method: 'PATCH', cookie: f.ownerCookie, body: { status: 'active', role } });
      assert.equal(approved.status, 200, JSON.stringify(approved.data));
      const loggedIn = await f.login(email);
      return { user: loggedIn.data.user, cookie: loggedIn.cookie };
    },
    async project(overrides = {}, cookie = f.ownerCookie) {
      const result = await request('/projects', { method: 'POST', cookie, body: { ...PROJECT, ...overrides } });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      return result.data.project;
    },
  };
  if (setup) {
    const result = await request('/auth/setup', { method: 'POST', body: OWNER });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    f.owner = result.data.user;
    f.ownerCookie = result.cookie;
  }
  return f;
}

// Read ZIP central-directory records so the tests verify actual decompressed file bytes,
// including streamed archives using data descriptors, without another dependency.
function unzip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'ZIP end-of-central-directory must be present');
  const count = buffer.readUInt16LE(end + 10);
  let position = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(position), 0x02014b50);
    const method = buffer.readUInt16LE(position + 10);
    const compressedSize = buffer.readUInt32LE(position + 20);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    const localPosition = buffer.readUInt32LE(position + 42);
    const name = buffer.subarray(position + 46, position + 46 + nameLength).toString('utf8');
    assert.equal(buffer.readUInt32LE(localPosition), 0x04034b50);
    const dataPosition = localPosition + 30 + buffer.readUInt16LE(localPosition + 26) + buffer.readUInt16LE(localPosition + 28);
    const compressed = buffer.subarray(dataPosition, dataPosition + compressedSize);
    assert.ok(method === 0 || method === 8, `Supported ZIP compression for ${name}`);
    entries.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
async function nextSseEvent(reader) {
  const decoder = new TextDecoder();
  let buffer = '';
  while (!buffer.includes('\n\n')) {
    const { value, done } = await reader.read();
    assert.equal(done, false, 'SSE stream should stay open');
    buffer += decoder.decode(value, { stream: true });
  }
  const [raw] = buffer.split('\n\n');
  return Object.fromEntries(raw.split('\n').map((line) => line.split(/: ?/, 2)).filter(([key]) => key));
}

test('initial setup creates the first admin and cannot run twice', async (t) => {
  const f = await fixture(t, false);
  assert.deepEqual((await f.request('/auth/status')).data, { needsSetup: true });
  assert.equal((await f.request('/auth/signup', { method: 'POST', body: OWNER })).status, 409);
  assert.equal((await f.request('/auth/setup', { method: 'POST', body: { ...OWNER, password: 'short' } })).status, 400);
  const result = await f.request('/auth/setup', { method: 'POST', body: OWNER });
  assert.equal(result.status, 201);
  assert.equal(result.data.user.role, 'admin');
  assert.equal(result.data.user.status, 'active');
  assert.ok(!('password' in result.data.user) && !('password_hash' in result.data.user));
  assert.match(result.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(result.headers.get('set-cookie'), /SameSite=Strict/i);
  assert.deepEqual((await f.request('/auth/status')).data, { needsSetup: false });
  assert.equal((await f.request('/auth/setup', { method: 'POST', body: { ...OWNER, email: 'intruder@example.test' } })).status, 409);
  assert.deepEqual((await f.request('/projects', { cookie: result.cookie })).data.projects, []);
});

test('example projects are created only when explicitly requested at setup', async (t) => {
  const f = await fixture(t, false);
  const setup = await f.request('/auth/setup', { method: 'POST', body: { ...OWNER, withExamples: true } });
  assert.equal(setup.status, 201);
  const projects = (await f.request('/projects', { cookie: setup.cookie })).data.projects;
  assert.equal(projects.length, 3);
  assert.ok(projects.every((p) => p.description.includes('démonstration')));
});

test('signup never approves or promotes itself; pending accounts cannot log in', async (t) => {
  const f = await fixture(t);
  const signup = await f.signup(undefined, undefined, { role: 'admin', status: 'active' });
  assert.equal(signup.data.user.role, 'user');
  assert.equal(signup.data.user.status, 'pending');
  assert.equal(signup.cookie, undefined);
  const login = await f.request('/auth/login', { method: 'POST', body: { email: signup.data.user.email, password: PASSWORD } });
  assert.equal(login.status, 403);
  assert.equal(login.cookie, undefined);
  assert.equal((await f.request('/projects')).status, 401);
  assert.equal((await f.request(`/users/${signup.data.user.id}`, { method: 'PATCH', body: { status: 'active' } })).status, 401);
  assert.equal((await f.request('/auth/signup', { method: 'POST', body: { name: 'Duplicate', email: 'YOUSSEF@EXAMPLE.TEST', password: PASSWORD } })).status, 409);
});

test('only admins approve accounts and change roles', async (t) => {
  const f = await fixture(t);
  const admin = await f.activeUser('Nadia Administratrice', 'nadia@example.test', 'admin');
  const pending = (await f.signup()).data.user;
  const approved = await f.request(`/users/${pending.id}`, { method: 'PATCH', cookie: admin.cookie, body: { status: 'active' } });
  assert.equal(approved.status, 200);
  const user = await f.login(pending.email);
  assert.equal(user.data.user.role, 'user');
  assert.equal((await f.request(`/users/${pending.id}`, { method: 'PATCH', cookie: user.cookie, body: { role: 'user' } })).status, 403);
  assert.equal((await f.request(`/users/${pending.id}`, { method: 'PATCH', cookie: admin.cookie, body: { role: 'admin' } })).status, 200);
  assert.equal((await f.request(`/users/${f.owner.id}`, { method: 'PATCH', cookie: admin.cookie, body: { role: 'user' } })).status, 200);
  const activities = (await f.request('/activity', { cookie: admin.cookie })).data.activities;
  assert.ok(activities.some((a) => a.actorName === admin.user.name && a.changes.some((c) => c.field === 'status' && c.before === 'pending' && c.after === 'active')));
});

test('all active users can manage projects but not accounts', async (t) => {
  const f = await fixture(t);
  const member = await f.activeUser();
  const outsider = await f.activeUser('Amine Externe', 'amine@example.test');
  const project = await f.project();
  assert.equal((await f.request(`/projects/${project.id}`, { cookie: member.cookie })).status, 200);
  assert.deepEqual((await f.request('/projects', { cookie: outsider.cookie })).data.projects.map((p) => p.id), [project.id]);
  assert.equal((await f.request(`/projects/${project.id}`, { cookie: outsider.cookie })).status, 200);
  assert.equal((await f.request(`/activity?projectId=${project.id}`, { cookie: outsider.cookie })).status, 200);
  assert.equal((await f.request(`/projects/${project.id}/export`, { cookie: outsider.cookie })).status, 200);
  const pdf = await f.request(`/projects/${project.id}/export.pdf`, { cookie: outsider.cookie });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-type'), /application\/pdf/);
  assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
  const pdfText = pdf.bytes.toString('latin1');
  assert.match(pdfText, /Fiche projet/);
  assert.match(pdfText, /Informations g.n.rales/);
  assert.match(pdfText, /Pi.ces jointes/);
  assert.match(pdfText, /Historique/);
  assert.match(pdfText, /Date de d.but/);
  assert.doesNotMatch(pdfText, /\u00c3|\u00c2|\u00e2/);
  assert.equal((await f.request(`/projects/${project.id}/attachments/missing/download`, { cookie: outsider.cookie })).status, 404);
  assert.equal((await f.request(`/projects/${project.id}/progress`, { method: 'PATCH', cookie: outsider.cookie, body: { progress: 80 } })).status, 200);
  const createdByUser = await f.request('/projects', { method: 'POST', cookie: member.cookie, body: { ...PROJECT, title: 'Projet créé par utilisateur' } });
  assert.equal(createdByUser.status, 201);
  assert.equal((await f.request(`/projects/${createdByUser.data.project.id}`, { method: 'PUT', cookie: member.cookie, body: { title: 'Projet modifié par utilisateur' } })).status, 200);
  assert.equal((await f.request(`/projects/${createdByUser.data.project.id}`, { method: 'DELETE', cookie: member.cookie })).status, 200);
  const userList = (await f.request('/users', { cookie: member.cookie })).data.users;
  assert.ok(userList.every((u) => 'email' in u));
  assert.ok(userList.some((u) => u.id === outsider.user.id));
  assert.equal((await f.request(`/users/${outsider.user.id}`, { method: 'PATCH', cookie: member.cookie, body: { status: 'suspended' } })).status, 403);
  const update = await f.request(`/projects/${project.id}/progress`, { method: 'PATCH', cookie: member.cookie, body: { progress: 48, title: 'Must not change' } });
  assert.equal(update.status, 200);
  assert.equal(update.data.project.progress, 48);
  assert.equal(update.data.project.title, project.title);
  assert.ok(!('memberIds' in update.data.project));
});

test('real-time stream notifies active users after project changes', async (t) => {
  const f = await fixture(t);
  const member = await f.activeUser();
  const project = await f.project();
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(`${f.base}/api/events`, { headers: { Cookie: member.cookie }, signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  assert.equal((await nextSseEvent(reader)).event, 'ready');
  await f.request(`/projects/${project.id}/progress`, { method: 'PATCH', cookie: f.ownerCookie, body: { progress: 44 } });
  assert.equal((await nextSseEvent(reader)).event, 'refresh');
  await reader.cancel();
  controller.abort();
});

test('search, edits and deletion preserve actor and before/after audit information', async (t) => {
  const f = await fixture(t);
  const member = await f.activeUser();
  const project = await f.project();
  await f.project({ title: 'Aménagement voirie' });
  assert.deepEqual((await f.request('/projects?search=ATLAS', { cookie: f.ownerCookie })).data.projects.map((p) => p.id), [project.id]);
  assert.match(project.commencementOrder, /jour/);
  assert.equal((await f.request('/projects?search=voirie', { cookie: member.cookie })).data.projects.length, 1);
  const result = await f.request(`/projects/${project.id}/progress`, { method: 'PATCH', cookie: member.cookie, body: { progress: 65, status: 'paused' } });
  assert.equal(result.status, 200);
  assert.equal(result.data.project.updatedBy, member.user.name);
  assert.ok(Date.parse(result.data.project.updatedAt) >= Date.parse(project.updatedAt));
  const history = (await f.request(`/activity?projectId=${project.id}`, { cookie: member.cookie })).data.activities;
  const entry = history.find((a) => a.changes.some((c) => c.field === 'progress' && c.before === 20 && c.after === 65));
  assert.ok(entry);
  assert.equal(entry.actorName, member.user.name);
  assert.ok(Number.isFinite(Date.parse(entry.createdAt)));
  assert.ok(entry.changes.some((c) => c.field === 'status' && c.before === 'in_progress' && c.after === 'paused'));
  const edited = await f.request(`/projects/${project.id}`, { method: 'PUT', cookie: f.ownerCookie, body: { title: 'École Atlas · phase 2', endDate: '2027-01-15' } });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.project.title, 'École Atlas · phase 2');
  assert.equal((await f.request(`/projects/${project.id}`, { method: 'DELETE', cookie: f.ownerCookie })).status, 200);
  assert.equal((await f.request(`/projects/${project.id}`, { cookie: f.ownerCookie })).status, 404);
  const retained = (await f.request(`/activity?projectId=${project.id}`, { cookie: f.ownerCookie })).data.activities;
  assert.ok(retained.some((a) => a.changes.some((c) => c.field === 'project' && c.after === null)));
});

test('suspending a user does not depend on project assignment', async (t) => {
  const f = await fixture(t);
  const active = await f.activeUser();
  const suspended = await f.activeUser('Adil Suspendu', 'adil@example.test');
  const project = await f.project();
  assert.equal((await f.request(`/users/${suspended.user.id}`, { method: 'PATCH', cookie: f.ownerCookie, body: { status: 'suspended' } })).status, 200);
  const progress = await f.request(`/projects/${project.id}/progress`, { method: 'PATCH', cookie: active.cookie, body: { progress: 45 } });
  assert.equal(progress.status, 200, JSON.stringify(progress.data));
  assert.equal(progress.data.project.progress, 45);
  const edit = await f.request(`/projects/${project.id}`, { method: 'PUT', cookie: f.ownerCookie, body: { description: 'Le chantier continue malgré la suspension du compte.' } });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.equal((await f.request(`/projects/${project.id}`, { cookie: active.cookie })).status, 200);
  assert.equal((await f.request(`/activity?projectId=${project.id}`, { cookie: active.cookie })).status, 200);
  assert.equal((await f.request(`/projects/${project.id}/export`, { cookie: active.cookie })).status, 200);
});

test('date validation rejects impossible/reversed dates and progress remains coherent', async (t) => {
  const f = await fixture(t);
  for (const invalid of [{ startDate: '2026-02-30' }, { endDate: '2025-12-31' }, { startDate: '09/09/2026' }, { progress: -1 }, { progress: 101 }, { progress: '50' }, { status: 'unknown' }]) {
    assert.equal((await f.request('/projects', { method: 'POST', cookie: f.ownerCookie, body: { ...PROJECT, ...invalid } })).status, 400, JSON.stringify(invalid));
  }
  const sameDay = await f.project({ startDate: '2026-09-09', endDate: '2026-09-09', status: 'planned', progress: 0 });
  assert.equal(sameDay.startDate, sameDay.endDate);
  const completed = await f.request(`/projects/${sameDay.id}/progress`, { method: 'PATCH', cookie: f.ownerCookie, body: { status: 'completed', progress: 40 } });
  assert.equal(completed.status, 200);
  assert.equal(completed.data.project.progress, 100);
  assert.equal(completed.data.project.status, 'completed');
  const fromPercent = await f.project({ progress: 100, status: 'in_progress' });
  assert.equal(fromPercent.status, 'completed');
  const started = await f.project({ status: 'planned', progress: 20 });
  assert.equal(started.status, 'in_progress');
});

test('file upload, rename, ZIP export and deletion preserve bytes and attachment ownership', async (t) => {
  const f = await fixture(t);
  const member = await f.activeUser();
  const second = await f.activeUser('Meryem Collègue', 'meryem@example.test');
  const project = await f.project();
  const form = new FormData();
  const content = 'Compte rendu de chantier\nTravaux réalisés : façade nord.\n';
  form.append('files', new Blob([content], { type: 'text/plain' }), 'compte-rendu.txt');
  const uploaded = await f.request(`/projects/${project.id}/attachments`, { method: 'POST', cookie: member.cookie, body: form });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const file = uploaded.data.attachments[0];
  assert.equal(file.uploadedByName, member.user.name);
  const attachmentUrl = `/projects/${project.id}/attachments/${file.id}`;
  assert.equal((await f.request(attachmentUrl, { method: 'PATCH', cookie: second.cookie, body: { name: 'Compte rendu terrain.txt' } })).status, 200);
  assert.equal((await f.request(attachmentUrl, { method: 'PATCH', cookie: member.cookie, body: { name: 'Rapport.exe' } })).status, 400);
  const renamed = await f.request(attachmentUrl, { method: 'PATCH', cookie: member.cookie, body: { name: 'Rapport final' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.attachment.name, 'Rapport final.txt');
  const download = await f.request(`${attachmentUrl}/download`, { cookie: second.cookie });
  assert.equal(download.status, 200);
  assert.equal(download.bytes.toString(), content);
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.equal(download.headers.get('cache-control'), 'no-store');
  const exported = await f.request(`/projects/${project.id}/export`, { cookie: member.cookie });
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-type'), /application\/zip/);
  const entries = unzip(exported.bytes);
  assert.ok(entries.has('projets.csv'));
  assert.equal([...entries.keys()].filter((name) => name.endsWith('.json')).length, 0);
  assert.equal([...entries.keys()].filter((name) => name.endsWith('/fiche-projet.pdf')).length, 1);
  const fileEntry = [...entries.keys()].find((name) => name.endsWith('-Rapport final.txt'));
  assert.ok(fileEntry);
  assert.equal(entries.get(fileEntry).toString(), content);
  assert.ok([...entries.values()].some((value) => value.subarray(0, 5).toString() === '%PDF-' && value.toString('latin1').includes('Rapport final.txt')));
  assert.equal((await f.request(attachmentUrl, { method: 'DELETE', cookie: member.cookie })).status, 200);
  assert.equal((await f.request(`${attachmentUrl}/download`, { cookie: member.cookie })).status, 404);
  assert.deepEqual(await readdir(path.join(f.dataDir, 'uploads')), []);
});

test('project PDF includes attached images', async (t) => {
  const f = await fixture(t);
  const project = await f.project();
  const form = new FormData();
  form.append('files', new Blob([PNG_1X1], { type: 'image/png' }), 'chantier.png');
  const uploaded = await f.request(`/projects/${project.id}/attachments`, { method: 'POST', cookie: f.ownerCookie, body: form });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const pdf = await f.request(`/projects/${project.id}/export.pdf`, { cookie: f.ownerCookie });
  assert.equal(pdf.status, 200);
  const content = pdf.bytes.toString('latin1');
  assert.match(content, /Photos int.gr.es/);
  assert.match(content, /chantier\.png/);
  assert.match(content, /\/Subtype \/Image/);
  assert.match(content, /\/XObject/);
});

test('malformed or forbidden uploads leave no files behind', async (t) => {
  const f = await fixture(t);
  const project = await f.project();
  for (const [filename, content] of [['payload.html', '<script>alert(1)</script>'], ['faux.pdf', 'not a PDF']]) {
    const form = new FormData();
    form.append('files', new Blob([content]), filename);
    const result = await f.request(`/projects/${project.id}/attachments`, { method: 'POST', cookie: f.ownerCookie, body: form });
    assert.equal(result.status, 400, filename);
    assert.deepEqual(await readdir(path.join(f.dataDir, 'uploads')), []);
  }
  assert.equal((await f.request(`/projects/${project.id}`, { cookie: f.ownerCookie })).data.project.attachments.length, 0);
});

test('export all includes every project, history and actual attachment file for active users', async (t) => {
  const f = await fixture(t);
  const member = await f.activeUser();
  const visible = await f.project({ title: '=Projet visible' });
  const secret = await f.project({ title: 'Projet confidentiel' });
  const form = new FormData();
  form.append('files', new Blob(['secret attachment']), 'confidentiel.txt');
  assert.equal((await f.request(`/projects/${secret.id}/attachments`, { method: 'POST', cookie: f.ownerCookie, body: form })).status, 201);
  const memberExport = unzip((await f.request('/export', { cookie: member.cookie })).bytes);
  assert.equal([...memberExport.keys()].filter((name) => name.endsWith('.json')).length, 0);
  assert.ok([...memberExport.keys()].some((name) => name.includes('confidentiel')));
  const memberPdfs = [...memberExport.entries()].filter(([name]) => name.endsWith('/fiche-projet.pdf'));
  assert.equal(memberPdfs.length, 2);
  assert.ok(memberPdfs.every(([, content]) => content.subarray(0, 5).toString() === '%PDF-'));
  assert.ok(memberPdfs.some(([, content]) => content.toString('latin1').includes('Projet confidentiel')));
  assert.ok(memberPdfs.some(([, content]) => content.toString('latin1').includes('=Projet visible')));
  assert.ok(memberExport.get('projets.csv').toString().includes('"\'=Projet visible"'), 'Spreadsheet formula prefixes must be neutralized');
  const adminExport = unzip((await f.request('/export', { cookie: f.ownerCookie })).bytes);
  assert.equal([...adminExport.keys()].filter((name) => name.endsWith('.json')).length, 0);
  assert.equal([...adminExport.keys()].filter((name) => name.endsWith('/fiche-projet.pdf')).length, 2);
  const secretEntry = [...adminExport.keys()].find((name) => name.endsWith('-confidentiel.txt'));
  assert.equal(adminExport.get(secretEntry).toString(), 'secret attachment');
});

test('passwords and session tokens are hashed; sessions and projects survive restart', async (t) => {
  const f = await fixture(t);
  const member = await f.activeUser();
  const project = await f.project();
  const users = f.db.prepare('SELECT password_hash FROM users').all();
  assert.ok(users.every((u) => /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(u.password_hash)));
  assert.notEqual(users[0].password_hash, users[1].password_hash, 'Identical passwords use distinct salts');
  const rawToken = f.ownerCookie.split('=')[1];
  const sessions = f.db.prepare('SELECT token_hash FROM sessions').all();
  assert.ok(!sessions.some((s) => s.token_hash === rawToken));
  assert.ok(sessions.some((s) => s.token_hash === createHash('sha256').update(rawToken).digest('hex')));
  await f.restart();
  assert.equal((await f.request('/auth/me', { cookie: f.ownerCookie })).data.user.id, f.owner.id);
  assert.equal((await f.request(`/projects/${project.id}`, { cookie: f.ownerCookie })).status, 200);
  assert.equal((await f.request('/auth/me', { cookie: member.cookie })).status, 200);
  assert.equal((await f.request('/auth/logout', { method: 'POST', cookie: member.cookie })).status, 200);
  assert.equal((await f.request('/auth/me', { cookie: member.cookie })).status, 401);
  assert.equal((await f.request('/auth/login', { method: 'POST', body: { email: OWNER.email, password: 'wrong-password' } })).status, 401);
});

test('suspension and role changes invalidate sessions without role hierarchy', async (t) => {
  const f = await fixture(t);
  const admin = await f.activeUser('Nadia Administratrice', 'nadia-late@example.test', 'admin');
  const member = await f.activeUser();
  assert.equal((await f.request(`/users/${f.owner.id}`, { method: 'PATCH', cookie: f.ownerCookie, body: { role: 'user' } })).status, 200);
  f.ownerCookie = (await f.login(OWNER.email)).cookie;
  assert.equal((await f.request(`/users/${f.owner.id}`, { method: 'PATCH', cookie: f.ownerCookie, body: { status: 'suspended' } })).status, 403);
  assert.equal((await f.request(`/users/${admin.user.id}`, { method: 'PATCH', cookie: admin.cookie, body: { status: 'suspended' } })).status, 400);
  assert.equal((await f.request(`/users/${member.user.id}`, { method: 'PATCH', cookie: admin.cookie, body: { status: 'suspended' } })).status, 200);
  assert.equal((await f.request('/auth/me', { cookie: member.cookie })).status, 401);
  assert.equal((await f.request('/auth/login', { method: 'POST', body: { email: member.user.email, password: PASSWORD } })).status, 403);
  assert.equal((await f.request(`/users/${member.user.id}`, { method: 'PATCH', cookie: admin.cookie, body: { status: 'active' } })).status, 200);
  const refreshed = await f.login(member.user.email);
  assert.equal((await f.request(`/users/${member.user.id}`, { method: 'PATCH', cookie: admin.cookie, body: { role: 'admin' } })).status, 200);
  assert.equal((await f.request('/auth/me', { cookie: refreshed.cookie })).status, 401);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND status='active'").get().count, 2);
});

test('admins can delete other accounts and invalidate their sessions', async (t) => {
  const f = await fixture(t);
  const admin = await f.activeUser('Nadia Administratrice', 'nadia-delete@example.test', 'admin');
  const member = await f.activeUser('Membre à supprimer', 'delete-me@example.test');
  assert.equal((await f.request(`/users/${member.user.id}`, { method: 'DELETE', cookie: admin.cookie })).status, 200);
  assert.equal((await f.request('/auth/me', { cookie: member.cookie })).status, 401);
  const users = (await f.request('/users', { cookie: admin.cookie })).data.users;
  assert.ok(!users.some((u) => u.id === member.user.id));
  assert.equal((await f.request(`/users/${admin.user.id}`, { method: 'DELETE', cookie: admin.cookie })).status, 400);
});

test('private API responses prevent caching and reject cross-origin mutations', async (t) => {
  const f = await fixture(t);
  const result = await f.request('/projects', { cookie: f.ownerCookie });
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await f.request('/projects', { method: 'POST', cookie: f.ownerCookie, body: PROJECT, headers: { Origin: 'https://untrusted.example.test' } })).status, 403);
  assert.equal((await f.request('/projects', { cookie: f.ownerCookie })).data.projects.length, 0);
});



