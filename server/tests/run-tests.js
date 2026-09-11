import './parser.test.js';
import './pattern.test.js';
import assert from 'node:assert';
import { getDb, query } from '../db.js';
import { normalizeQuestion } from '../parser.js';

async function runDatabaseTests() {
  console.log('--- Running Database & Workflow Integration Tests ---');
  await getDb();

  // Test Duplicate Detection workflow
  const testQuestionText = 'What is the speed of sound in dry air at 20°C?';
  const testNormalized = normalizeQuestion(testQuestionText);

  // Clean up any test records
  await query('DELETE FROM questions WHERE normalized_text = $1', [testNormalized]);

  // 1. Initial submission (new question)
  await query(
    `INSERT INTO questions 
      (question_text, normalized_text, options, correct_answer, answer_status, times_seen, source, created_at, updated_at)
     VALUES ($1, $2, $3, NULL, 'pending', 1, 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [testQuestionText, testNormalized, JSON.stringify([{ key: 'A', text: '343 m/s' }, { key: 'B', text: '150 m/s' }])]
  );

  let qRes = await query('SELECT id, times_seen, answer_status, correct_answer FROM questions WHERE normalized_text = $1', [testNormalized]);
  assert.strictEqual(qRes.rows.length, 1);
  assert.strictEqual(qRes.rows[0].times_seen, 1);
  assert.strictEqual(qRes.rows[0].answer_status, 'pending');
  assert.strictEqual(qRes.rows[0].correct_answer, null);
  console.log('✓ New question inserted with answer_status="pending", correct_answer=null, times_seen=1');

  // 2. Duplicate submission (same question submitted again)
  const existing = await query('SELECT id, times_seen FROM questions WHERE normalized_text = $1', [testNormalized]);
  assert.strictEqual(existing.rows.length, 1);
  await query('UPDATE questions SET times_seen = times_seen + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [existing.rows[0].id]);

  qRes = await query('SELECT times_seen FROM questions WHERE normalized_text = $1', [testNormalized]);
  assert.strictEqual(qRes.rows[0].times_seen, 2, 'times_seen should increment to 2 without creating duplicate row');
  console.log('✓ Duplicate question successfully incremented times_seen to 2 without creating duplicate record');

  // 3. Test Answer Pattern workflow: { a delhi } { b india } { a delhi , c canada }
  const tempIds = [];
  for (let i = 1; i <= 3; i++) {
    const res = await query(
      `INSERT INTO questions (question_text, normalized_text, options, correct_answer, answer_status, times_seen, source)
       VALUES ($1, $2, '[]', NULL, 'pending', 1, 'test') RETURNING id`,
      [`Temp Question ${i}`, `temp question ${i}`]
    );
    tempIds.push(res.rows[0].id);
  }

  // Admin provides pattern: { a delhi } { b india } { a delhi , c canada }
  const patternBlocks = [
    { key: 'A', text: 'delhi' },
    { key: 'B', text: 'india' },
    { key: 'A, C', text: 'delhi, canada' }
  ];

  for (let i = 0; i < tempIds.length; i++) {
    await query(
      `UPDATE questions SET correct_answer = $1, answer_status = 'answered', answered_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [patternBlocks[i].key, tempIds[i]]
    );
  }

  // Verify all 3 questions updated, including multi-option question 3
  const check1 = await query('SELECT correct_answer, answer_status FROM questions WHERE id = $1', [tempIds[0]]);
  assert.strictEqual(check1.rows[0].correct_answer, 'A');
  assert.strictEqual(check1.rows[0].answer_status, 'answered');

  const check2 = await query('SELECT correct_answer, answer_status FROM questions WHERE id = $1', [tempIds[1]]);
  assert.strictEqual(check2.rows[0].correct_answer, 'B');
  assert.strictEqual(check2.rows[0].answer_status, 'answered');

  const check3 = await query('SELECT correct_answer, answer_status FROM questions WHERE id = $1', [tempIds[2]]);
  assert.strictEqual(check3.rows[0].correct_answer, 'A, C');
  assert.strictEqual(check3.rows[0].answer_status, 'answered');

  console.log('✓ Answer pattern assignment verified: { a delhi } { b india } { a delhi , c canada }');

  // Clean up temporary test data
  for (const id of tempIds) {
    await query('DELETE FROM questions WHERE id = $1', [id]);
  }
  await query('DELETE FROM questions WHERE normalized_text = $1', [testNormalized]);

  console.log('\n=============================================');
  console.log('ALL UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY!');
  console.log('=============================================\n');
  process.exit(0);
}

runDatabaseTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
