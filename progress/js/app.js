// js/app.js

// --- GLOBALER ANWENDUNGSZUSTAND ---
let currentView = "";
let currentProjectId = null;
let newProjectData = {};
let pomodoroTimer = {
  DEFAULT_TIME: 25 * 60,
  timeLeft: 25 * 60,
  isRunning: false,
  interval: null,
  activeTaskId: null,
};
window.currentView = currentView; // Für den Zugriff aus anderen Skripten

// --- KERN-INITIALISIERUNG DER APP (ENTRY POINT) ---
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Progress App wird initialisiert...");

  // Zuerst die Daten vom Backend laden
  await database.initialize();

  // Tägliche Gewohnheiten generieren/überprüfen
  await generateDailyHabitTasks();

  // Erst DANACH die restlichen UI-Komponenten initialisieren und die erste Seite anzeigen
  initializeQuickAdd();
  navigateTo("dashboard");
});

// --- LOGIK FÜR GEWOHNHEITEN (HABITS) ---
async function generateDailyHabitTasks() {
    console.log("Überprüfe tägliche Gewohnheiten...");
    const allTasks = database.getTasks();
    const habitTasks = allTasks.filter(t => t.isHabit);
    const todayString = new Date().toISOString().slice(0, 10);

    for (const habit of habitTasks) {
        // Prüfen, ob für diese Gewohnheit heute schon eine Aufgabe existiert
        const taskExistsForToday = allTasks.some(t => 
            t.habitOriginId === habit.id && t.scheduled_at === todayString
        );

        if (!taskExistsForToday) {
            console.log(`Generiere Aufgabe für Gewohnheit: ${habit.text}`);
            await database.addTask({
                text: habit.text,
                projectId: habit.projectId,
                isHabit: false, // Die erzeugte Aufgabe ist eine Instanz, keine Vorlage
                habitOriginId: habit.id, // Verweis auf die ursprüngliche Gewohnheit
                scheduled_at: todayString
            });
        }
    }
}

// --- GLOBALE HELFERFUNKTIONEN ---
function showToast(message) {
  const toast = document.getElementById("toast-notification");
  if (!toast) {
    const toastElement = document.createElement("div");
    toastElement.id = "toast-notification";
    toastElement.className = "toast hidden";
    document.body.appendChild(toastElement);
  }
  const toastElement = document.getElementById("toast-notification");
  toastElement.textContent = message;
  toastElement.classList.remove("hidden");
  setTimeout(() => {
    toastElement.classList.add("hidden");
  }, 3000);
}
