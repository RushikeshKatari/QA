import assert from 'node:assert';
import { parseAnswerPattern } from '../parser.js';
import { getDb, query } from '../db.js';

console.log('--- Running Answer Pattern & Multi-Option Tests ---');

// 1. Test parsing pattern string
{
  const inputPattern = '{ a delhi } { b india  } { a delhi , c canada }';
  const parsed = parseAnswerPattern(inputPattern);

  assert.strictEqual(parsed.length, 3, 'Should parse exactly 3 answer blocks');

  // Block 1
  assert.strictEqual(parsed[0].answerKey, 'A');
  assert.strictEqual(parsed[0].answerText, 'delhi');
  assert.strictEqual(parsed[0].keys.length, 1);

  // Block 2
  assert.strictEqual(parsed[1].answerKey, 'B');
  assert.strictEqual(parsed[1].answerText, 'india');
  assert.strictEqual(parsed[1].keys.length, 1);

  // Block 3: Multiple Options!
  assert.strictEqual(parsed[2].answerKey, 'A, C');
  assert.strictEqual(parsed[2].answerText, 'delhi, canada');
  assert.deepStrictEqual(parsed[2].keys, ['A', 'C']);

  console.log('✓ parseAnswerPattern successfully parsed: { a delhi } { b india } { a delhi , c canada }');
}

// 2. Test multi-line pattern and variations
{
  const multiLine = `
  { a - Delhi }
  { b: India }
  { (a) Delhi , (c) Canada }
  `;
  const parsed = parseAnswerPattern(multiLine);
  assert.strictEqual(parsed.length, 3);
  assert.strictEqual(parsed[0].answerKey, 'A');
  assert.strictEqual(parsed[1].answerKey, 'B');
  assert.strictEqual(parsed[2].answerKey, 'A, C');
  console.log('✓ Multi-line and punctuation variations correctly parsed');
}

// 3. Database integration test with multi-option answer
async function testMultiOptionDatabase() {
  await getDb();

  // Create temporary question
  const res = await query(
    `INSERT INTO questions 
      (question_text, normalized_text, options, correct_answer, answer_status, times_seen, source)
     VALUES ($1, $2, $3, NULL, 'pending', 1, 'test_pattern') RETURNING id`,
    [
      'Select the major capital cities:',
      'select the major capital cities',
      JSON.stringify([
        { key: 'A', text: 'Delhi' },
        { key: 'B', text: 'Sydney' },
        { key: 'C', text: 'Ottawa' }
      ])
    ]
  );
  const qId = res.rows[0].id;

  // Assign multi-option pattern: { a delhi , c ottawa }
  const pattern = '{ a delhi , c ottawa }';
  const parsed = parseAnswerPattern(pattern);
  assert.strictEqual(parsed[0].answerKey, 'A, C');

  await query(
    `UPDATE questions 
     SET correct_answer = $1, answer_status = 'answered', answered_at = CURRENT_TIMESTAMP 
     WHERE id = $2`,
    [parsed[0].answerKey, qId]
  );

  // Verify stored answer in database
  const check = await query('SELECT correct_answer, answer_status FROM questions WHERE id = $1', [qId]);
  assert.strictEqual(check.rows[0].correct_answer, 'A, C');
  assert.strictEqual(check.rows[0].answer_status, 'answered');

  // Clean up
  await query('DELETE FROM questions WHERE id = $1', [qId]);

  console.log('✓ Database multi-option answer update verified with "A, C"');
}

testMultiOptionDatabase().then(() => {
  console.log('All Answer Pattern unit and integration tests passed!\n');
  process.exit(0);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
