// js/database.js

const database = {
  // Lokaler Cache, um die Daten nach dem Laden zu speichern
  projects: [],
  tasks: [],
  contexts: [
    // Kontexte können vorerst statisch bleiben
    { id: "ctx_1", title: "Sport & Körper", emoji: "🏃‍♂️" },
    { id: "ctx_2", title: "Künstlerische Projekte", emoji: "🎭" },
    { id: "ctx_3", title: "Organisation & Tools", emoji: "🛠️" },
    { id: "ctx_4", title: "Persönliche Entwicklung", emoji: "🧠" },
  ],
  user_settings: [
    // Einstellungen können auch statisch bleiben
    {
      user_id: "user_123",
      daily_task_goal: 5,
      daily_pomodoro_goal: 8,
      pomodoro_work_duration: 25,
      // ... (restliche Einstellungen)
    },
  ],

  /**
   * Initialisiert die Datenbank, indem alle Daten vom Backend geladen werden.
   * Muss beim Start der App aufgerufen werden.
   */
  async initialize() {
    console.log("Initialisiere Datenbank und lade Daten vom Backend...");
    // Führt die API-Aufrufe parallel aus und wartet, bis beide fertig sind
    const [projects, tasks] = await Promise.all([
      api.getProjects(),
      api.getTasks(),
    ]);

    this.projects = projects;
    this.tasks = tasks;

    console.log("Datenbank initialisiert:", {
      projects: this.projects,
      tasks: this.tasks,
    });
  },

  // =====================================================================
  // FIX: addTask-Funktion wieder hinzugefügt, um den Fehler zu beheben
  // =====================================================================
  addTask: function (taskData) {
    try {
      if (!taskData || !taskData.text)
        throw new Error("Task data or text is missing.");

      const newTask = {
        id: `task_${Date.now()}`,
        userId: "user_123",
        projectId: taskData.projectId || null,
        text: taskData.text,
        completed: false,
        created_at: new Date().toISOString(),
      };
      this.tasks.push(newTask);
      console.log(
        `Aufgabe "${newTask.text}" lokal hinzugefügt. HINWEIS: Noch nicht im Backend gespeichert.`
      );
      return newTask;
    } catch (error) {
      console.error("Fehler beim lokalen Hinzufügen der Aufgabe:", error);
      return null;
    }
  },

  // --- DATENZUGRIFFS-FUNKTIONEN (greifen jetzt auf den Cache zu) ---

  getActiveProjects: function () {
    // Die Funktion bleibt gleich, greift aber auf die geladenen Daten zu
    return this.projects.filter((p) => p.status === "active");
  },

  getTasksByProjectId: function (projectId) {
    return this.tasks.filter((t) => t.projectId === projectId);
  },

  getProjectById: function (projectId) {
    return this.projects.find((p) => p.id === projectId);
  },

  calculateProjectProgress: function (projectId) {
    const projectTasks = this.getTasksByProjectId(projectId);
    if (!projectTasks || projectTasks.length === 0) return 0;
    const totalTasks = projectTasks.length;
    const completedTasks = projectTasks.filter((task) => task.completed).length;
    return Math.round((completedTasks / totalTasks) * 100);
  },

  getContextById: function (contextId) {
    if (!contextId) return undefined;
    return this.contexts.find((c) => c.id === contextId);
  },

  getUserSettings: function (userId = "user_123") {
    return this.user_settings.find((s) => s.user_id === userId);
  },

  getTodayTasks: function () {
    const today = new Date().toISOString().slice(0, 10);
    return this.tasks.filter((t) => t.scheduled_at === today);
  },
  getInboxTasks: function () {
    return this.tasks.filter(
      (t) =>
        t.projectId === null &&
        !t.completed &&
        t.scheduled_at === null &&
        !t.isHabit
    );
  },
  toggleTaskCompleted: function (taskId) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.completed = !task.completed;
      console.log(
        `Task ${taskId} status changed to ${task.completed}. (Änderung nur lokal)`
      );
      return true;
    }
    return false;
  },
};
