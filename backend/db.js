const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'english_app.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS speaking_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    situation TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    avg_score REAL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS speaking_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    transcript TEXT,
    corrected TEXT,
    grammar_score INTEGER,
    pronunciation_score INTEGER,
    naturalness_score INTEGER,
    overall_score INTEGER,
    mistakes_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES speaking_sessions(id)
  );

  CREATE TABLE IF NOT EXISTS vocabulary_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    word TEXT NOT NULL,
    phonetic TEXT,
    meaning TEXT NOT NULL,
    example TEXT,
    topic TEXT,
    status TEXT DEFAULT 'new', -- 'new', 'learning', 'mastered'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS vocabulary_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    word_id INTEGER,
    mode TEXT,
    is_correct INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(word_id) REFERENCES vocabulary_words(id)
  );

  CREATE TABLE IF NOT EXISTS practice_streaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    date TEXT, -- YYYY-MM-DD
    speaking_minutes INTEGER DEFAULT 0,
    vocab_count INTEGER DEFAULT 0,
    UNIQUE(user_id, date),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

module.exports = db;
