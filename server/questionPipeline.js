import crypto from 'node:crypto';
import { areNearDuplicateQuestions, parseQuestions, prepareQuestion } from './parser.js';
import { query } from './db.js';

export const canonicalHash = canonical => crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');

/**
 * Central ingestion pipeline: parse -> extract -> clean -> canonicalize -> validate
 * -> PostgreSQL upsert. Neither route nor frontend may implement these steps.
 */
export async function ingestSubmission({ content, format = 'text', source = 'paste', fileName = null, submittedBy = null, ipAddress = null }) {
  const parsed = parseQuestions(content, format);
  if (!parsed.length) throw Object.assign(new Error('Could not detect any questions in this submission.'), { statusCode: 400 });
  if (parsed.length > 500) throw Object.assign(new Error('A submission may contain at most 500 questions.'), { statusCode: 400 });

  const submission = await query(
    `INSERT INTO submissions (source, submitted_by, ip_address, submission_type, file_name, total_detected, new_count, existing_count)
     VALUES ($1, $2, $3, $4, $5, 0, 0, 0) RETURNING id`,
    [source, submittedBy, ipAddress, source, fileName]
  );
  const submissionId = submission.rows[0].id;
  const counts = { detected: 0, new: 0, existing: 0, rejected: 0 };
  const results = [];

  for (const rawQuestion of parsed) {
    const question = prepareQuestion(rawQuestion, format);
    if (!question.valid) { counts.rejected++; continue; }
    counts.detected++;
    const hash = canonicalHash(question.canonical_question);
    // Search by canonical text before inserting. Some legacy/admin-imported
    // rows predate question_hash, so relying on the unique hash alone can
    // incorrectly create a second pending copy of an answered question.
    const nearby = (await query('SELECT id, question_text, normalized_text, options, answer_status, correct_answer FROM questions WHERE normalized_text IS NOT NULL')).rows
      .find(row => areNearDuplicateQuestions(question.canonical_question, row.normalized_text));
    const inserted = nearby ? { rows: [] } : await query(
      `INSERT INTO questions
       (submission_id, original_text, display_question, canonical_question, question_hash, question_text, normalized_text,
        options, correct_answer, answer_status, times_seen, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $3, $4, $6, NULL, $7, 1, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (question_hash) WHERE question_hash IS NOT NULL DO NOTHING
       RETURNING id`,
      [submissionId, question.original_text, question.display_question, question.canonical_question, hash,
        JSON.stringify(question.options), question.status, source]
    );
    if (inserted.rows.length) {
      counts.new++;
      results.push({ status: 'new', question: { question_text: question.display_question, options: question.options, answer_status: 'pending', correct_answer: null } });
      continue;
    }
    // The unique index makes this update safe even when duplicate requests race.
    let existing = await query('SELECT id, question_text, options, answer_status, correct_answer FROM questions WHERE question_hash = $1', [hash]);
    // Canonical hashing handles punctuation/case changes. For small additions
    // or omissions, fall back to the shared near-duplicate comparison.
    if (!existing.rows.length) {
      const candidates = await query('SELECT question_text, normalized_text, options, answer_status, correct_answer FROM questions WHERE normalized_text IS NOT NULL');
      const match = candidates.rows.find(row => areNearDuplicateQuestions(question.canonical_question, row.normalized_text));
      if (match) existing = { rows: [match] };
    }
    if (!existing.rows.length) {
      // A concurrent insert may have completed after the first conflict check.
      existing = await query('SELECT id, question_text, options, answer_status, correct_answer FROM questions WHERE question_hash = $1', [hash]);
    }
    if (!existing.rows.length) continue;
    const matchedQuestion = existing.rows[0];
    const matchedCanonical = matchedQuestion.normalized_text;
    let matchedOptions = matchedQuestion.options;
    if (typeof matchedOptions === 'string') { try { matchedOptions = JSON.parse(matchedOptions); } catch (_) { matchedOptions = []; } }
    // Repair legacy rows created before unlabeled-option parsing existed.
    if ((!Array.isArray(matchedOptions) || matchedOptions.length === 0) && question.options.length > 0) {
      await query('UPDATE questions SET question_text = $1, display_question = $1, options = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [question.display_question, JSON.stringify(question.options), matchedQuestion.id]);
      matchedQuestion.question_text = question.display_question;
      matchedOptions = question.options;
    }
    await query(
      matchedCanonical && matchedCanonical !== hash
        ? 'UPDATE questions SET times_seen = times_seen + 1, updated_at = CURRENT_TIMESTAMP WHERE normalized_text = $1'
        : 'UPDATE questions SET times_seen = times_seen + 1, updated_at = CURRENT_TIMESTAMP WHERE question_hash = $1',
      [matchedCanonical && matchedCanonical !== hash ? matchedCanonical : hash]
    );
    counts.existing++;
    const row = matchedQuestion;
    let rowOptions = row?.options || [];
    if (typeof rowOptions === 'string') { try { rowOptions = JSON.parse(rowOptions); } catch (_) { rowOptions = []; } }
    results.push({ status: row?.answer_status === 'answered' ? 'answered' : 'pending', question: {
      question_text: row?.question_text || question.display_question,
      options: matchedOptions?.length ? matchedOptions : rowOptions,
      answer_status: row?.answer_status || 'pending',
      correct_answer: row?.answer_status === 'answered' ? row.correct_answer : null
    } });
  }
  await query('UPDATE submissions SET total_detected = $1, new_count = $2, existing_count = $3 WHERE id = $4', [counts.detected, counts.new, counts.existing, submissionId]);
  return { submissionId, counts, results };
}
