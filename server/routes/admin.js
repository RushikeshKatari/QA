import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { requireAdmin, JWT_SECRET } from '../middleware/security.js';
import { areNearDuplicateQuestions, cleanQuestionText, normalizeQuestion, parseAnswerPattern, parseQuestions, prepareQuestion } from '../parser.js';

const router = express.Router();

/**
 * POST /api/admin/login
 * Admin authentication
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }

    // Check if any admin exists. If not, auto-seed default admin
    const adminCheck = await query('SELECT COUNT(*) as count FROM admins');
    if (parseInt(adminCheck.rows[0]?.count || 0, 10) === 0) {
      const defaultHash = await bcrypt.hash('admin123', 10);
      await query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', ['admin', defaultHash]);
    }

    const adminRes = await query('SELECT * FROM admins WHERE username = $1', [username.trim()]);
    if (adminRes.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const admin = adminRes.rows[0];
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, userId: admin.user_id, username: admin.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      admin: { id: admin.id, username: admin.username }
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ success: false, error: 'Server error during login' });
  }
});

/**
 * GET /api/admin/stats
 * Detailed administration metrics: Total, Pending, Answered, New Today, Answered Today, Recent list
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const totalRes = await query('SELECT COUNT(*) as count FROM questions');
    const answeredRes = await query("SELECT COUNT(*) as count FROM questions WHERE answer_status = 'answered'");
    const pendingRes = await query("SELECT COUNT(*) as count FROM questions WHERE answer_status = 'pending'");

    // Questions submitted today
    const newTodayRes = await query(`
      SELECT COUNT(*) as count FROM questions 
      WHERE created_at >= CURRENT_DATE
    `);

    // Questions answered today
    const answeredTodayRes = await query(`
      SELECT COUNT(*) as count FROM questions 
      WHERE answer_status = 'answered' AND answered_at >= CURRENT_DATE
    `);

    // Recently submitted questions
    const recentRes = await query(`
      SELECT id, question_text, answer_status, source, times_seen, created_at 
      FROM questions 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    const totalUnique = parseInt(totalRes.rows[0]?.count || 0, 10);
    const answered = parseInt(answeredRes.rows[0]?.count || 0, 10);
    const pending = parseInt(pendingRes.rows[0]?.count || 0, 10);
    const newToday = parseInt(newTodayRes.rows[0]?.count || 0, 10);
    const answeredToday = parseInt(answeredTodayRes.rows[0]?.count || 0, 10);

    res.json({
      success: true,
      stats: {
        totalUnique,
        answered,
        pending,
        newToday,
        answeredToday,
        pendingAnswers: pending
      },
      recentSubmissions: recentRes.rows
    });
  } catch (err) {
    console.error('Error getting admin stats:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve admin stats' });
  }
});

/**
 * GET /api/admin/pending
 * Retrieve pending questions for answer assignment
 */
router.get('/pending', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 50, 10)));
    const offset = (page - 1) * limit;

    const countRes = await query("SELECT COUNT(*) as count FROM questions WHERE answer_status = 'pending'");
    const total = parseInt(countRes.rows[0]?.count || 0, 10);

    const questionsRes = await query(
      `SELECT id, question_text, original_text, options, times_seen, source, created_at 
       FROM questions 
       WHERE answer_status = 'pending' 
       ORDER BY id ASC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const items = [];
    for (const row of questionsRes.rows) {
      let options = [];
      try {
        options = typeof row.options === 'string' ? JSON.parse(row.options) : (row.options || []);
      } catch (e) {
        options = [];
      }
      // Repair legacy submissions whose original multiline text contains
      // unlabeled options but whose stored options column is still empty.
      if ((!Array.isArray(options) || options.length === 0) && String(row.original_text || '').includes('\n')) {
        const parsed = parseQuestions(row.original_text, 'text');
        const prepared = parsed.length === 1 ? prepareQuestion(parsed[0]) : null;
        if (prepared?.valid && prepared.options.length > 0) {
          options = prepared.options;
          row.question_text = prepared.display_question;
          await query('UPDATE questions SET question_text = $1, display_question = $1, normalized_text = $2, options = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4', [prepared.display_question, prepared.canonical_question, JSON.stringify(options), row.id]);
        }
      }
      items.push({ ...row, options });
    }

    res.json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      items
    });
  } catch (err) {
    console.error('Error getting pending questions:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve pending questions' });
  }
});

/**
 * POST /api/admin/assign-single
 * Assign correct answer to a single question
 */
router.post('/assign-single', requireAdmin, async (req, res) => {
  try {
    const { questionId, answer } = req.body;
    if (!questionId || !answer) {
      return res.status(400).json({ success: false, error: 'questionId and answer are required' });
    }

    const cleanAnswer = String(answer).trim().toUpperCase();

    const result = await query(
      `UPDATE questions 
       SET correct_answer = $1, answer_status = 'answered', answered_by = $2, answered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 
       RETURNING id, question_text, options, correct_answer, answer_status`,
      [cleanAnswer, req.admin.userId || null, questionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    res.json({
      success: true,
      message: `Answer ${cleanAnswer} assigned to Question ${questionId}`,
      question: result.rows[0]
    });
  } catch (err) {
    console.error('Error assigning single answer:', err);
    res.status(500).json({ success: false, error: 'Failed to assign answer' });
  }
});

/**
 * POST /api/admin/assign-pattern
 * Assign answers using pattern:
 * { a delhi } { b india } { a delhi , c canada }
 * Supports both single-choice and multiple-choice questions!
 */
router.post('/assign-pattern', requireAdmin, async (req, res) => {
  try {
    const { questionIds, pattern } = req.body;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one question' });
    }

    if (!pattern || typeof pattern !== 'string') {
      return res.status(400).json({ success: false, error: 'Answer pattern is required (e.g. { a delhi } { b india } { a delhi , c canada })' });
    }

    const parsedBlocks = parseAnswerPattern(pattern);

    if (parsedBlocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid answer blocks detected. Please format as: { a delhi } { b india } { a delhi , c canada }'
      });
    }

    if (parsedBlocks.length < questionIds.length) {
      return res.status(400).json({
        success: false,
        error: `Pattern has ${parsedBlocks.length} answer block(s), but ${questionIds.length} question(s) are selected. Please provide an answer for each selected question.`
      });
    }

    const assignments = [];

    for (let i = 0; i < questionIds.length; i++) {
      const qId = questionIds[i];
      const block = parsedBlocks[i];
      const answerKey = block.answerKey; // e.g. "A" or "A, C"

      await query(
        `UPDATE questions 
         SET correct_answer = $1, answer_status = 'answered', answered_by = $2, answered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [answerKey, req.admin.userId || null, qId]
      );

      assignments.push({
        questionId: qId,
        assignedAnswer: answerKey,
        detail: block.answerText || block.raw
      });
    }

    res.json({
      success: true,
      message: `Successfully assigned answers to ${assignments.length} questions using pattern!`,
      assignments
    });
  } catch (err) {
    console.error('Error assigning pattern answers:', err);
    res.status(500).json({ success: false, error: 'Failed to assign pattern answers: ' + err.message });
  }
});

