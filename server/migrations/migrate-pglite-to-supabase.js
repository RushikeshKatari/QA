import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const localPath = path.join(projectRoot, 'data/pgdata');
const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
const args = new Set(process.argv.slice(2));
const confirm = args.has('--confirm');
const allowExisting = args.has('--allow-existing');

const tables = {
  users: ['id', 'role', 'created_at'],
  admins: ['id', 'username', 'password_hash', 'created_at', 'user_id'],
  submissions: ['id', 'source', 'submitted_by', 'ip_address', 'submission_type', 'file_name', 'total_detected', 'new_count', 'existing_count', 'created_at'],
  questions: ['id', 'question_text', 'normalized_text', 'original_text', 'display_question', 'canonical_question', 'question_hash', 'submission_id', 'answered_by', 'options', 'correct_answer', 'answer_status', 'times_seen', 'source', 'created_at', 'updated_at', 'answered_at'],
  question_merge_audit: ['id', 'kept_question_id', 'absorbed_question_id', 'absorbed_record', 'merged_at']
};
const order = Object.keys(tables);

function usage() {
  console.log('Dry run: node server/migrations/migrate-pglite-to-supabase.js');
  console.log('Migrate: node server/migrations/migrate-pglite-to-supabase.js --confirm');
  console.log('Allow existing target rows only with: --confirm --allow-existing');
}

function safeHost(value) {
  try { return new URL(value).host; } catch (_) { return '(configured)'; }
}

function safeError(error) {
  return String(error?.message || error).replaceAll(supabaseUrl || '', '[SUPABASE_DATABASE_URL]');
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, role VARCHAR(20) NOT NULL CHECK (role IN ('admin','user')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, user_id INTEGER
);
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY, source VARCHAR(50), submitted_by INTEGER, ip_address VARCHAR(50),
  submission_type VARCHAR(50), file_name VARCHAR(255), total_detected INTEGER DEFAULT 0,
  new_count INTEGER DEFAULT 0, existing_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY, question_text TEXT NOT NULL, normalized_text TEXT NOT NULL,
  original_text TEXT, display_question TEXT, canonical_question TEXT, question_hash VARCHAR(64),
  submission_id INTEGER, answered_by INTEGER, options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer TEXT DEFAULT NULL, answer_status VARCHAR(20) DEFAULT 'pending',
  times_seen INTEGER DEFAULT 1, source VARCHAR(50) DEFAULT 'public_submission',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  answered_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS question_merge_audit (
  id SERIAL PRIMARY KEY, kept_question_id INTEGER NOT NULL, absorbed_question_id INTEGER NOT NULL,
  absorbed_record JSONB NOT NULL, merged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE admins ADD COLUMN IF NOT EXISTS user_id INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS original_text TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS display_question TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS canonical_question TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_hash VARCHAR(64);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS submission_id INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS answered_by INTEGER;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS source VARCHAR(50);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS submitted_by INTEGER;
CREATE INDEX IF NOT EXISTS idx_questions_normalized ON questions(normalized_text);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(answer_status);
CREATE INDEX IF NOT EXISTS idx_questions_created ON questions(created_at);
CREATE INDEX IF NOT EXISTS idx_questions_canonical ON questions(canonical_question);
CREATE INDEX IF NOT EXISTS idx_questions_submission ON questions(submission_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_questions_hash ON questions(question_hash) WHERE question_hash IS NOT NULL;
DO $$ BEGIN
  ALTER TABLE questions ADD CONSTRAINT questions_submission_fk FOREIGN KEY (submission_id) REFERENCES submissions(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE questions ADD CONSTRAINT questions_answered_by_fk FOREIGN KEY (answered_by) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE submissions ADD CONSTRAINT submissions_submitted_by_fk FOREIGN KEY (submitted_by) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE questions ADD CONSTRAINT questions_status_check CHECK (answer_status IN ('pending', 'answered'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

async function localRows(db, table) {
  try { return (await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows; }
  catch (error) { if (/does not exist|relation .* not found/i.test(error.message)) return []; throw error; }
}

async function main() {
  if (!fs.existsSync(localPath)) throw new Error(`Local PGlite directory not found: ${localPath}`);
  if (!supabaseUrl) throw new Error('SUPABASE_DATABASE_URL is required. It was not printed or logged.');
  if (supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1')) throw new Error('SUPABASE_DATABASE_URL must point to Supabase, not localhost.');

  const local = new PGlite(localPath);
  await local.waitReady;
  const source = {};
  for (const table of order) source[table] = await localRows(local, table);

  const pool = new pg.Pool({ connectionString: supabaseUrl });
  try {
    await pool.query('SELECT 1');
    console.log(`Source: local PGlite (${localPath})`);
    console.log(`Target: Supabase PostgreSQL (${safeHost(supabaseUrl)})`);
    console.log('Source row counts:');
    for (const table of order) console.log(`  ${table}: ${source[table].length}`);

    await pool.query(schema);
    const target = {};
    for (const table of order) target[table] = Number((await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count);
    console.log('Target row counts before migration:');
    for (const table of order) console.log(`  ${table}: ${target[table]}`);
    if (!confirm) { console.log('\nDry run only. No rows were written. Re-run with --confirm to migrate.'); return; }
    if (!allowExisting && Object.values(target).some(count => count > 0)) throw new Error('Target contains existing rows. Nothing was written; use --allow-existing only after explicitly confirming the target contents.');

    await pool.query('BEGIN');
    if (allowExisting) for (const table of [...order].reverse()) await pool.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
    for (const table of order) {
      for (const row of source[table]) {
        const columns = tables[table];
        const values = columns.map(column => row[column] ?? null);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        await pool.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, values);
      }
    }
    for (const table of order) {
      await pool.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), EXISTS (SELECT 1 FROM ${table}))`, [table]);
    }
    await pool.query('COMMIT');

    console.log('Target row counts after migration:');
    for (const table of order) {
      const count = Number((await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count);
      console.log(`  ${table}: ${count} ${count === source[table].length ? 'OK' : 'MISMATCH'}`);
      if (count !== source[table].length) throw new Error(`Verification failed for ${table}`);
    }
    console.log('Migration completed and verified. Local PGlite was not modified.');
  } catch (error) {
    try { await pool.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    await pool.end();
    await local.close();
  }
}

main().catch(error => { console.error(`Migration stopped: ${safeError(error)}`); usage(); process.exitCode = 1; });
