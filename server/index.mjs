import './env.mjs';
import express from 'express';
import multer from 'multer';
import archiver from 'archiver';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, existsSync, unlinkSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { createStore, databaseEnvStatus, pgCount } from './db.mjs';
import { blobAccessMode, createStorage, isBlobMode } from './storage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const ROLES = ['admin', 'user'];
const STATES = ['pending', 'active', 'rejected', 'suspended'];
const PROJECT_STATES = ['planned', 'in_progress', 'paused', 'completed'];
const FILE_TYPES = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif',
  '.txt': 'text/plain', '.csv': 'text/csv', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text', '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
};

const fail = (status, message) => Object.assign(new Error(message), { status });
const now = () => new Date().toISOString();
const hashToken = token => createHash('sha256').update(token).digest('hex');
const normalizedRole = role => role === 'super_admin' ? 'admin' : role;
const userView = row => row && ({ id: row.id, name: row.name, email: row.email, role: normalizedRole(row.role), status: row.status, createdAt: row.created_at });
function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function passwordMatches(password, hash) {
  const [salt, key] = hash.split(':');
  return timingSafeEqual(Buffer.from(key, 'hex'), scryptSync(password, salt, 64));
}
function textField(value, label, { max = 300, required = true } = {}) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw fail(400, `${label} invalide.`);
  const result = value.trim();
  if ((required && !result) || result.length > max) throw fail(400, `${label} : entre ${required ? 1 : 0} et ${max} caractères.`);
  return result;
}
function credentials(body, registration = false) {
  const email = textField(body.email, 'Adresse e-mail', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Adresse e-mail invalide.');
  if (typeof body.password !== 'string' || body.password.length > 128 || body.password.length < (registration ? 10 : 1)) {
    throw fail(400, 'Le mot de passe doit contenir entre 10 et 128 caractères.');
  }
  return { email, password: body.password, ...(registration ? { name: textField(body.name, 'Nom', { max: 120 }) } : {}) };
}
function dateField(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw fail(400, `${label} invalide (AAAA-MM-JJ).`);
  }
  return value;
}
function safeFilename(value) {
  const name = textField(value, 'Nom du fichier', { max: 180 }).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '');
  if (!name || name === '.' || name === '..') throw fail(400, 'Nom du fichier invalide.');
  return name;
}
function csvCell(value) {
  let result = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  if (/^[=+\-@\t\r]/.test(result)) result = `'${result}`;
  return `"${result.replaceAll('"', '""')}"`;
}
const pdfText = value => String(value ?? '')
  .normalize('NFC')
  .replace(/[“”]/g, '"')
  .replace(/[’‘]/g, "'")
  .replace(/…/g, '...')
  .replace(/[—–]/g, '-')
  .replace(/€/g, 'EUR')
  .replace(/[^	\n\r\x20-\xff]/g, '?');