/**
 * POST /api/admin/import-answered
 * Imports admin-supplied [question] {answer} entries and replaces the pending queue.
 */
router.post('/import-answered', requireAdmin, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'Paste one or more [question] {answer} entries.' });
    }

    const entryPattern = /\[\s*([\s\S]*?)\s*\]\s*\{\s*([^{}]+?)\s*\}/g;
    const entries = [];
    let match;
    while ((match = entryPattern.exec(content)) !== null) {
      const questionText = cleanQuestionText(match[1]);
      const answer = match[2].replace(/\s+/g, ' ').trim();
      if (questionText && answer) entries.push({ questionText, answer });
    }

    if (entries.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid [question] {answer} entries found.' });
    }

    const removed = await query("DELETE FROM questions WHERE answer_status = 'pending'");
    const imported = [];
    let skippedCount = 0;

    for (const entry of entries) {
      const normalizedText = normalizeQuestion(entry.questionText);
      const exactAnswered = await query(
        "SELECT id FROM questions WHERE normalized_text = $1 AND answer_status = 'answered' LIMIT 1",
        [normalizedText]
      );
      const existingAnswered = exactAnswered.rows.length > 0
        ? exactAnswered
        : {
            rows: (await query("SELECT id, normalized_text FROM questions WHERE answer_status = 'answered'")).rows
              .filter(row => areNearDuplicateQuestions(normalizedText, row.normalized_text))
              .slice(0, 1)
          };

      if (existingAnswered.rows.length > 0) {
        skippedCount += 1;
      } else {
        const inserted = await query(
          `INSERT INTO questions
           (question_text, normalized_text, options, correct_answer, answer_status, times_seen, source, created_at, updated_at, answered_at)
           VALUES ($1, $2, '[]'::jsonb, $3, 'answered', 1, 'admin_answer_import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING id`,
          [entry.questionText, normalizedText, entry.answer]
        );
        imported.push(inserted.rows[0].id);
      }
    }

    res.json({
      success: true,
      importedCount: imported.length,
      skippedCount,
      removedPendingCount: removed.rowCount || 0
    });
  } catch (err) {
    console.error('Error importing answered questions:', err);
    res.status(500).json({ success: false, error: `Failed to import answered questions: ${err.message}` });
  }
});


/**
 * GET /api/admin/all-questions
 * Filter & browse all questions (All / Pending / Answered)
 */
router.get('/all-questions', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status; // 'all', 'pending', 'answered'
    const q = req.query.q ? String(req.query.q).trim() : '';
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || 20, 10)));
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (status && status !== 'all') {
      params.push(status);
      whereClauses.push(`answer_status = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      whereClauses.push(`(question_text ILIKE $${params.length} OR normalized_text ILIKE $${params.length})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) as count FROM questions ${whereSql}`, params);
    const total = parseInt(countRes.rows[0]?.count || 0, 10);

    const dataParams = [...params, limit, offset];
    const dataRes = await query(
      `SELECT id, question_text, options, correct_answer, answer_status, times_seen, source, created_at, answered_at 
       FROM questions ${whereSql} 
       ORDER BY id DESC 
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    const items = dataRes.rows.map(row => {
      let options = [];
      try {
        options = typeof row.options === 'string' ? JSON.parse(row.options) : (row.options || []);
      } catch (e) {
        options = [];
      }
      return { ...row, options };
    });

    res.json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      items
    });
  } catch (err) {
    console.error('Error fetching all questions:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve questions' });
  }
});

/**
 * DELETE /api/admin/questions
 * Permanently delete every question in the repository.
 */
router.delete('/questions', requireAdmin, async (req, res) => {
  try {
    const result = await query('DELETE FROM questions');
    res.json({ success: true, deletedCount: result.rowCount || 0 });
  } catch (err) {
    console.error('Error deleting all questions:', err);
    res.status(500).json({ success: false, error: 'Failed to delete all questions' });
  }
});

/**
 * DELETE /api/admin/questions/:id
 * Delete a question
 */
router.delete('/questions/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    await query('DELETE FROM questions WHERE id = $1', [id]);
    res.json({ success: true, message: `Question ${id} deleted.` });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete question' });
  }
});

export default router;
