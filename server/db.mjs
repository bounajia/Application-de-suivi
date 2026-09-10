import path from 'node:path';
import { mkdirSync } from 'node:fs';

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, location TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, commencement_order TEXT NOT NULL, progress DOUBLE PRECISION NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_members (project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY (project_id,user_id));
CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, original_name TEXT NOT NULL, storage_name TEXT NOT NULL, mime_type TEXT NOT NULL, size BIGINT NOT NULL, uploaded_by TEXT NOT NULL, uploaded_by_name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, project_id TEXT, project_title TEXT, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, changes TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS member_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS activity_project ON activities(project_id,created_at);
`;

const MYSQL_TABLES = [
  `CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, role VARCHAR(32) NOT NULL, status VARCHAR(32) NOT NULL, created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash VARCHAR(128) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, expires_at BIGINT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS projects (id VARCHAR(64) PRIMARY KEY, title VARCHAR(180) NOT NULL, description MEDIUMTEXT NOT NULL, location VARCHAR(255) NOT NULL, start_date VARCHAR(16) NOT NULL, end_date VARCHAR(16) NOT NULL, commencement_order VARCHAR(255) NOT NULL, progress DOUBLE NOT NULL, status VARCHAR(32) NOT NULL, created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL, updated_by VARCHAR(120) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS project_members (project_id VARCHAR(64) NOT NULL, user_id VARCHAR(64) NOT NULL, PRIMARY KEY (project_id,user_id), FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS attachments (id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL, name VARCHAR(180) NOT NULL, original_name VARCHAR(180) NOT NULL, storage_name TEXT NOT NULL, mime_type VARCHAR(128) NOT NULL, size BIGINT NOT NULL, uploaded_by VARCHAR(64) NOT NULL, uploaded_by_name VARCHAR(120) NOT NULL, created_at VARCHAR(32) NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS activities (id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NULL, project_title TEXT NULL, actor_id VARCHAR(64) NOT NULL, actor_name VARCHAR(120) NOT NULL, action VARCHAR(255) NOT NULL, changes MEDIUMTEXT NOT NULL, created_at VARCHAR(32) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];
const MYSQL_INDEXES = [
  `CREATE INDEX sessions_expiry ON sessions(expires_at)`,
  `CREATE INDEX member_user ON project_members(user_id)`,
  `CREATE INDEX activity_project ON activities(project_id,created_at)`,
];

const SQLITE_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, location TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, commencement_order TEXT NOT NULL, progress REAL NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_members (project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY (project_id,user_id));
CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, original_name TEXT NOT NULL, storage_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, uploaded_by TEXT NOT NULL, uploaded_by_name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, project_id TEXT, project_title TEXT, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, changes TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS member_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS activity_project ON activities(project_id,created_at);
`;

const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

// Normalise ORDER BY rowid (SQLite) pour Postgres/MySQL qui n'ont pas rowid.
const normalizeOrder = (sql) => sql.replace(/,\s*rowid\s+DESC/gi, ', id DESC').replace(/\browid\b/gi, 'id');

const mysqlUrl = () => process.env.MYSQL_URL || (process.env.DATABASE_URL?.startsWith('mysql://') || process.env.DATABASE_URL?.startsWith('mysql2://') ? process.env.DATABASE_URL : null);

export async function createStore({ dataDir } = {}) {
  const mysqlConn = mysqlUrl();
  if (mysqlConn) {
    const { default: mysql } = await import('mysql2/promise');
    const pool = mysql.createPool({ uri: mysqlConn, waitForConnections: true, connectionLimit: 5, charset: 'utf8mb4_unicode_ci', ssl: process.env.MYSQL_SSL === 'disable' ? undefined : { rejectUnauthorized: false } });
    for (const sql of MYSQL_TABLES) await pool.query(sql);
    for (const sql of MYSQL_INDEXES) {
      try { await pool.query(sql); } catch (e) { if (e?.code !== 'ER_DUP_KEYNAME') throw e; }
    }
    const norm = (sql) => normalizeOrder(sql);
    return {
      mode: 'mysql',
      raw: null,
      async get(sql, params = []) {
        const [rows] = await pool.query(norm(sql), params);
        return rows[0] || null;
      },
      async all(sql, params = []) {
        const [rows] = await pool.query(norm(sql), params);
        return rows;
      },
      async run(sql, params = []) {
        await pool.query(norm(sql), params);
        return {};
      },
      async exec(sql) {
        await pool.query(sql);
      },
      async transaction(fn) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          const tx = {
            get: async (sql, params = []) => { const [rows] = await conn.query(norm(sql), params); return rows[0] || null; },
            all: async (sql, params = []) => { const [rows] = await conn.query(norm(sql), params); return rows; },
            run: async (sql, params = []) => { await conn.query(norm(sql), params); return {}; },
          };
          const result = await fn(tx);
          await conn.commit();
          return result;
        } catch (e) {
          try { await conn.rollback(); } catch {}
          throw e;
        } finally {
          conn.release();
        }
      },
      async close() {
        await pool.end();
      },
    };
  }

  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
      max: 5,
    });
    await pool.query(PG_SCHEMA);
    const query = (sql, params = []) => pool.query(toPg(normalizeOrder(sql)), params).then((r) => r);
    return {
      mode: 'pg',
      raw: null,
      async get(sql, params = []) {
        const r = await query(sql, params);
        return r.rows[0] || null;
      },
      async all(sql, params = []) {
        const r = await query(sql, params);
        return r.rows;
      },
      async run(sql, params = []) {
        await query(sql, params);
        return {};
      },
      async exec(sql) {
        await pool.query(sql);
      },
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const tx = {
            get: async (sql, params = []) => (await client.query(toPg(normalizeOrder(sql)), params)).rows[0] || null,
            all: async (sql, params = []) => (await client.query(toPg(normalizeOrder(sql)), params)).rows,
            run: async (sql, params = []) => { await client.query(toPg(normalizeOrder(sql)), params); return {}; },
          };
          const result = await fn(tx);
          await client.query('COMMIT');
          return result;
        } catch (e) {
          try { await client.query('ROLLBACK'); } catch {}
          throw e;
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      },
    };
  }

  const { DatabaseSync } = await import('node:sqlite');
  const resolved = path.resolve(dataDir);
  mkdirSync(resolved, { recursive: true });
  const db = new DatabaseSync(path.join(resolved, 'suivi.sqlite'));
  db.exec(SQLITE_SCHEMA);
  return {
    mode: 'sqlite',
    raw: db,
    async get(sql, params = []) {
      return db.prepare(sql).get(...params) || null;
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async run(sql, params = []) {
      db.prepare(sql).run(...params);
      return {};
    },
    async exec(sql) {
      db.exec(sql);
    },
    async transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      const tx = {
        get: async (sql, params = []) => db.prepare(sql).get(...params) || null,
        all: async (sql, params = []) => db.prepare(sql).all(...params),
        run: async (sql, params = []) => { db.prepare(sql).run(...params); return {}; },
      };
      try {
        const result = await fn(tx);
        db.exec('COMMIT');
        return result;
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch {}
        throw e;
      }
    },
    async close() {
      db.close();
    },
  };
}

export function pgCount(row) {
  if (!row) return 0;
  const v = row.count ?? row.COUNT ?? 0;
  return typeof v === 'string' ? Number.parseInt(v, 10) : Number(v);
}
