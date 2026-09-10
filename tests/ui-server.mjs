import { createApp } from '../server/index.mjs';

const app = await createApp({ dataDir: process.env.SUIVI_E2E_DATA_DIR });
const server = app.listen(3002, '127.0.0.1', () => process.send?.({ ready: true }));
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  server.close(() => { app.locals.close(); process.exit(0); });
  server.closeIdleConnections();
}
process.on('message', (message) => { if (message?.shutdown) stop(); });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('error', (error) => { console.error(error); app.locals.close(); process.exit(1); });
