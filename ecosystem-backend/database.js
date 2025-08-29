
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

// --- MOCK-DATEN (für das einmalige Seeding) ---
const initialData = {
  projects: [
    {
      id: "proj_1",
      userId: "user_123",
      title: "Marathon unter 4 Stunden laufen",
      status: "active",
      context_id: "ctx_1",
    },
    {
      id: "proj_2",
      userId: "user_123",
      title: "Neues Schach-Repertoire entwickeln",
      status: "active",
      context_id: "ctx_4",
    },
    {
      id: "proj_3",
      userId: "user_123",
      title: "Balkon bepflanzen",
      status: "completed",
      context_id: "ctx_2",
    },
  ],
  tasks: [
    {
      id: "task_1",
      projectId: "proj_1",
      text: "Die richtigen Laufschuhe kaufen",
      completed: 1, // SQLite verwendet 1 für true
      created_at: "2025-08-20T10:00:00Z",
      scheduled_at: null,
    },
    {
      id: "task_2",
      projectId: "proj_1",
      text: "5km-Lauf zur Standortbestimmung",
      completed: 1,
      created_at: "2025-08-21T10:00:00Z",
      scheduled_at: null,
    },
    {
      id: "task_3",
      projectId: "proj_1",
      text: "Erster 10km-Lauf",
      completed: 0,
      created_at: "2025-08-22T10:00:00Z",
      scheduled_at: new Date().toISOString().slice(0, 10),
    },
    {
      id: "task_4",
      projectId: "proj_1",
      text: "Intervalltraining durchführen",
      completed: 0,
      created_at: "2025-08-23T10:00:00Z",
      scheduled_at: new Date().toISOString().slice(0, 10),
    },
    {
      id: "task_5",
      projectId: "proj_2",
      text: "Analyse der sizilianischen Verteidigung",
      completed: 0,
      created_at: "2025-08-25T10:00:00Z",
      scheduled_at: new Date().toISOString().slice(0, 10),
    },
    {
      id: "task_6",
      projectId: "proj_2",
      text: "30 Minuten Taktik-Aufgaben lösen",
      completed: 0,
      created_at: "2025-08-26T10:00:00Z",
      scheduled_at: new Date().toISOString().slice(0, 10),
    },
    {
      id: "task_7",
      projectId: null,
      text: "Steuererklärung vorbereiten",
      completed: 0,
      created_at: "2025-08-28T14:00:00Z",
      scheduled_at: null,
    },
    {
      id: "task_8",
      projectId: null,
      text: "Idee für Blogartikel über Produktivität notieren",
      completed: 0,
      created_at: "2025-08-28T16:00:00Z",
      scheduled_at: null,
    },
  ],
};

let db;

async function initializeDatabase() {
  if (db) return db;

  try {
    db = await open({
      filename: path.join(__dirname, 'progress.db'), // Robuster, absoluter Pfad
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
    `);

    // Überprüfen, ob die Datenbank bereits Daten enthält
    const projectCount = await db.get('SELECT COUNT(*) as count FROM projects');

    if (projectCount.count === 0) {
      console.log('Seeding database with initial data...');
      const { projects, tasks } = initialData;

      // Projekte einfügen
      const projectStmt = await db.prepare('INSERT INTO projects (id, userId, title, status, context_id) VALUES (?, ?, ?, ?, ?)');
      for (const project of projects) {
        await projectStmt.run(project.id, project.userId, project.title, project.status, project.context_id);
      }
      await projectStmt.finalize();

      // Aufgaben einfügen
      const taskStmt = await db.prepare('INSERT INTO tasks (id, projectId, text, completed, created_at, scheduled_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const task of tasks) {
        await taskStmt.run(task.id, task.projectId, task.text, task.completed, task.created_at, task.scheduled_at);
      }
      await taskStmt.finalize();
      console.log('Database seeded successfully.');
    }

    return db;
  } catch (err) {
    console.error('Error initializing database:', err.message);
    throw err;
  }
}

module.exports = { initializeDatabase };
