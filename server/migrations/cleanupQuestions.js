import { getDb } from '../db.js';
import { prepareQuestion } from '../parser.js';
import { canonicalHash } from '../questionPipeline.js';

const apply = process.argv.includes('--apply');
const db = await getDb();
const rows = (await db.query('SELECT * FROM questions ORDER BY id')).rows;
const artifactRepairs = [];
for (const row of rows) {
  const current = prepareQuestion({ original_text: row.original_text || row.question_text, question_text: row.question_text, options: row.options }, 'text');
  if (current.valid || !/^(?:timer|time|score|page)\s*:/i.test(String(row.question_text || ''))) continue;
  const options = Array.isArray(row.options) ? row.options : [];
  const candidateIndex = options.findIndex(option => /[?؟]$/.test(String(option?.text || '').trim()) && /[A-Za-z]{3,}/.test(String(option?.text || '')));
  if (candidateIndex < 0) {
    artifactRepairs.push({ id: row.id, action: 'rejected', reason: 'UI artifact has no recoverable question text' });
    continue;
  }
  const candidate = String(options[candidateIndex].text).trim();
  const repairedOptions = options.filter((_, index) => index !== candidateIndex);
  artifactRepairs.push({ id: row.id, action: 'promote_option_to_question', question: candidate });
  if (apply) {
    const repaired = prepareQuestion({ original_text: candidate, question_text: candidate, options: repairedOptions }, 'text');
    await db.query(`UPDATE questions SET original_text = $1, display_question = $2, canonical_question = $3,
      question_text = $2, normalized_text = $3, options = $4, question_hash = $5,
      updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
      [candidate, repaired.display_question, repaired.canonical_question, JSON.stringify(repaired.options), canonicalHash(repaired.canonical_question), row.id]);
    row.original_text = candidate; row.question_text = repaired.display_question; row.options = repaired.options;
  }
}
const groups = new Map();
for (const row of rows) {
  const prepared = prepareQuestion({ original_text: row.original_text || row.question_text, question_text: row.question_text, options: row.options }, 'text');
  if (!prepared.canonical_question) continue;
  const hash = canonicalHash(prepared.canonical_question);
  if (!groups.has(hash)) groups.set(hash, []);
  groups.get(hash).push({ row, prepared, hash });
}
const duplicates = [...groups.values()].filter(group => group.length > 1);
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', totalRows: rows.length, artifactRepairs, duplicateGroups: duplicates.map(group => ({ canonical_question: group[0].prepared.canonical_question, ids: group.map(x => x.row.id), answeredIds: group.filter(x => x.row.answer_status === 'answered').map(x => x.row.id) })) }, null, 2));
if (!apply) process.exit(0);

await db.query(`CREATE TABLE IF NOT EXISTS question_merge_audit (
  id SERIAL PRIMARY KEY, kept_question_id INTEGER NOT NULL, absorbed_question_id INTEGER NOT NULL,
  absorbed_record JSONB NOT NULL, merged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
for (const group of groups.values()) {
  group.sort((a, b) => (b.row.answer_status === 'answered') - (a.row.answer_status === 'answered') || Number(b.row.times_seen || 0) - Number(a.row.times_seen || 0) || a.row.id - b.row.id);
  const keeper = group[0];
  const absorbed = group.slice(1);
  const timesSeen = group.reduce((sum, item) => sum + Number(item.row.times_seen || 1), 0);
  for (const item of absorbed) await db.query('INSERT INTO question_merge_audit (kept_question_id, absorbed_question_id, absorbed_record) VALUES ($1, $2, $3)', [keeper.row.id, item.row.id, JSON.stringify(item.row)]);
  await db.query(`UPDATE questions SET original_text = COALESCE(original_text, $1), display_question = $2, canonical_question = $3, question_hash = $4, question_text = $2, normalized_text = $3, times_seen = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6`, [keeper.prepared.original_text, keeper.prepared.display_question, keeper.prepared.canonical_question, keeper.hash, timesSeen, keeper.row.id]);
  for (const item of absorbed) await db.query('DELETE FROM questions WHERE id = $1', [item.row.id]);
}
console.log('Cleanup applied. Absorbed rows are retained in question_merge_audit.');
