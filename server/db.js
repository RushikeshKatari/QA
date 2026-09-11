import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;
let isNativePg = false;

export async function getDb() {
  if (dbInstance) return dbInstance;

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    try {
      console.log('Connecting to native PostgreSQL via DATABASE_URL...');
      const pool = new pg.Pool({ connectionString: databaseUrl });
      await pool.query('SELECT 1');
      console.log('Connected to PostgreSQL successfully.');
      isNativePg = true;
      dbInstance = {
        query: async (text, params) => {
          const res = await pool.query(text, params);
          return { rows: res.rows, rowCount: res.rowCount };
        },
        pool
      };
      await initSchema(dbInstance);
      return dbInstance;
    } catch (err) {
      console.warn('Native PostgreSQL connection failed, falling back to embedded PGlite:', err.message);
    }
  }

  // Use embedded PGlite (Real PostgreSQL engine in Node.js)
  const dataDir = path.join(__dirname, '..', 'data', 'pgdata');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  } else {
    // Remove stale lock files from any prior ungraceful terminations
    const pidFile = path.join(dataDir, 'postmaster.pid');
    const lockFile = path.join(dataDir, '.s.PGSQL.5432.lock.out');
    try {
      if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    } catch (e) {
      // Ignore cleanup error
    }
  }

  console.log(`Initializing embedded PostgreSQL (PGlite) with persistence at ${dataDir}...`);
  let pglite;
  try {
    pglite = new PGlite(dataDir);
    await pglite.waitReady;
  } catch (initErr) {
    console.warn('Embedded PostgreSQL recovery triggered:', initErr.message);
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
      fs.mkdirSync(dataDir, { recursive: true });
    } catch (rmErr) {}
    pglite = new PGlite(dataDir);
    await pglite.waitReady;
  }
  console.log('Embedded PostgreSQL engine ready.');

  dbInstance = {
    query: async (text, params) => {
      const res = await pglite.query(text, params);
      return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
    },
    pglite
  };

  await initSchema(dbInstance);
  return dbInstance;
}

export async function query(text, params = []) {
  const db = await getDb();
  return db.query(text, params);
}

async function initSchema(db) {
  console.log('Ensuring PostgreSQL tables and indexes exist...');
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      question_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      original_text TEXT,
      display_question TEXT,
      canonical_question TEXT,
      question_hash VARCHAR(64),
      submission_id INTEGER,
      answered_by INTEGER,
      options JSONB NOT NULL DEFAULT '[]'::jsonb,
      correct_answer TEXT DEFAULT NULL,
      answer_status VARCHAR(20) DEFAULT 'pending',
      times_seen INTEGER DEFAULT 1,
      source VARCHAR(50) DEFAULT 'public_submission',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      answered_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
    );
  `);

  try {
    await db.query(`ALTER TABLE questions ALTER COLUMN correct_answer TYPE TEXT;`);
  } catch (e) {
    // Column may already be TEXT or not supported
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      source VARCHAR(50),
      submitted_by INTEGER,
      ip_address VARCHAR(50),
      submission_type VARCHAR(50),
      file_name VARCHAR(255),
      total_detected INTEGER DEFAULT 0,
      new_count INTEGER DEFAULT 0,
      existing_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_questions_normalized ON questions(normalized_text);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(answer_status);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_questions_created ON questions(created_at);`);

  // Additive migration for databases created by earlier versions. Legacy columns
  // remain as compatibility aliases for the unchanged frontend.
  for (const statement of [
    'ALTER TABLE questions ADD COLUMN IF NOT EXISTS original_text TEXT',
    'ALTER TABLE questions ADD COLUMN IF NOT EXISTS display_question TEXT',
    'ALTER TABLE questions ADD COLUMN IF NOT EXISTS canonical_question TEXT',
    'ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_hash VARCHAR(64)',
    'ALTER TABLE questions ADD COLUMN IF NOT EXISTS submission_id INTEGER',
    'ALTER TABLE questions ADD COLUMN IF NOT EXISTS answered_by INTEGER',
    'ALTER TABLE submissions ADD COLUMN IF NOT EXISTS source VARCHAR(50)',
    'ALTER TABLE submissions ADD COLUMN IF NOT EXISTS submitted_by INTEGER'
  ]) await db.query(statement);

  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, role VARCHAR(20) NOT NULL CHECK (role IN ('admin','user')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query('ALTER TABLE admins ADD COLUMN IF NOT EXISTS user_id INTEGER');
  // FKs are deliberately added only when absent; old databases retain their IDs.
  try { await db.query('ALTER TABLE questions ADD CONSTRAINT questions_submission_fk FOREIGN KEY (submission_id) REFERENCES submissions(id)'); } catch (_) {}
  try { await db.query('ALTER TABLE questions ADD CONSTRAINT questions_answered_by_fk FOREIGN KEY (answered_by) REFERENCES users(id)'); } catch (_) {}
  try { await db.query('ALTER TABLE submissions ADD CONSTRAINT submissions_submitted_by_fk FOREIGN KEY (submitted_by) REFERENCES users(id)'); } catch (_) {}
  await db.query('CREATE INDEX IF NOT EXISTS idx_questions_canonical ON questions(canonical_question)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_questions_submission ON questions(submission_id)');
  // Partial uniqueness immediately protects all newly-ingested records, while the
  // explicit legacy cleanup migration safely handles pre-existing duplicate rows.
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_questions_hash ON questions(question_hash) WHERE question_hash IS NOT NULL');
  try { await db.query("ALTER TABLE questions ADD CONSTRAINT questions_status_check CHECK (answer_status IN ('pending', 'answered'))"); } catch (_) {}

  console.log('PostgreSQL schema initialized.');
}
