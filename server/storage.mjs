import path from 'node:path';
import { mkdirSync, existsSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';

export function isBlobMode() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function createStorage({ dataDir }) {
  const uploadDir = path.join(path.resolve(dataDir), 'uploads');
  if (!isBlobMode()) mkdirSync(uploadDir, { recursive: true });

  const localPath = (storageName) => path.join(uploadDir, storageName);

  return {
    mode: isBlobMode() ? 'blob' : 'local',
    uploadDir,
    localPath,

    async saveBuffer({ buffer, pathname, contentType }) {
      if (isBlobMode()) {
        const { put } = await import('@vercel/blob');
        const blob = await put(pathname, buffer, { access: 'public', contentType, addRandomSuffix: true });
        return blob.url;
      }
      const name = pathname.split('/').pop();
      writeFileSync(localPath(name), buffer);
      return name;
    },

    async saveMulterFile(file) {
      // file: multer memory (buffer) ou disk (path)
      const data = file.buffer || (file.path ? readFileSync(file.path) : null);
      if (!data) throw new Error('Fichier vide.');
      if (isBlobMode()) {
        const { put } = await import('@vercel/blob');
        const safe = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname}`;
        const blob = await put(`uploads/${safe}`, data, { access: 'public', contentType: file.mimetype, addRandomSuffix: true });
        if (file.path) { try { unlinkSync(file.path); } catch {} }
        return blob.url;
      }
      // mode local + multer disk: le fichier est déjà sur disque
      if (file.path && file.filename) return file.filename;
      const name = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      writeFileSync(localPath(name), data);
      return name;
    },

    async readBytes(storageName) {
      if (isBlobMode() && /^https?:\/\//.test(storageName)) {
        const res = await fetch(storageName);
        if (!res.ok) throw new Error('Fichier distant indisponible.');
        return Buffer.from(await res.arrayBuffer());
      }
      return readFileSync(localPath(storageName));
    },

    async exists(storageName) {
      if (isBlobMode() && /^https?:\/\//.test(storageName)) {
        try {
          const res = await fetch(storageName, { method: 'HEAD' });
          return res.ok;
        } catch { return false; }
      }
      return existsSync(localPath(storageName));
    },

    async remove(storageName) {
      if (isBlobMode() && /^https?:\/\//.test(storageName)) {
        try {
          const { del } = await import('@vercel/blob');
          await del(storageName);
        } catch {}
        return;
      }
      try { unlinkSync(localPath(storageName)); } catch {}
    },

    async sendTo(res, storageName, { filename, mimeType }) {
      if (isBlobMode() && /^https?:\/\//.test(storageName)) {
        const data = await this.readBytes(storageName);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.download ? res.download : null;
        res.setHeader('Content-Disposition', `attachment; filename="${filename.replaceAll('"', '')}"`);
        res.send(data);
        return;
      }
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      await new Promise((resolve, reject) => {
        res.download(localPath(storageName), filename, (err) => err ? reject(err) : resolve());
      });
    },
  };
}
