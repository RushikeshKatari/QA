# Question Database & Public Submission System

A full-stack, secure question repository and management web application built with Node.js, Express, PostgreSQL, React, and Tailwind CSS.

## Key Features

1. **Public Question Submission**:
   - Anyone can submit or upload questions without needing an admin account.
   - **Paste Text**: Submit single or batch questions in plain text with automatic format detection.
   - **File Upload**: Upload questions via `.txt`, `.csv`, `.json`, or text PDF files (up to 5MB).
2. **Security & Data Integrity**:
   - **Public users cannot set answers**: The server strictly strips and rejects any client-supplied answer fields.
   - All newly submitted questions are assigned `answer_status = 'pending'` and `correct_answer = null`.
   - **Rate limiting** & batch limits (max 500 questions per batch) to prevent spam.
   - Sensitive internal database fields and admin metadata are masked in public endpoints.
3. **Automatic Normalization & Deduplication**:
   - Questions are normalized (case folding, punctuation stripping, spacing normalization).
   - If a submitted question already exists in the PostgreSQL database:
     - Record is not duplicated.
     - `times_seen` counter is incremented (`times_seen = times_seen + 1`).
     - Feedback: `"✓ Question received - This question already exists in our database."`
   - If a question is new:
     - Added to the database with `times_seen = 1`.
     - Feedback: `"✓ Question submitted successfully - Your question has been added to the question database."`
   - Batch upload summary:
     ```text
     Submission Complete
     Questions detected: 100
     New questions: 72
     Already existing: 28
     ```
4. **Public Question Search**:
   - Real-time search by question stem or keyword.
   - Answered questions show verified official answers with green check badges.
   - Unanswered questions show: `"Answer: Not available yet"`.
5. **Admin Dashboard & Answer Pattern Tool**:
   - **Default Admin Account**: `admin` / `admin123`.
   - Dashboard statistics: Total Unique, Answered, Pending, New Today, Answered Today.
   - Pending questions review queue with single-click answer assignment (`A`, `B`, `C`, `D`).
   - **Answer Pattern Assignment Tool (`{ a delhi } { b india } { a delhi , c canada }`)**:
     - Dedicated **AI / Assistant Prompt Helper**:
       - `Copy Prompt Template` to request answers in the exact required pattern.
       - `Copy Prompt with Selected Questions` to format all selected questions into the prompt ready for ChatGPT/Claude.
     - Supports both single-choice (`{ a delhi }`) and multiple-choice questions (`{ a delhi , c canada }`).
     - Real-time live parser preview mapping answers to questions with `Multi-Option` indicator.
     - One-click bulk confirmation marks them as `answered` and publishes them to public search immediately.
6. **Dual PostgreSQL Database Engine**:
   - **Zero-Config Embedded Engine**: Uses `@electric-sql/pglite` by default with persistent storage on disk (`data/pgdata/`). Runs real PostgreSQL queries, types, and indexes without requiring a local PostgreSQL service installation!
   - **Native PostgreSQL Connection**: Simply provide `DATABASE_URL=postgresql://user:password@localhost:5432/question_db` to switch to native PostgreSQL.

---

## Getting Started

### 1. Installation

```bash
cd question-system
npm install
```

### 2. Run the Application

```bash
# Start the unified server (API + Client)
npm start
```

The application is accessible at:
- **Public Homepage & Admin Portal**: `http://localhost:3001`
- **Default Admin Account**: Username: `admin`, Password: `admin123`

### 3. Development Mode

To run backend and Vite frontend with hot reload:

```bash
npm run dev
```

### 4. Run Automated Tests

```bash
npm test
```
