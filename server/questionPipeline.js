import crypto from 'node:crypto';
import { parseQuestions, prepareQuestion } from './parser.js';
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

  for (const rawQuestion of parsed) {
    const question = prepareQuestion(rawQuestion, format);
    if (!question.valid) { counts.rejected++; continue; }
    counts.detected++;
    const hash = canonicalHash(question.canonical_question);
    const inserted = await query(
      `INSERT INTO questions
       (submission_id, original_text, display_question, canonical_question, question_hash, question_text, normalized_text,
        options, correct_answer, answer_status, times_seen, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $3, $4, $6, NULL, $7, 1, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (question_hash) WHERE question_hash IS NOT NULL DO NOTHING
       RETURNING id`,
      [submissionId, question.original_text, question.display_question, question.canonical_question, hash,
        JSON.stringify(question.options), question.status, source]
    );
    if (inserted.rows.length) { counts.new++; continue; }
    // The unique index makes this update safe even when duplicate requests race.
    await query('UPDATE questions SET times_seen = times_seen + 1, updated_at = CURRENT_TIMESTAMP WHERE question_hash = $1', [hash]);
    counts.existing++;
  }
  await query('UPDATE submissions SET total_detected = $1, new_count = $2, existing_count = $3 WHERE id = $4', [counts.detected, counts.new, counts.existing, submissionId]);
  return { submissionId, counts };
}
