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

  // Erst DANACH die restlichen UI-Komponenten initialisieren und die erste Seite anzeigen
  initializeQuickAdd();
  navigateTo("dashboard");
});

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
