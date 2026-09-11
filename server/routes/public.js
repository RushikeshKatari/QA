import express from 'express';
import path from 'path';
import { query } from '../db.js';
import { ingestSubmission } from '../questionPipeline.js';
import { extractPdfText } from '../pdf.js';
import { submissionLimiter, uploadMiddleware } from '../middleware/security.js';

const router = express.Router();

/**
 * GET /api/stats
 * Publicly visible statistics (Total unique, answered count)
 */
router.get('/stats', async (req, res) => {
  try {
    const totalResult = await query('SELECT COUNT(*) as count FROM questions');
    const answeredResult = await query("SELECT COUNT(*) as count FROM questions WHERE answer_status = 'answered'");
    const pendingResult = await query("SELECT COUNT(*) as count FROM questions WHERE answer_status = 'pending'");

    const totalUnique = parseInt(totalResult.rows[0]?.count || 0, 10);
    const answered = parseInt(answeredResult.rows[0]?.count || 0, 10);
    const pending = parseInt(pendingResult.rows[0]?.count || 0, 10);

    res.json({
      success: true,
      totalUnique,
      answered,
      pending
    });
  } catch (err) {
    console.error('Error fetching public stats:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch database statistics' });
  }
});

/**
 * GET /api/questions/search
 * Public search endpoint.
 * Core Security Rule: If a question is pending, correct answer is masked as "Not available yet".
 * Internal fields and admin notes are stripped.
 */
router.get('/questions/search', async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : '';
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || 15, 10)));
    const offset = (page - 1) * limit;

    let countQuery = "SELECT COUNT(*) as count FROM questions WHERE answer_status = 'answered'";
    let dataQuery = "SELECT id, question_text, options, correct_answer, answer_status, times_seen, created_at FROM questions WHERE answer_status = 'answered'";
    let params = [];

    if (q) {
      countQuery += ' AND (question_text ILIKE $1 OR normalized_text ILIKE $1)';
      dataQuery += ' AND (question_text ILIKE $1 OR normalized_text ILIKE $1) ORDER BY times_seen DESC, id DESC LIMIT $2 OFFSET $3';
      params = [`%${q}%`];
    } else {
      dataQuery += ' ORDER BY times_seen DESC, id DESC LIMIT $1 OFFSET $2';
    }

    const countRes = await query(countQuery, params);
    const totalCount = parseInt(countRes.rows[0]?.count || 0, 10);

    const dataParams = q ? [params[0], limit, offset] : [limit, offset];
    const dataRes = await query(dataQuery, dataParams);

    // Sanitize output for public users
    const items = dataRes.rows.map(row => {
      let options = [];
      try {
        options = typeof row.options === 'string' ? JSON.parse(row.options) : (row.options || []);
      } catch (e) {
        options = [];
      }

      const isAnswered = row.answer_status === 'answered';

      let answerDisplay = 'Not available yet';
      let correctOptionText = null;

      if (isAnswered && row.correct_answer) {
        const keys = row.correct_answer.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
        const displays = keys.map(k => {
          const found = options.find(o => o.key.toUpperCase() === k);
          return found ? `${found.key}. ${found.text}` : k;
        });
        correctOptionText = displays.join(', ');
        answerDisplay = displays.length > 0 ? displays.join(', ') : row.correct_answer;
      }

      return {
        id: row.id,
        question_text: row.question_text,
        options,
        answer_status: row.answer_status,
        times_seen: row.times_seen,
        correct_answer: isAnswered ? row.correct_answer : null,
        correct_option_text: isAnswered ? correctOptionText : null,
        answer_display: answerDisplay
      };
    });

    res.json({
      success: true,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      items
    });
  } catch (err) {
    console.error('Error in public question search:', err);
    res.status(500).json({ success: false, error: 'Error searching questions' });
  }
});

/**
 * POST /api/submit
 * Public Question Submission (Paste Text or File Upload).
 * Enforces:
 * 1. Public users cannot set correct_answer or answer_status (always NULL / pending).
 * 2. Duplicate detection via normalized question text:
 *    - If exists: times_seen = times_seen + 1
 *    - If new: inserted as pending
 * 3. Returns structured feedback for single or batch submissions.
 */
router.post('/submit', submissionLimiter, uploadMiddleware.single('file'), async (req, res) => {
  try {
    let rawContent = '';
    let format = 'text';
    let submissionType = 'paste';
    let originalFileName = null;

    if (req.file) {
      submissionType = 'upload';
      originalFileName = req.file.originalname;
      const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
      format = ext || 'text';
      if (format === 'pdf') {
        rawContent = await extractPdfText(req.file.buffer);
      } else {
        rawContent = req.file.buffer.toString('utf8');
      }
    } else if (req.body && req.body.text) {
      submissionType = 'paste';
      rawContent = String(req.body.text);
      format = req.body.format || 'text';
    } else {
      return res.status(400).json({
        success: false,
        error: 'Please paste your questions or upload a file (.txt, .csv, .json).'
      });
    }

    if (!rawContent || !rawContent.trim()) {
      return res.status(400).json({
        success: false,
        error: 'The submitted content is empty.'
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const { counts, results } = await ingestSubmission({ content: rawContent, format, source: submissionType, fileName: originalFileName, ipAddress });
    const { detected: totalDetected, new: newCount, existing: existingCount } = counts;

    if (!totalDetected) return res.status(400).json({ success: false, error: 'Only invalid or UI-artifact text was found; nothing was stored.' });

    // Format response matching specifications
    if (totalDetected === 1) {
      if (newCount === 1) {
        return res.json({
          success: true,
          isSingle: true,
          statusType: 'single_new',
          title: '✓ Question submitted successfully',
          message: 'Your question has been added to the question database.',
          counts: { detected: 1, new: 1, existing: 0 },
          result: results[0]
        });
      } else {
        const existing = results[0];
        const answered = existing?.status === 'answered';
        return res.json({
          success: true,
          isSingle: true,
          statusType: 'single_existing',
          title: answered ? '✓ Verified question found' : 'Question already awaiting review',
          message: answered ? 'This question is already answered in the database.' : 'This question is already awaiting admin review.',
          counts: { detected: 1, new: 0, existing: 1 },
          result: existing
        });
      }
    }

    // Batch response
    return res.json({
      success: true,
      isSingle: false,
      title: 'Submission Complete',
      message: `Questions detected: ${totalDetected}\nNew questions: ${newCount}\nAlready existing: ${existingCount}`,
      counts: {
        detected: totalDetected,
        new: newCount,
        existing: existingCount
      }
    });

  } catch (err) {
    console.error('Submission error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      error: 'An error occurred while processing your submission: ' + err.message
    });
  }
});

export default router;
