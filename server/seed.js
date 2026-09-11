import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { normalizeQuestion } from './parser.js';

export async function seedDatabase() {
  console.log('Checking database seed state...');

  // Ensure default admin exists
  const adminCheck = await query('SELECT COUNT(*) as count FROM admins');
  if (parseInt(adminCheck.rows[0]?.count || 0, 10) === 0) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', ['admin', passwordHash]);
    console.log('Default admin seeded (username: admin, password: admin123)');
  }

  // Keep the legacy admin login table while linking each administrator to the
  // auditable users identity required by answer/approval actions.
  const admins = await query('SELECT id, user_id FROM admins');
  for (const admin of admins.rows) {
    if (admin.user_id) continue;
    const user = await query("INSERT INTO users (role) VALUES ('admin') RETURNING id");
    await query('UPDATE admins SET user_id = $1 WHERE id = $2', [user.rows[0].id, admin.id]);
  }

  // Check if questions already seeded
  const qCountRes = await query('SELECT COUNT(*) as count FROM questions');
  const existingCount = parseInt(qCountRes.rows[0]?.count || 0, 10);

  if (existingCount > 0) {
    console.log(`Database already has ${existingCount} questions. Skipping question seed.`);
    return;
  }

  console.log('Seeding initial questions (answered + pending)...');

  const seedQuestions = [
    // Answered Questions
    {
      text: 'What is the capital of India?',
      options: [
        { key: 'A', text: 'Mumbai' },
        { key: 'B', text: 'Delhi' },
        { key: 'C', text: 'Chennai' },
        { key: 'D', text: 'Kolkata' }
      ],
      correctAnswer: 'B',
      status: 'answered',
      timesSeen: 142
    },
    {
      text: 'Which planet is known as the Red Planet?',
      options: [
        { key: 'A', text: 'Earth' },
        { key: 'B', text: 'Mars' },
        { key: 'C', text: 'Jupiter' },
        { key: 'D', text: 'Venus' }
      ],
      correctAnswer: 'B',
      status: 'answered',
      timesSeen: 89
    },
    {
      text: 'What is the largest ocean on Earth?',
      options: [
        { key: 'A', text: 'Atlantic Ocean' },
        { key: 'B', text: 'Indian Ocean' },
        { key: 'C', text: 'Pacific Ocean' },
        { key: 'D', text: 'Arctic Ocean' }
      ],
      correctAnswer: 'C',
      status: 'answered',
      timesSeen: 76
    },
    {
      text: 'What is the chemical symbol for Gold?',
      options: [
        { key: 'A', text: 'Au' },
        { key: 'B', text: 'Ag' },
        { key: 'C', text: 'Fe' },
        { key: 'D', text: 'Pb' }
      ],
      correctAnswer: 'A',
      status: 'answered',
      timesSeen: 53
    },
    {
      text: 'Who wrote the play "Romeo and Juliet"?',
      options: [
        { key: 'A', text: 'Charles Dickens' },
        { key: 'B', text: 'William Shakespeare' },
        { key: 'C', text: 'Mark Twain' },
        { key: 'D', text: 'Jane Austen' }
      ],
      correctAnswer: 'B',
      status: 'answered',
      timesSeen: 110
    },

    // Pending Questions (Waiting for Admin approval / sequence)
    {
      text: 'Which gas do plants absorb from the atmosphere during photosynthesis?',
      options: [
        { key: 'A', text: 'Oxygen' },
        { key: 'B', text: 'Carbon Dioxide' },
        { key: 'C', text: 'Nitrogen' },
        { key: 'D', text: 'Hydrogen' }
      ],
      correctAnswer: null,
      status: 'pending',
      timesSeen: 12
    },
    {
      text: 'How many continents are there on Earth?',
      options: [
        { key: 'A', text: '5' },
        { key: 'B', text: '6' },
        { key: 'C', text: '7' },
        { key: 'D', text: '8' }
      ],
      correctAnswer: null,
      status: 'pending',
      timesSeen: 8
    },
    {
      text: 'What is the speed of light in vacuum (approx)?',
      options: [
        { key: 'A', text: '300,000 km/s' },
        { key: 'B', text: '150,000 km/s' },
        { key: 'C', text: '500,000 km/s' },
        { key: 'D', text: '1,000,000 km/s' }
      ],
      correctAnswer: null,
      status: 'pending',
      timesSeen: 5
    },
    {
      text: 'Who was the first person to step on the Moon?',
      options: [
        { key: 'A', text: 'Yuri Gagarin' },
        { key: 'B', text: 'Buzz Aldrin' },
        { key: 'C', text: 'Neil Armstrong' },
        { key: 'D', text: 'Michael Collins' }
      ],
      correctAnswer: null,
      status: 'pending',
      timesSeen: 19
    },
    {
      text: 'What is the hardest natural substance on Earth?',
      options: [
        { key: 'A', text: 'Gold' },
        { key: 'B', text: 'Iron' },
        { key: 'C', text: 'Diamond' },
        { key: 'D', text: 'Platinum' }
      ],
      correctAnswer: null,
      status: 'pending',
      timesSeen: 27
    }
  ];

  for (const q of seedQuestions) {
    const normalized = normalizeQuestion(q.text);
    const optionsJson = JSON.stringify(q.options);
    const answeredAt = q.status === 'answered' ? 'CURRENT_TIMESTAMP' : 'NULL';

    await query(
      `INSERT INTO questions 
        (question_text, normalized_text, options, correct_answer, answer_status, times_seen, source, created_at, updated_at, answered_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'seed_data', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${answeredAt})`,
      [q.text, normalized, optionsJson, q.correctAnswer, q.status, q.timesSeen]
    );
  }

  console.log(`Seeded ${seedQuestions.length} initial questions.`);
}