const pdfString = value => `(${pdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
const pdfDate = value => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value)) : '-';
const pdfDateTime = value => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-';
const dateDays = value => Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
const remainingDaysLabel = project => {
  if (project.status === 'completed' || project.progress >= 100) return 'Projet terminé';
  const days = dateDays(project.endDate) - dateDays(now().slice(0, 10));
  if (days < 0) return `${Math.abs(days)} jour${Math.abs(days) > 1 ? 's' : ''} de retard`;
  return `${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''}`;
};
const wrapText = (value, limit = 86) => {
  const words = String(value || '-').replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > limit) {
      if (line) lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['-'];
};
const pdfValue = value => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return value.title || value.name || JSON.stringify(value);
  return String(value);
};
function jpegSize(data) {
  let i = 2;
  while (i < data.length) {
    if (data[i] !== 0xff) break;
    const marker = data[i + 1];
    const length = data.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { width: data.readUInt16BE(i + 7), height: data.readUInt16BE(i + 5), colorSpace: '/DeviceRGB', bits: 8, filter: '/DCTDecode', data };
    i += 2 + length;
  }
  return null;
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function pngImage(data) {
  if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const chunks = [];
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString('ascii');
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); bitDepth = chunk[8]; colorType = chunk[9];
    } else if (type === 'IDAT') chunks.push(chunk);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (bitDepth !== 8 || ![0, 2, 4, 6].includes(colorType) || !width || !height) return null;
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const rows = [];
  let source = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[source++];
    const row = Buffer.from(raw.subarray(source, source + stride));
    source += stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + up) & 255;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 255;
    }
    rows.push(row);
    previous = row;
  }
  const pixels = Buffer.alloc(width * height * 3);
  let target = 0;
  for (const row of rows) {
    for (let x = 0; x < width; x++) {
      if (colorType === 0 || colorType === 4) {
        const gray = row[x * channels];
        pixels[target++] = gray; pixels[target++] = gray; pixels[target++] = gray;
      } else {
        const i = x * channels;
        pixels[target++] = row[i]; pixels[target++] = row[i + 1]; pixels[target++] = row[i + 2];
      }
    }
  }
  return { width, height, colorSpace: '/DeviceRGB', bits: 8, filter: '/FlateDecode', data: deflateImage(pixels) };
}
function deflateImage(data) {
  return deflateSync(data);
}
function fileBytes(file, storage) {
  try {
    if (file.buffer) return file.buffer;
    if (file.path) return readFileSync(file.path);
    if (file.storage_name && storage) return null;
  } catch {}
  return null;
}
async function pdfImageFromBytes(data, name, mime) {
  try {
    if (/jpe?g$/i.test(name) || mime === 'image/jpeg') return jpegSize(data);
    if (/png$/i.test(name) || mime === 'image/png') return pngImage(data);
  } catch {}
  return null;
}
function projectPdf(project, activities, imageFiles = []) {
  const durationDays = Math.round((Date.parse(project.endDate) - Date.parse(project.startDate)) / 86400000);
  const status = { planned: 'À démarrer', in_progress: 'En cours', paused: 'En pause', completed: 'Terminé' }[project.status] || project.status;
  const rows = [
    ['Titre', project.title],
    ['Date de début', pdfDate(project.startDate)],
    ['Date de fin', pdfDate(project.endDate)],
    ['Délai', `${durationDays} jours`],
    ['Jours restants', remainingDaysLabel(project)],
    ['Avancement', `${project.progress} %`],
    ['État', status],
    ['Dernière modification', `${pdfDateTime(project.updatedAt)} par ${project.updatedBy}`],
  ];
  const lines = [
    { text: 'Fiche projet', size: 19, gap: 27 },
    { text: 'Informations générales', size: 13, gap: 18 },
    ...rows.flatMap(([label, value]) => wrapText(`${label} : ${value}`, 92).map(text => ({ text, size: 10, gap: 14 }))),
    { text: '', size: 8, gap: 8 },
    { text: 'Description', size: 13, gap: 18 },
    ...wrapText(project.description || 'Aucune description renseignée.', 96).map(text => ({ text, size: 10, gap: 13 })),
    { text: '', size: 8, gap: 8 },
    { text: `Pièces jointes (${project.attachments.length})`, size: 13, gap: 18 },
    ...(project.attachments.length
      ? project.attachments.flatMap((file, index) => wrapText(`${index + 1}. ${file.name} - ${Math.round(file.size / 1024)} Ko - ajouté par ${file.uploadedByName || '-'} le ${pdfDateTime(file.createdAt)}`, 96).map(text => ({ text, size: 9, gap: 12 })))
      : [{ text: 'Aucune pièce jointe.', size: 10, gap: 13 }]),
    { text: '', size: 8, gap: 8 },
    { text: `Historique (${activities.length})`, size: 13, gap: 18 },
    ...(activities.length ? activities.flatMap(item => {
      const changes = Array.isArray(item.changes) && item.changes.length
        ? item.changes.map(change => `   - ${change.field} : ${pdfValue(change.before)} -> ${pdfValue(change.after)}`)
        : ['   - Aucun détail'];
      return [
        ...wrapText(`${pdfDateTime(item.createdAt)} - ${item.actorName} - ${item.action}`, 96).map(text => ({ text, size: 9, gap: 12 })),
        ...changes.flatMap(change => wrapText(change, 94).map(text => ({ text, size: 8, gap: 11 }))),
        { text: '', size: 8, gap: 5 },
      ];
    }) : [{ text: 'Aucune modification enregistrée.', size: 10, gap: 13 }]),
  ];
  const images = imageFiles.map(file => ({ file, image: file.image })).filter(item => item.image);
  if (images.length) {
    lines.push({ text: '', size: 8, gap: 8 }, { text: `Photos intégrées (${images.length})`, size: 13, gap: 18 });
    images.forEach(({ file }, index) => lines.push({ text: `${index + 1}. ${file.name}`, size: 9, gap: 12 }));
  }
  const pages = [];
  let page = ['BT', '50 792 Td'];
  let y = 792;
  for (const line of lines) {
    if (y - line.gap < 44) {
      page.push('ET');
      pages.push(page.join('\n'));
      page = ['BT', '50 792 Td'];
      y = 792;
    }
    page.push(`/F1 ${line.size} Tf`, `${pdfString(line.text)} Tj`, `0 -${line.gap} Td`);
    y -= line.gap;
  }
  page.push('ET');
  pages.push(page.join('\n'));
  const imagePages = images.map(({ file, image }, index) => {
    const maxW = 495, maxH = 610;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    const x = Math.round((595 - width) / 2);
    const yImage = 105 + Math.round((610 - height) / 2);
    return {
      file,
      image,
      content: `BT\n/F1 15 Tf\n50 792 Td\n${pdfString(`Photo ${index + 1} : ${file.name}`)} Tj\nET\nq\n${width} 0 0 ${height} ${x} ${yImage} cm\n/Im${index + 1} Do\nQ`,
    };
  });
  const allPages = [...pages, ...imagePages.map(item => item.content)];
  const fontObject = 3 + allPages.length * 2;
  const firstImageObject = fontObject + 1;
  const pageRefs = allPages.map((_, index) => `${3 + index * 2} 0 R`).join(' ');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${allPages.length} >>\nendobj\n`,
  ];
  allPages.forEach((content, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const stream = Buffer.from(content, 'latin1');
    const imageIndex = index - pages.length;
    const xObject = imageIndex >= 0 ? `/XObject << /Im${imageIndex + 1} ${firstImageObject + imageIndex} 0 R >> ` : '';
    objects.push(`${pageObject} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObject} 0 R >> ${xObject}>> /Contents ${contentObject} 0 R >>\nendobj\n`);
    objects.push(`${contentObject} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream.toString('latin1')}\nendstream\nendobj\n`);
  });
  objects.push(`${fontObject} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`);
  images.forEach(({ image }, index) => {
    objects.push(`${firstImageObject + index} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace ${image.colorSpace} /BitsPerComponent ${image.bits} /Filter ${image.filter} /Length ${image.data.length} >>\nstream\n${image.data.toString('latin1')}\nendstream\nendobj\n`);
  });
  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(chunks.join(''), 'latin1'));
    chunks.push(object);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(''), 'latin1');
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(chunks.join(''), 'latin1');
}
function validFileContent(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const data = file.buffer || (() => { try { return readFileSync(file.path); } catch { return null; } })();
  if (!data) return false;
  const starts = bytes => data.subarray(0, bytes.length).equals(Buffer.from(bytes));
  if (ext === '.pdf') return data.subarray(0, 5).toString() === '%PDF-';
  if (ext === '.png') return starts([137, 80, 78, 71, 13, 10, 26, 10]);
  if (ext === '.jpg' || ext === '.jpeg') return starts([255, 216, 255]);
  if (ext === '.gif') return /^GIF8[79]a/.test(data.subarray(0, 6).toString());
  if (ext === '.webp') return data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
  if (ext === '.heic' || ext === '.heif') return data.subarray(4, 8).toString() === 'ftyp';
  if (['.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp'].includes(ext)) return starts([80, 75, 3, 4]);
  if (['.doc', '.xls', '.ppt'].includes(ext)) return starts([208, 207, 17, 224, 161, 177, 26, 225]);
  return (ext === '.txt' || ext === '.csv') && !data.includes(0);
}

