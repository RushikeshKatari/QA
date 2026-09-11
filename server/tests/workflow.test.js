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
await assert.rejects(() => ingestSubmission({ content: 'timer:00:03', source: 'test' }), /Could not detect any questions/);

let response;
requireAdmin({ headers: {} }, { status(code) { response = code; return this; }, json() {} }, () => assert.fail('unauthorized request advanced'));
assert.strictEqual(response, 401, 'admin mutation middleware rejects unauthenticated access');

await query('DELETE FROM questions WHERE question_hash = $1 OR source = $2', [hash, 'test']);
console.log('✓ Concurrent hash upsert, different question, malformed input, and admin authorization verified');
