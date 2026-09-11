import assert from 'node:assert';
import { getDb, query } from '../db.js';
import { canonicalHash, ingestSubmission } from '../questionPipeline.js';
import { requireAdmin } from '../middleware/security.js';

await getDb();
await query("DELETE FROM questions WHERE source = 'test'");
const canonical = 'what is the test capital of concurrency land';
const hash = canonicalHash(canonical);
await query('DELETE FROM questions WHERE question_hash = $1', [hash]);

// Concurrent, differently formatted submissions must converge on one row.
await Promise.all([
  ingestSubmission({ content: '1. What is the test capital of Concurrency Land?', source: 'test' }),
  ingestSubmission({ content: 'Q1: WHAT IS THE TEST CAPITAL OF CONCURRENCY LAND ?', source: 'test' }),
  ingestSubmission({ content: 'Question: What is the test capital of Concurrency Land?', format: 'pdf', source: 'test' })
]);
const rows = await query('SELECT times_seen FROM questions WHERE question_hash = $1', [hash]);
assert.strictEqual(rows.rows.length, 1, 'hash uniqueness must prevent concurrent duplicate rows');
assert.strictEqual(Number(rows.rows[0].times_seen), 3);

const different = await ingestSubmission({ content: 'What is a different test question altogether?', source: 'test' });
assert.strictEqual(different.counts.new, 1);

// Semantic duplicate submissions should resolve to the existing row even when
// a small typo/character change prevents an exact canonical hash match.
const semanticA = await ingestSubmission({ content: 'Which fictional planet is known as the Azure Planet?', source: 'test' });
const semanticB = await ingestSubmission({ content: 'Which fictional planet is known as the Azure Plnaet?', source: 'test' });
assert.strictEqual(semanticA.counts.new, 1);
assert.strictEqual(semanticB.counts.existing, 1);

// Admin-imported answered rows may have no question_hash; submission must
// still resolve to that answered row instead of creating a pending duplicate.
await query(`INSERT INTO questions (question_text, normalized_text, options, correct_answer, answer_status, source)
  VALUES ($1, $2, '[]'::jsonb, 'A', 'answered', 'test')`, [
  'What is the hashless answered test question?',
  'what is the hashless answered test question'
]);
const hashlessDuplicate = await ingestSubmission({ content: '1\\) What is the hashless answered test question?', source: 'test' });
assert.strictEqual(hashlessDuplicate.counts.existing, 1);
await assert.rejects(() => ingestSubmission({ content: 'timer:00:03', source: 'test' }), /Could not detect any questions/);

let response;
requireAdmin({ headers: {} }, { status(code) { response = code; return this; }, json() {} }, () => assert.fail('unauthorized request advanced'));
assert.strictEqual(response, 401, 'admin mutation middleware rejects unauthenticated access');

await query('DELETE FROM questions WHERE question_hash = $1 OR source = $2', [hash, 'test']);
console.log('✓ Concurrent hash upsert, different question, malformed input, and admin authorization verified');