export async function createApp({ dataDir = process.env.DATA_DIR || path.join(ROOT, 'data'), staticDir = path.join(ROOT, 'dist') } = {}) {
  dataDir = path.resolve(dataDir);
  if (!process.env.DATABASE_URL) mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  const store = await createStore({ dataDir });
  const storage = createStorage({ dataDir });
  const db = store.raw;
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      const allowed = process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
      if (req.headers.origin !== allowed) return res.status(403).json({ error: 'Origine de la requête non autorisée.' });
    }
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  const clients = new Set();
  const broadcast = (type = 'refresh') => {
    const payload = `event: ${type}\ndata: ${JSON.stringify({ at: now() })}\n\n`;
    for (const res of clients) { try { res.write(payload); } catch {} }
  };
  const transaction = (fn) => store.transaction(fn);
  const audit = async (tx, actor, action, project = null, changes = []) => {
    await tx.run('INSERT INTO activities VALUES (?,?,?,?,?,?,?,?)', [randomUUID(), project?.id || null, project?.title || null, actor.id, actor.name, action, JSON.stringify(changes), now()]);
  };
  const attachmentView = row => ({ id: row.id, projectId: row.project_id, name: row.name, originalName: row.original_name, mimeType: row.mime_type, size: Number(row.size), uploadedBy: row.uploaded_by, uploadedByName: row.uploaded_by_name, createdAt: row.created_at });
  const projectView = async (row) => {
    const attachments = await store.all('SELECT * FROM attachments WHERE project_id = ? ORDER BY created_at DESC, id DESC', [row.id]);
    const project = {
      id: row.id, title: row.title, description: row.description, startDate: row.start_date, endDate: row.end_date,
      progress: Number(row.progress), status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, updatedBy: row.updated_by,
      attachments: attachments.map(attachmentView),
    };
    return { ...project, commencementOrder: remainingDaysLabel(project) };
  };
  const activityView = row => ({ id: row.id, projectId: row.project_id, projectTitle: row.project_title, actorName: row.actor_name, action: row.action, changes: JSON.parse(row.changes), createdAt: row.created_at });
  const authenticate = async (req, res, next) => {
    try {
      const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('suivi_session='));
      const token = cookie?.slice('suivi_session='.length);
      if (!token || !/^[a-f0-9]{64}$/.test(token)) throw fail(401, 'Connectez-vous pour continuer.');
      const user = await store.get('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.status = ?', [hashToken(token), Date.now(), 'active']);
      if (!user) throw fail(401, 'Votre session a expiré. Reconnectez-vous.');
      req.user = userView(user);
      req.sessionHash = hashToken(token);
      next();
    } catch (e) { next(e); }
  };
  const adminOnly = (req, res, next) => next();
  const accountAdminOnly = (req, res, next) => {
    if (normalizedRole(req.user?.role) !== 'admin') return next(fail(403, 'Seul un administrateur peut autoriser ou modifier les comptes.'));
    next();
  };
  const getProject = async (req) => {
    const row = await store.get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!row) throw fail(404, 'Projet introuvable.');
    return projectView(row);
  };
  const visibleProjects = async () => {
    const rows = await store.all('SELECT * FROM projects ORDER BY updated_at DESC, id DESC');
    return Promise.all(rows.map(projectView));
  };
  const stampProject = async (tx, id, actor) => tx.run('UPDATE projects SET updated_at=?, updated_by=? WHERE id=?', [now(), actor.name, id]);
  const setSession = async (req, res, userId) => {
    await store.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
    const token = randomBytes(32).toString('hex');
    await store.run('INSERT INTO sessions VALUES (?,?,?)', [hashToken(token), userId, Date.now() + SESSION_MS]);
    res.cookie('suivi_session', token, { httpOnly: true, secure: req.secure || process.env.COOKIE_SECURE === '1' || Boolean(process.env.VERCEL), sameSite: 'strict', path: '/', maxAge: SESSION_MS });
  };
  const attempts = new Map();
  const rateLimit = (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const time = Date.now();
    if (attempts.size > 1000) for (const [itemKey, value] of attempts) if (value.until < time) attempts.delete(itemKey);
    let attempt = attempts.get(key);
    if (!attempt || attempt.until < time) { attempt = { count: 0, until: time + 15 * 60 * 1000 }; attempts.set(key, attempt); }
    if (++attempt.count > 30) { res.set('Retry-After', String(Math.ceil((attempt.until - time) / 1000))); return next(fail(429, 'Trop de tentatives. Réessayez dans 15 minutes.')); }
    next();
  };
  const validateProject = (body, previous = null) => {
    const merged = { ...previous, ...body };
    const result = {
      title: textField(merged.title, 'Titre', { max: 180 }),
      description: textField(merged.description, 'Description', { max: 10000, required: false }),
      startDate: dateField(merged.startDate, 'Date de début'), endDate: dateField(merged.endDate, 'Date de fin'),
      commencementOrder: '',
      progress: merged.progress ?? 0, status: merged.status || 'planned',
    };
    if (result.endDate < result.startDate) throw fail(400, 'La date de fin doit être égale ou postérieure à la date de début.');
    if (typeof result.progress !== 'number' || !Number.isFinite(result.progress) || result.progress < 0 || result.progress > 100) throw fail(400, 'Le pourcentage doit être compris entre 0 et 100.');
    if (!PROJECT_STATES.includes(result.status)) throw fail(400, 'État du projet invalide.');
    if (result.status === 'completed') result.progress = 100;
    if (result.progress === 100) result.status = 'completed';
    if (result.status === 'planned' && result.progress > 0) result.status = 'in_progress';
    result.commencementOrder = remainingDaysLabel(result);
    return result;
  };
  const createProjectTx = async (tx, body, actor) => {
    const project = validateProject(body);
    const id = randomUUID();
    const date = now();
    await tx.run('INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [id, project.title, project.description, '', project.startDate, project.endDate, project.commencementOrder, project.progress, project.status, date, date, actor.name]);
    const row = await tx.get('SELECT * FROM projects WHERE id=?', [id]);
    const atts = await tx.all('SELECT * FROM attachments WHERE project_id = ? ORDER BY created_at DESC, id DESC', [id]);
    const full = { ...row, progress: Number(row.progress), startDate: row.start_date, endDate: row.end_date, createdAt: row.created_at, updatedAt: row.updated_at, updatedBy: row.updated_by, attachments: atts.map(attachmentView) };
    const view = { id: full.id, title: full.title, description: full.description, startDate: full.startDate, endDate: full.endDate, progress: full.progress, status: full.status, createdAt: full.createdAt, updatedAt: full.updatedAt, updatedBy: full.updatedBy, attachments: full.attachments, commencementOrder: remainingDaysLabel(full) };
    await audit(tx, actor, 'Projet créé', view, Object.entries(project).map(([field, after]) => ({ field, before: null, after })));
    return view;
  };

  app.get('/api/health', (req, res) => res.json({ status: 'ok', db: store.mode, storage: storage.mode, storageAccess: isBlobMode() ? blobAccessMode() : 'local', env: databaseEnvStatus() }));
  app.get('/api/auth/status', async (req, res) => {
    const row = await store.get('SELECT COUNT(*) AS count FROM users');
    res.json({ needsSetup: pgCount(row) === 0 });
  });
  app.post('/api/auth/setup', rateLimit, async (req, res) => {
    if (await store.get('SELECT 1 AS ok FROM users LIMIT 1')) throw fail(409, 'La configuration initiale a déjà été effectuée.');
    const { name, email, password } = credentials(req.body || {}, true);
    const user = await transaction(async (tx) => {
      if (await tx.get('SELECT 1 AS ok FROM users LIMIT 1')) throw fail(409, 'La configuration initiale a déjà été effectuée.');
      const id = randomUUID();
      await tx.run('INSERT INTO users VALUES (?,?,?,?,?,?,?)', [id, name, email, passwordHash(password), 'admin', 'active', now()]);
      const created = userView(await tx.get('SELECT * FROM users WHERE id=?', [id]));
      await audit(tx, created, 'Espace de travail créé');
      if (req.body.withExamples === true) {
        const year = new Date().getUTCFullYear();
        await createProjectTx(tx, { title: 'Réhabilitation du groupe scolaire Al Amal', description: 'Projet de démonstration : rénovation des salles de classe, étanchéité et réaménagement de la cour.', startDate: `${year}-06-01`, endDate: `${year}-12-15`, progress: 68, status: 'in_progress' }, created);
        await createProjectTx(tx, { title: 'Aménagement de la voirie - Quartier Les Orangers', description: 'Projet de démonstration : voirie, trottoirs et éclairage public.', startDate: `${year}-07-10`, endDate: `${year}-11-30`, progress: 35, status: 'in_progress' }, created);
        await createProjectTx(tx, { title: 'Construction du centre de proximité', description: 'Projet de démonstration : bâtiment administratif et espaces polyvalents.', startDate: `${year}-09-20`, endDate: `${year + 1}-03-15`, progress: 0, status: 'planned' }, created);
      }
      return created;
    });
    await setSession(req, res, user.id);
    res.status(201).json({ user });
  });
  app.post('/api/auth/signup', rateLimit, async (req, res) => {
    if (!(await store.get('SELECT 1 AS ok FROM users LIMIT 1'))) throw fail(409, 'L’administrateur doit d’abord configurer cet espace.');
    const { name, email, password } = credentials(req.body || {}, true);
    if (await store.get('SELECT 1 AS ok FROM users WHERE email=?', [email])) throw fail(409, 'Un compte existe déjà avec cette adresse e-mail.');
    const user = await transaction(async (tx) => {
      const id = randomUUID();
      await tx.run('INSERT INTO users VALUES (?,?,?,?,?,?,?)', [id, name, email, passwordHash(password), 'user', 'pending', now()]);
      const created = userView(await tx.get('SELECT * FROM users WHERE id=?', [id]));
      await audit(tx, created, 'Inscription en attente de validation');
      return created;
    });
    broadcast();
    res.status(201).json({ user });
  });
  const dummyHash = passwordHash(randomBytes(32).toString('hex'));
  app.post('/api/auth/login', rateLimit, async (req, res) => {
    const { email, password } = credentials(req.body || {});
    const row = await store.get('SELECT * FROM users WHERE email=?', [email]);
    const matches = passwordMatches(password, row?.password_hash || dummyHash);
    if (!row || !matches) throw fail(401, 'Adresse e-mail ou mot de passe incorrect.');
    if (row.status === 'pending') throw fail(403, 'Votre inscription est en attente de validation par un administrateur.');
    if (row.status !== 'active') throw fail(403, 'Votre compte n’est pas actif. Contactez un administrateur.');
    await setSession(req, res, row.id);
    res.json({ user: userView(row) });
  });
  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));
  app.post('/api/auth/logout', async (req, res) => {
    const token = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('suivi_session='))?.slice(14);
    if (token) await store.run('DELETE FROM sessions WHERE token_hash=?', [hashToken(token)]);
    res.clearCookie('suivi_session', { httpOnly: true, secure: req.secure, sameSite: 'strict', path: '/' });
    res.json({ success: true });
  });

  app.use('/api', authenticate);
  app.post('/api/blob/upload', async (req, res, next) => {
    try {
      if (!isBlobMode()) throw fail(409, 'Le stockage Blob n’est pas configuré.');
      const { handleUpload } = await import('@vercel/blob/client');
      const json = await handleUpload({
        body: req.body,
        request: req,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const payload = JSON.parse(clientPayload || '{}');
          if (!payload.projectId) throw fail(400, 'Projet manquant.');
          const row = await store.get('SELECT id FROM projects WHERE id=?', [payload.projectId]);
          if (!row) throw fail(404, 'Projet introuvable.');
          safeFilename(pathname.split('/').pop() || pathname);
          return {
            allowedContentTypes: Object.values(FILE_TYPES),
            maximumSizeInBytes: 20 * 1024 * 1024,
            addRandomSuffix: true,
            tokenPayload: JSON.stringify({ projectId: payload.projectId, userId: req.user.id }),
          };
        },
      });
      res.json(json);
    } catch (e) { next(e); }
  });
  app.get('/api/events', (req, res) => {
    if (process.env.VERCEL || process.env.DISABLE_SSE === '1') return res.status(204).end();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: ready\ndata: ${JSON.stringify({ at: now() })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  });
  app.get('/api/projects', async (req, res) => {
    const query = typeof req.query.search === 'string' ? req.query.search.toLocaleLowerCase('fr') : '';
    const projects = (await visibleProjects()).filter(project => !query || [project.title, project.description, project.commencementOrder].some(value => value.toLocaleLowerCase('fr').includes(query)));
    res.json({ projects });
  });
  app.post('/api/projects', adminOnly, async (req, res) => {
    const project = await transaction((tx) => createProjectTx(tx, req.body || {}, req.user));
    broadcast();
    res.status(201).json({ project });
  });
  app.get('/api/projects/:id', async (req, res) => res.json({ project: await getProject(req) }));
  app.put('/api/projects/:id', adminOnly, async (req, res) => {
    const previous = await getProject(req);
    const updated = validateProject(req.body || {}, previous);
    const changes = Object.entries(updated).filter(([field, value]) => JSON.stringify(value) !== JSON.stringify(previous[field])).map(([field, after]) => ({ field, before: previous[field], after }));
    if (changes.length) await transaction(async (tx) => {
      await tx.run('UPDATE projects SET title=?, description=?, location=?, start_date=?, end_date=?, commencement_order=?, progress=?, status=?, updated_at=?, updated_by=? WHERE id=?', [updated.title, updated.description, '', updated.startDate, updated.endDate, updated.commencementOrder, updated.progress, updated.status, now(), req.user.name, previous.id]);
      await audit(tx, req.user, 'Projet modifié', { ...previous, ...updated }, changes);
    });
    if (changes.length) broadcast();
    res.json({ project: await getProject(req) });
  });
  app.patch('/api/projects/:id/progress', async (req, res) => {
    const previous = await getProject(req);
    const body = req.body || {};
    if (body.progress === undefined && body.status === undefined) throw fail(400, 'Indiquez un pourcentage ou un état.');
    const updated = validateProject({ ...(body.progress === undefined ? {} : { progress: body.progress }), ...(body.status === undefined ? {} : { status: body.status }) }, previous);
    const changes = ['progress', 'status'].filter(field => previous[field] !== updated[field]).map(field => ({ field, before: previous[field], after: updated[field] }));
    if (changes.length) await transaction(async (tx) => {
      await tx.run('UPDATE projects SET progress=?,status=?,updated_at=?,updated_by=? WHERE id=?', [updated.progress, updated.status, now(), req.user.name, previous.id]);
      await audit(tx, req.user, 'Avancement mis à jour', previous, changes);
    });
    if (changes.length) broadcast();
    res.json({ project: await getProject(req) });
  });
  app.delete('/api/projects/:id', adminOnly, async (req, res) => {
    const project = await getProject(req);
    const files = await store.all('SELECT storage_name FROM attachments WHERE project_id=?', [project.id]);
    await transaction(async (tx) => { await audit(tx, req.user, 'Projet supprimé', project, [{ field: 'project', before: project, after: null }]); await tx.run('DELETE FROM projects WHERE id=?', [project.id]); });
    for (const file of files) await storage.remove(file.storage_name);
    broadcast();
    res.json({ success: true });
  });

  const upload = multer({
    storage: isBlobMode() ? multer.memoryStorage() : multer.diskStorage({ destination: storage.uploadDir, filename: (req, file, done) => done(null, randomBytes(24).toString('hex')) }),
    limits: { fileSize: (isBlobMode() ? 4.5 : 20) * 1024 * 1024, files: 10, fields: 0 },
    fileFilter: (req, file, done) => {
      const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
      if (!decoded.includes('�')) file.originalname = decoded;
      if (!FILE_TYPES[path.extname(file.originalname).toLowerCase()]) return done(fail(400, 'Format non autorisé. Ajoutez une photo, un PDF ou un document bureautique.'));
      done(null, true);
    },
  }).array('files', 10);
  app.post('/api/projects/:id/attachments', (req, res, next) => {
    upload(req, res, async (error) => {
      const clean = async () => {
        for (const file of req.files || []) {
          if (file.path) { try { unlinkSync(file.path); } catch {} }
        }
      };
      if (error) { await clean(); return next(error.code === 'LIMIT_FILE_SIZE' ? fail(400, 'Chaque fichier doit faire 4,5 Mo maximum sur Vercel (20 Mo en local).') : error); }
      try {
        const project = await getProject(req);
        if (!req.files?.length) throw fail(400, 'Sélectionnez au moins un fichier.');
        for (const file of req.files) if (!validFileContent(file)) throw fail(400, `Le contenu de « ${file.originalname} » ne correspond pas à son format.`);
        const attachments = await transaction(async (tx) => {
          const result = [];
          for (const file of req.files) {
            const id = randomUUID();
            const name = safeFilename(file.originalname);
            const storageName = await storage.saveMulterFile(file);
            await tx.run('INSERT INTO attachments VALUES (?,?,?,?,?,?,?,?,?,?)', [id, project.id, name, name, storageName, FILE_TYPES[path.extname(file.originalname).toLowerCase()], file.size, req.user.id, req.user.name, now()]);
            await audit(tx, req.user, 'Pièce jointe ajoutée', project, [{ field: 'attachment', before: null, after: name }]);
            result.push(attachmentView(await tx.get('SELECT * FROM attachments WHERE id=?', [id])));
          }
          await stampProject(tx, project.id, req.user);
          return result;
        });
        broadcast();
        res.status(201).json({ attachments, project: await getProject(req) });
      } catch (caught) { await clean(); next(caught); }
    });
  });
  app.post('/api/projects/:id/attachments/blob', async (req, res, next) => {
    try {
      if (!isBlobMode()) throw fail(409, 'Le stockage Blob n’est pas configuré.');
      const project = await getProject(req);
      const blob = req.body || {};
      const name = safeFilename(blob.name || blob.pathname?.split('/').pop() || '');
      const ext = path.extname(name).toLowerCase();
      const expectedMime = FILE_TYPES[ext];
      if (!expectedMime) throw fail(400, 'Format non autorisé. Ajoutez une photo, un PDF ou un document bureautique.');
      const size = Number(blob.size);
      if (!Number.isFinite(size) || size <= 0 || size > 20 * 1024 * 1024) throw fail(400, 'Chaque fichier doit faire au maximum 20 Mo.');
      if (typeof blob.url !== 'string' || !/^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(blob.url)) throw fail(400, 'Fichier Blob invalide.');
      const attachments = await transaction(async (tx) => {
        const id = randomUUID();
        await tx.run('INSERT INTO attachments VALUES (?,?,?,?,?,?,?,?,?,?)', [id, project.id, name, name, blob.url, expectedMime, size, req.user.id, req.user.name, now()]);
        await audit(tx, req.user, 'Pièce jointe ajoutée', project, [{ field: 'attachment', before: null, after: name }]);
        await stampProject(tx, project.id, req.user);
        return [attachmentView(await tx.get('SELECT * FROM attachments WHERE id=?', [id]))];
      });
      broadcast();
      res.status(201).json({ attachments, project: await getProject(req) });
    } catch (e) { next(e); }
  });
  const getAttachment = async (req) => {
    const project = await getProject(req);
    const attachment = await store.get('SELECT * FROM attachments WHERE id=? AND project_id=?', [req.params.attachmentId, project.id]);
    if (!attachment) throw fail(404, 'Pièce jointe introuvable.');
    return { project, attachment };
  };
  app.patch('/api/projects/:id/attachments/:attachmentId', async (req, res) => {
    const { project, attachment } = await getAttachment(req);
    let name = safeFilename(req.body?.name);
    const ext = path.extname(attachment.original_name);
    if (!path.extname(name)) name += ext;
    if (path.extname(name).toLowerCase() !== ext.toLowerCase()) throw fail(400, 'Conservez l’extension du fichier lors du renommage.');
    if (name !== attachment.name) await transaction(async (tx) => {
      await tx.run('UPDATE attachments SET name=? WHERE id=?', [name, attachment.id]);
      await stampProject(tx, project.id, req.user);
      await audit(tx, req.user, 'Pièce jointe renommée', project, [{ field: 'attachmentName', before: attachment.name, after: name }]);
    });
    if (name !== attachment.name) broadcast();
    res.json({ attachment: attachmentView(await store.get('SELECT * FROM attachments WHERE id=?', [attachment.id])), project: await getProject(req) });
  });
  app.delete('/api/projects/:id/attachments/:attachmentId', async (req, res) => {
    const { project, attachment } = await getAttachment(req);
    await transaction(async (tx) => {
      await tx.run('DELETE FROM attachments WHERE id=?', [attachment.id]);
      await stampProject(tx, project.id, req.user);
      await audit(tx, req.user, 'Pièce jointe supprimée', project, [{ field: 'attachment', before: attachment.name, after: null }]);
    });
    await storage.remove(attachment.storage_name);
    broadcast();
    res.json({ success: true, project: await getProject(req) });
  });
  app.get('/api/projects/:id/attachments/:attachmentId/download', async (req, res, next) => {
    try {
      const { attachment } = await getAttachment(req);
      if (isBlobMode() && /^https?:\/\//.test(attachment.storage_name)) {
        const data = await storage.readBytes(attachment.storage_name);
        res.setHeader('Content-Type', attachment.mime_type);
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('Content-Disposition', `attachment; filename="${attachment.name.replaceAll('"', '')}"`);
        return res.send(data);
      }
      const file = storage.localPath(attachment.storage_name);
      if (!existsSync(file)) throw fail(404, 'Le fichier est indisponible.');
      res.setHeader('Content-Type', attachment.mime_type);
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.download(file, attachment.name, error => { if (error && !res.headersSent) next(error); });
    } catch (e) { next(e); }
  });
  const exportProjects = async (req, res, projects, filename) => {
    const projectIds = new Set(projects.map(project => project.id));
    const allActivities = (await store.all('SELECT * FROM activities ORDER BY created_at, id')).filter(row => projectIds.has(row.project_id)).map(activityView);
    const attachmentRows = [];
    for (const project of projects) attachmentRows.push(...await store.all('SELECT * FROM attachments WHERE project_id=?', [project.id]));
    for (const file of attachmentRows) {
      if (!(await storage.exists(file.storage_name))) throw fail(409, 'Un fichier joint est indisponible. Contactez votre administrateur avant de relancer l’export.');
    }
    res.attachment(filename);
    res.type('application/zip');
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', error => { console.error('Export error:', error.message); if (!res.headersSent) res.status(500).json({ error: 'Échec de l’export.' }); else res.destroy(error); });
    req.on('aborted', () => archive.abort());
    archive.pipe(res);
    const header = ['Titre', 'Description', 'Date de début', 'Date de fin', 'Délai (jours)', 'Jours restants', 'Avancement (%)', 'État', 'Dernière modification', 'Modifié par'];
    const rows = projects.map(project => [project.title, project.description, project.startDate, project.endDate, Math.round((Date.parse(project.endDate) - Date.parse(project.startDate)) / 86400000), project.commencementOrder, project.progress, project.status, project.updatedAt, project.updatedBy]);
    archive.append('﻿' + [header, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n'), { name: 'projets.csv' });
    for (const project of projects) {
      const folder = `${safeFilename(project.title).slice(0, 80)}-${project.id.slice(0, 8)}`;
      const projectActivities = allActivities.filter(activity => activity.projectId === project.id);
      const imageRows = attachmentRows.filter(row => row.project_id === project.id && row.mime_type.startsWith('image/'));
      const projectImageFiles = [];
      for (const row of imageRows) {
        try {
          const bytes = await storage.readBytes(row.storage_name);
          const image = await pdfImageFromBytes(bytes, row.name, row.mime_type);
          if (image) projectImageFiles.push({ name: row.name, image });
        } catch {}
      }
      archive.append(projectPdf(project, projectActivities, projectImageFiles), { name: `${folder}/fiche-projet.pdf` });
      for (const attachment of attachmentRows.filter(row => row.project_id === project.id)) {
        const bytes = await storage.readBytes(attachment.storage_name);
        archive.append(bytes, { name: `${folder}/pieces-jointes/${attachment.id.slice(0, 8)}-${attachment.name}` });
      }
    }
    await archive.finalize();
  };
  app.get('/api/projects/:id/export', async (req, res) => { const project = await getProject(req); await exportProjects(req, res, [project], `${safeFilename(project.title).slice(0, 100)}.zip`); });
  app.get('/api/projects/:id/export.pdf', async (req, res) => {
    const project = await getProject(req);
    const activities = (await store.all('SELECT * FROM activities WHERE project_id=? ORDER BY created_at DESC,id DESC', [project.id])).map(activityView);
    const imageRows = await store.all("SELECT * FROM attachments WHERE project_id=? AND mime_type LIKE 'image/%' ORDER BY created_at DESC,id DESC", [project.id]);
    const imageFiles = [];
    for (const file of imageRows) {
      try {
        const bytes = await storage.readBytes(file.storage_name);
        const image = await pdfImageFromBytes(bytes, file.name, file.mime_type);
        if (image) imageFiles.push({ name: file.name, image });
      } catch {}
    }
    res.attachment(`${safeFilename(project.title).slice(0, 100)}.pdf`);
    res.type('application/pdf');
    res.send(projectPdf(project, activities, imageFiles));
  });
  app.get('/api/export', async (req, res) => exportProjects(req, res, await visibleProjects(), `suivi-projets-${now().slice(0, 10)}.zip`));
  app.get('/api/activity', async (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
    let rows;
    rows = projectId ? await store.all('SELECT * FROM activities WHERE project_id=? ORDER BY created_at DESC,id DESC', [projectId]) : await store.all('SELECT * FROM activities ORDER BY created_at DESC,id DESC');
    res.json({ activities: rows.map(activityView) });
  });
  app.get('/api/users', async (req, res) => {
    const users = (await store.all('SELECT * FROM users ORDER BY created_at DESC,id DESC')).map(userView);
    res.json({ users });
  });
  app.patch('/api/users/:id', accountAdminOnly, async (req, res) => {
    const previous = userView(await store.get('SELECT * FROM users WHERE id=?', [req.params.id]));
    if (!previous) throw fail(404, 'Compte introuvable.');
    const body = req.body || {};
    if (body.role === undefined && body.status === undefined) throw fail(400, 'Indiquez un rôle ou un état.');
    const role = body.role ?? normalizedRole(previous.role);
    const status = body.status ?? previous.status;
    if (!ROLES.includes(role) || !STATES.includes(status)) throw fail(400, 'Rôle ou état invalide.');
    if (status === 'pending' && previous.status !== 'pending') throw fail(400, 'Un compte traité ne peut pas revenir en attente.');
    if (req.user.id === previous.id && status !== 'active') throw fail(400, 'Vous ne pouvez pas désactiver votre propre compte.');
    const changes = ['role', 'status'].filter(field => previous[field] !== ({ role, status })[field]).map(field => ({ field, before: previous[field], after: ({ role, status })[field] }));
    if (changes.length) await transaction(async (tx) => {
      await tx.run('UPDATE users SET role=?,status=? WHERE id=?', [role, status, previous.id]);
      if (status !== 'active' || role !== previous.role) await tx.run('DELETE FROM sessions WHERE user_id=?', [previous.id]);
      await audit(tx, req.user, `${previous.status === 'pending' && status === 'active' ? 'Inscription approuvée' : previous.status === 'pending' && status === 'rejected' ? 'Inscription refusée' : 'Compte modifié'} : ${previous.name}`, null, [{ field: 'account', before: previous.email, after: previous.email }, ...changes]);
    });
    if (changes.length) broadcast();
    res.json({ user: userView(await store.get('SELECT * FROM users WHERE id=?', [previous.id])) });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Route API introuvable.' }));
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, setHeaders: (res, filename) => { if (/service-worker|sw\.js|manifest/.test(filename)) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.get(/.*/, (req, res, next) => {
      if (req.path.includes('.')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error.status || 500;
    let message = error.message;
    if (error instanceof multer.MulterError) { status = 400; message = error.code === 'LIMIT_FILE_SIZE' ? 'Chaque fichier doit faire 4,5 Mo maximum sur Vercel (20 Mo en local).' : 'Ajoutez au maximum 10 fichiers à la fois, dans le champ « files ».'; }
    if (error.type === 'entity.parse.failed') { status = 400; message = 'Le corps JSON est invalide.'; }
    if (status >= 500) { console.error(error); message = 'Une erreur interne est survenue. Réessayez.'; }
    res.status(status).json({ error: message });
  });
  app.locals.store = store;
  app.locals.db = db;
  app.locals.storage = storage;
  app.locals.close = () => store.close();
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3001;
  createApp().then((app) => {
    const server = app.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Suivi API (${app.locals.store.mode}/${app.locals.storage.mode}) : http://localhost:${port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { app.locals.close(); process.exit(0); }));
  }).catch((e) => { console.error(e); process.exit(1); });
}
