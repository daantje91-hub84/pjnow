require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const { initializeDatabase } = require("./database.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require("path");

// Sicherheitsprüfung für Umgebungsvariablen
const requiredEnvVars = ["GEMINI_API_KEY"];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(
      `\x1b[31mFEHLER: Die Umgebungsvariable '${varName}' wurde nicht gefunden.\x1b[0m`
    );
    process.exit(1);
  }
}

const app = express();
const PORT = 3000;

// --- Initialisierung ---
app.use(cors());
app.use(express.json());

// KI-Client initialisieren
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const systemPrompt = `
Du bist ein intelligenter Assistent zur Aufgaben-Triagierung. Deine Aufgabe ist es, einen vom Nutzer bereitgestellten Text zu analysieren und ihn in ein strukturiertes JSON-Format zu überführen.
Klassifizierungsregeln:
1.  PROJECT: Wenn der Text ein klares Ziel beschreibt, das mehrere Schritte benötigt. Gib dem Projekt eine \`id\` und eine Liste von \`tasks\`.
2.  TASK: Wenn der Text eine einzelne, konkrete Aktion beschreibt.
Ausgabeformat:
Gib IMMER NUR ein valides JSON-Objekt zurück, ohne umschließende Markdown-Syntax. Beispiel für ein Projekt: { "id": "Marathon laufen", "tasks": [{"text":"Trainingsplan erstellen"}, {"text":"Laufschuhe kaufen"}] }`;

// =====================================================================
// API-Endpunkte für Projekte
// =====================================================================

app.get("/api/projects", async (req, res) => {
  try {
    const db = await initializeDatabase();
    const projects = await db.all("SELECT * FROM projects");
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/projects", async (req, res) => {
  const { title, context_id } = req.body;
  if (!title) {
    return res
      .status(400)
      .json({ error: "Title for the project is required." });
  }
  try {
    const db = await initializeDatabase();
    const newId = `proj_${Date.now()}`;
    await db.run(
      "INSERT INTO projects (id, title, userId, status, context_id) VALUES (?, ?, ?, ?, ?)",
      [newId, title, "user_123", "active", context_id || null]
    );
    const newProject = await db.get(
      "SELECT * FROM projects WHERE id = ?",
      newId
    );
    res.status(201).json(newProject);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// API-Endpunkte für Aufgaben
// =====================================================================

app.get("/api/tasks", async (req, res) => {
  try {
    const db = await initializeDatabase();
    const tasks = await db.all(
      "SELECT *, CASE completed WHEN 1 THEN 'true' ELSE 'false' END as completed FROM tasks"
    );
    res.json(tasks.map((t) => ({ ...t, completed: t.completed === "true" })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/tasks", async (req, res) => {
  const {
    text,
    projectId,
    isHabit,
    habitOriginId,
    delegated_to,
    deadline,
    start_time,
  } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Text for the task is required." });
  }
  try {
    const db = await initializeDatabase();
    const newId = `task_${Date.now()}`;
    const new_created_at = new Date().toISOString();
    await db.run(
      "INSERT INTO tasks (id, text, projectId, created_at, isHabit, habitOriginId, streak, delegated_to, deadline, start_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        newId,
        text,
        projectId || null,
        new_created_at,
        isHabit || 0,
        habitOriginId || null,
        0,
        delegated_to || null,
        deadline || null,
        start_time || null,
      ]
    );
    const newTask = await db.get("SELECT * FROM tasks WHERE id = ?", newId);
    res.status(201).json(newTask);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const { text, completed, streak, delegated_to, deadline, start_time } =
    req.body;
  try {
    const db = await initializeDatabase();
    const currentTask = await db.get("SELECT * FROM tasks WHERE id = ?", id);
    if (!currentTask) return res.status(404).json({ error: "Task not found." });

    const newText = text !== undefined ? text : currentTask.text;
    const newCompleted =
      completed !== undefined ? (completed ? 1 : 0) : currentTask.completed;
    const newStreak = streak !== undefined ? streak : currentTask.streak;
    const newDelegatedTo =
      delegated_to !== undefined ? delegated_to : currentTask.delegated_to;
    const newDeadline =
      deadline !== undefined ? deadline : currentTask.deadline;
    const newStartTime =
      start_time !== undefined ? start_time : currentTask.start_time;

    await db.run(
      "UPDATE tasks SET text = ?, completed = ?, streak = ?, delegated_to = ?, deadline = ?, start_time = ? WHERE id = ?",
      [
        newText,
        newCompleted,
        newStreak,
        newDelegatedTo,
        newDeadline,
        newStartTime,
        id,
      ]
    );
    const updatedTask = await db.get("SELECT * FROM tasks WHERE id = ?", id);
    res.json(updatedTask);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const db = await initializeDatabase();
    await db.run("DELETE FROM tasks WHERE id = ?", id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// KI-Endpunkt
// =====================================================================
app.post("/api/process-note", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Der Text der Notiz fehlt." });
  }
  try {
    const prompt = `Analysiere den folgenden Text und gib das Ergebnis als JSON zurück:\n\n---\n${text}\n---`;
    const result = await model.generateContent([systemPrompt, prompt]);
    const response = await result.response;
    const jsonText = response.text().replace(/```json\n|\n```/g, "");
    const structuredData = JSON.parse(jsonText);
    res.json(structuredData);
  } catch (error) {
    console.error("Fehler bei der KI-Verarbeitung:", error);
    res.status(500).json({ error: "Fehler bei der Kommunikation mit der KI." });
  }
});

// Server starten
const startServer = async () => {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`Server lauscht auf http://localhost:${PORT}`);
    console.log("Datenbank ist verbunden und die API ist bereit.");
  });
};

startServer();
