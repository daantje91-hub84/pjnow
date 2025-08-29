// ===================================================================
// VIEW MANAGER
// Kümmert sich um das Laden, Darstellen und Aktualisieren der App-Ansichten.
// ===================================================================

const appContent = document.getElementById("app-content");

appContent.addEventListener("click", (e) => {
  if (e.target.closest("#back-to-projects")) {
    e.preventDefault();
    navigateTo("projects-content");
  }
});

async function navigateTo(viewId, params = {}) {
  console.log(`Navigiere zu: ${viewId}`, params);
  if (params.projectId) currentProjectId = params.projectId;

  let viewFile = viewId;
  // Logik, um zu entscheiden, ob das leere oder gefüllte Dashboard angezeigt wird
  if (viewId === "dashboard") {
    // Greift auf die im database-Objekt geladenen Daten zu
    viewFile =
      database.getActiveProjects().length > 0
        ? "dashboard-filled-content"
        : "dashboard-empty-content";
  }

  try {
    const response = await fetch(`views/${viewFile}.html`);
    if (!response.ok)
      throw new Error(`Laden von views/${viewFile}.html fehlgeschlagen`);

    appContent.innerHTML = await response.text();
    currentView = viewFile;
    window.currentView = currentView;

    updateNavState();
    // Verzögerter Aufruf, um sicherzustellen, dass der DOM aktualisiert ist
    setTimeout(runViewSpecificScripts, 0);
  } catch (error) {
    console.error("Navigation fehlgeschlagen:", error);
    appContent.innerHTML = `<div class="error-state"><h1>Fehler</h1><p>Die Seite konnte nicht geladen werden.</p></div>`;
  }
}

function runViewSpecificScripts() {
  const viewRenderers = {
    "dashboard-empty-content": renderDashboard,
    "dashboard-filled-content": renderDashboard,
    "projects-content": renderProjects,
    "inbox-content": renderInbox,
    "today-content": renderToday,
    "timeline-content": renderTimeline,
    "project-detail-content": renderProjectDetails, // Diese Funktion wird jetzt wieder gefunden
    "settings-content": renderSettings,
  };

  const renderFunction = viewRenderers[currentView];
  if (renderFunction) {
    renderFunction();
  }
}

// ===================================================================
// RENDER-FUNKTIONEN
// ===================================================================

function renderDashboard() {
  const grid = document.getElementById("projects-grid");
  if (!grid) return;
  grid.innerHTML = "";
  database.getActiveProjects().forEach((project) => {
    grid.innerHTML += createProjectCardHtml(project);
  });
  addProjectCardListeners();
  setupWizardTriggers();
}

function renderProjects() {
  const grid = document.getElementById("projects-grid-projects");
  if (!grid) return;
  grid.innerHTML = "";
  database.getProjects().forEach((project) => {
    grid.innerHTML += createProjectCardHtml(project);
  });
  addProjectCardListeners();
  setupWizardTriggers();
}

function renderToday() {
  const list = document.getElementById("today-list");
  if (!list) return;

  const tasks = database.getTodayTasks();

  if (tasks.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>Keine Aufgaben für heute geplant. Genieße den Tag!</p></div>`;
    return;
  }

  list.innerHTML = tasks.map(task => {
    const project = task.projectId ? database.getProjectById(task.projectId) : null;
    const isInProgress = task.id === pomodoroTimer.activeTaskId;

    return `
      <div class="today-task-item ${isInProgress ? 'task-in-progress' : ''}" data-task-id="${task.id}">
        <div class="task-info">
          <span class="task-checkbox"><span class="material-icons">${task.completed ? 'check_box' : 'check_box_outline_blank'}</span></span>
          <span class="task-text">${task.text}</span>
          ${project ? `<a href="#" class="task-project-link" data-project-id="${project.id}">${project.title}</a>` : ''}
        </div>
        <div class="task-actions">
          <button class="button-icon start-task-timer" title="Timer für diese Aufgabe starten">
            <span class="material-icons">${isInProgress && pomodoroTimer.isRunning ? 'pause_circle' : 'play_circle'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Event-Listener für die neuen Task-Elemente hinzufügen
  document.querySelectorAll('.today-task-item .task-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      const taskId = e.target.closest('.today-task-item').dataset.taskId;
      database.toggleTaskCompleted(taskId);
      renderToday(); // Ansicht neu rendern, um den Status zu aktualisieren
    });
  });

  document.querySelectorAll('.today-task-item .start-task-timer').forEach(button => {
    button.addEventListener('click', (e) => {
      const taskId = e.target.closest('.today-task-item').dataset.taskId;
      startTimerForTask(taskId); // Diese Funktion ist in pomodoro.js definiert
    });
  });

  document.querySelectorAll('.task-project-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('project-detail-content', { projectId: e.target.dataset.projectId });
    });
  });
}

