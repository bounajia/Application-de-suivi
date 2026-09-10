import { createApp } from '../server/index.mjs';

let appPromise = null;
function getApp() {
  if (!appPromise) {
    // Sur Vercel : DATA_DIR local éphémère (/tmp), DB via DATABASE_URL, fichiers via BLOB_READ_WRITE_TOKEN
    appPromise = createApp({
      dataDir: process.env.DATA_DIR || '/tmp/suivi-data',
      staticDir: process.cwd() + '/dist',
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
