
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

// --- MOCK-DATEN (für das einmalige Seeding) ---
let db;

async function initializeDatabase() {
  if (db) return db;

  try {
    db = await open({
      filename: path.join(__dirname, 'database.db'), // Robuster, absoluter Pfad
      driver: sqlite3.Database
    });

    console.log('Connected to the SQLite database.');

    // Tabellen erstellen, falls sie nicht existieren
    await db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        userId TEXT,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        context_id TEXT
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        text TEXT NOT NULL,
        completed INTEGER DEFAULT 0, -- 0 for false, 1 for true
        created_at TEXT,
        scheduled_at TEXT,
        isHabit INTEGER DEFAULT 0,
        habitOriginId TEXT,
        streak INTEGER DEFAULT 0,
        delegated_to TEXT,
        deadline TEXT,
        start_time TEXT,
        FOREIGN KEY (projectId) REFERENCES projects (id)
      );

      CREATE TABLE IF NOT EXISTS inbox (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        created_at TEXT,
        trash INTEGER DEFAULT 0
      );
    `);

    return db;
  } catch (err) {
    console.error('Error initializing database:', err.message);
    throw err;
  }
}

module.exports = { initializeDatabase };