function renderInbox() {
  const list = document.getElementById("inbox-list");
  if (!list) return;
  const tasks = database.getInboxTasks();
  if (tasks.length > 0) {
    list.innerHTML = tasks
      .map(
        (task) => `
            <div class="inbox-item" data-task-id="${task.id}">
                <div class="inbox-item-main">
                    <div class="inbox-item-text">${task.text}</div>
                    <div class="inbox-item-meta">Erstellt: ${formatRelativeTime(
                      new Date(task.created_at)
                    )}</div>
                </div>
                <div class="inbox-item-actions">
                    <button class="button-icon process-item-btn" title="Verarbeiten"><span class="material-icons">arrow_circle_right</span></button>
                    <button class="button-icon delete-item-btn" title="Löschen"><span class="material-icons">delete_outline</span></button>
                </div>
            </div>
        `
      )
      .join("");
  } else {
    list.innerHTML = `<div class="empty-state"><p>Deine Inbox ist leer. Gut gemacht!</p></div>`;
  }
  addInboxListeners();
}

function renderTimeline() {
  const container = document.getElementById("timeline-events");
  if (container)
    container.innerHTML = `<div class="empty-state"><p>Timeline-Funktion wird noch entwickelt.</p></div>`;
}

function renderSettings() {
  // Diese Funktion bleibt unverändert
}

// =====================================================================
// FIX: Fehlende renderProjectDetails-Funktion wieder hinzugefügt
// =====================================================================
function renderProjectDetails() {
  const project = database.getProjectById(currentProjectId);
  if (!project) {
    console.error(
      "Projekt für Detailansicht nicht gefunden:",
      currentProjectId
    );
    appContent.innerHTML = `<div class="error-state"><h1>Projekt nicht gefunden</h1></div>`;
    return;
  }
  document.getElementById("project-title").textContent = project.title;
  const progress = database.calculateProjectProgress(currentProjectId);
  document.getElementById("project-progress-fill").style.width = `${progress}%`;

  const timeline = document.getElementById("project-timeline");
  if (!timeline) return;

  const tasks = database.getTasksByProjectId(currentProjectId);

  // Annahme: project.milestones existiert. Wenn nicht, muss dies angepasst werden.
  const milestones = project.milestones || [
    { id: "default", title: "Alle Aufgaben" },
  ];

  timeline.innerHTML = milestones
    .map(
      (milestone) => `
        <div class="milestone">
            <div class="milestone__line"></div>
            <div class="milestone__icon"><span class="material-icons">flag</span></div>
            <div class="milestone__content">
                <div class="milestone__header"><h3>${milestone.title}</h3></div>
                ${createTaskListHtml(milestone, tasks)}
            </div>
        </div>
    `
    )
    .join("");
  addTaskListeners();
}

// ===================================================================
// HTML-HILFSFUNKTIONEN
// ===================================================================

function createProjectCardHtml(project) {
  const progress = database.calculateProjectProgress(project.id);
  return `
        <div class="project-card" data-project-id="${project.id}">
            <div class="card-header"><h3 class="project-title">${project.title}</h3><span class="material-icons card-menu">more_horiz</span></div>
            <div class="card-footer">
                <div class="progress-info"><span class="progress-label">Fortschritt</span><span class="progress-percent">${progress}%</span></div>
                <div class="card-progress-bar"><div class="card-progress-fill" style="width: ${progress}%;"></div></div>
            </div>
        </div>`;
}

function createTaskListHtml(milestone, tasks) {
  // Filtert Aufgaben, die zu diesem Meilenstein gehören (oder alle, falls kein Meilenstein da ist)
  const milestoneTasks =
    milestone.id === "default"
      ? tasks
      : tasks.filter((t) => t.milestone_id === milestone.id);

  if (milestoneTasks.length === 0)
    return `<p style="font-style: italic; color: var(--muted); margin-top: 12px;">Keine Aufgaben für diesen Meilenstein.</p>`;

  return `<ul class="task-list">${milestoneTasks
    .map(
      (task) => `
        <li class="task-item ${
          task.completed ? "completed" : ""
        }" data-task-id="${task.id}">
            <span class="task-checkbox"><span class="material-icons">${
              task.completed ? "check_box" : "check_box_outline_blank"
            }</span></span>
            <span class="task-text">${task.text}</span>
        </li>`
    )
    .join("")}</ul>`;
}

function formatRelativeTime(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "gerade eben";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `vor ${minutes} Minuten`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Stunden`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tagen`;
}

// ===================================================================
// EVENT-LISTENER-HILFSFUNKTIONEN
// ===================================================================

function addProjectCardListeners() {
  document.querySelectorAll(".project-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      // Verhindert, dass Klicks auf Menü-Buttons etc. zur Navigation führen
      if (e.target.closest(".card-menu")) return;
      navigateTo("project-detail-content", {
        projectId: card.dataset.projectId,
      });
    });
  });
}

function addTaskListeners() {
  document.querySelectorAll(".task-item").forEach((item) => {
    item.addEventListener("click", () => {
      const taskId = item.dataset.taskId;
      if (database.toggleTaskCompleted(taskId)) {
        // UI neu rendern, um den Status sofort anzuzeigen
        renderProjectDetails();
      }
    });
  });
}

function addInboxListeners() {
  // Diese Funktion bleibt unverändert
}

// ... (und alle anderen Listener-Funktionen)
