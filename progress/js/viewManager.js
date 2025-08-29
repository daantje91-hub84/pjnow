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
  // Stellt sicher, dass wir im gefüllten Dashboard sind
  if (!document.getElementById("dashboard-grid")) return;

  // 1. Tagesziele-Widget aktualisieren
  const todayTasks = database.getTodayTasks();
  const completedToday = todayTasks.filter(t => t.completed).length;
  document.getElementById("tasks-completed-stat").textContent = completedToday;
  document.getElementById("tasks-target-stat").textContent = todayTasks.length;
  // TODO: Pomodoro-Ziele müssen aus den Einstellungen kommen
  document.getElementById("pomodoros-target-stat").textContent = "4"; // Platzhalter

  const habits = database.getTasks().filter(t => t.isHabit && !t.completed);
  document.getElementById("active-streaks-stat").textContent = `🔥 ${habits.reduce((sum, h) => sum + (h.streak > 0 ? 1 : 0), 0)}`;

  // 2. Aktives Projekt-Widget aktualisieren
  const activeProjects = database.getActiveProjects();
  const activeProjectWidget = document.getElementById("active-project-widget");
  if (activeProjectWidget && activeProjects.length > 0) {
    const project = activeProjects[0]; // Nimmt das erste aktive Projekt
    const nextTask = database.getTasksByProjectId(project.id).find(t => !t.completed);
    const progress = database.calculateProjectProgress(project.id);

    activeProjectWidget.querySelector("h3").textContent = `Aktives Projekt: ${project.title}`;
    activeProjectWidget.querySelector("p").textContent = nextTask ? `Nächster Schritt: ${nextTask.text}` : "Keine offenen Aufgaben";
    activeProjectWidget.querySelector(".progress-percent").textContent = `${progress}%`;
    activeProjectWidget.querySelector(".card-progress-fill").style.width = `${progress}%`;
  } else if (activeProjectWidget) {
      activeProjectWidget.innerHTML = "<h3>Kein aktives Projekt</h3><p>Erstelle ein neues Projekt, um hier deine Fortschritte zu sehen.</p>";
  }

  // 3. Habit-Tracker-Widget aktualisieren
  const habitList = document.getElementById("dashboard-habit-list");
  if (habitList) {
      const dailyHabits = database.getTasks().filter(t => t.isHabit);
      if (dailyHabits.length > 0) {
          habitList.innerHTML = dailyHabits.map(habit => `
              <div class="habit-item" data-task-id="${habit.id}">
                  <span class="habit-checkbox"><span class="material-icons">${habit.completed ? 'check_circle' : 'radio_button_unchecked'}</span></span>
                  <span class="habit-text">${habit.text}</span>
                  <span class="habit-streak">🔥 ${habit.streak || 0}</span>
              </div>
          `).join('');
          // Event-Listener für die Habit-Checkboxes hinzufügen
          habitList.querySelectorAll(".habit-item").forEach(item => {
              item.addEventListener("click", async e => {
                  const taskId = e.currentTarget.dataset.taskId;
                  await database.toggleTaskCompleted(taskId);
                  renderDashboard(); // Dashboard neu rendern, um Status zu aktualisieren
              });
          });
      } else {
          habitList.innerHTML = "<p>Keine Gewohnheiten für heute. Füge welche in der Projektansicht hinzu.</p>";
      }
  }

  // 4. Quick-Add-Widget Funktionalität
  const quickAddWidget = document.getElementById("quick-add-widget");
  if (quickAddWidget) {
      const input = quickAddWidget.querySelector(".inbox-input");
      const addButton = quickAddWidget.querySelector(".button-icon");

      addButton.addEventListener("click", async () => {
          const text = input.value.trim();
          if (text) {
              await database.addTask({ text });
              showToast(`"${text}" zur Inbox hinzugefügt.`);
              input.value = "";
          }
      });
  }
}

function renderProjects() {
  // Teil 1: Projekte-Grid rendern
  const grid = document.getElementById("projects-grid-projects");
  if (grid) {
    grid.innerHTML = "";
    database.getProjects().forEach((project) => {
      grid.innerHTML += createProjectCardHtml(project);
    });
    addProjectCardListeners();
  }

  // Teil 2: Alle offenen Aufgaben (Backlog) rendern
  const list = document.getElementById("all-tasks-list");
  if (list) {
    const openTasks = database.getTasks().filter(task => !task.completed);

    if (openTasks.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>Fantastisch! Keine offenen Aufgaben mehr.</p></div>`;
      return;
    }

    list.innerHTML = openTasks.map(task => {
      const project = task.projectId ? database.getProjectById(task.projectId) : null;
      return `
        <div class="today-task-item" data-task-id="${task.id}">
          <div class="task-info">
            <span class="task-checkbox"><span class="material-icons">check_box_outline_blank</span></span>
            <span class="task-text">${task.text}</span>
            ${project ? `<a href="#" class="task-project-link" data-project-id="${project.id}">${project.title}</a>` : '<span class="task-project-link">Inbox</span>'}
          </div>
          <div class="task-actions">
            <button class="button-icon start-task-timer" title="Timer für diese Aufgabe starten">
              <span class="material-icons">play_circle</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Event-Listener für die neuen Task-Elemente hinzufügen
    list.querySelectorAll('.task-checkbox').forEach(checkbox => {
      checkbox.addEventListener('click', (e) => {
        const taskId = e.target.closest('.today-task-item').dataset.taskId;
        database.toggleTaskCompleted(taskId).then(() => renderProjects());
      });
    });

    list.querySelectorAll('.task-project-link').forEach(link => {
      if(link.dataset.projectId) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          navigateTo('project-detail-content', { projectId: e.target.dataset.projectId });
        });
      }
    });
  }
}

function renderToday() {
  const list = document.getElementById("today-list");
  if (!list) return;

  const tasks = database.getTodayTasks();
  console.log("Tasks for renderToday:", tasks);

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
          ${project ? `<a href="#" class="task-project-link" data-project-id="${project.id}">${project.title}</a>` : '<span class="task-project-link">Inbox</span>'}
        </div>
        <div class="task-actions">
          <span class="task-time">${task.start_time || ''}</span>
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

  // Make the list sortable
  new Sortable(list, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      onEnd: function (evt) {
          const movedTaskId = evt.item.dataset.taskId;
          recalculateAndUpdateTimes(list, movedTaskId);
      }
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

  const dailyReviewBtn = document.getElementById('start-daily-review-btn');
  if (dailyReviewBtn) {
      dailyReviewBtn.addEventListener('click', () => {
          const firstTask = database.getInboxTasks()[0];
          if (firstTask) {
              const now = new Date();
              const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
              startGtdWizard(firstTask.id, currentTime);
          } else {
              showToast("Deine Inbox ist bereits leer.");
          }
      });
  }

  const inboxInputField = document.getElementById('inbox-input-field');
  const inboxAddBtn = document.getElementById('inbox-add-btn');

  if (inboxAddBtn && inboxInputField) {
      inboxAddBtn.addEventListener('click', async () => {
          const text = inboxInputField.value.trim();
          if (text) {
              await database.addTask({ text: text });
              inboxInputField.value = '';
              renderInbox(); // Re-render inbox to show new task
              showToast(`"${text}" zur Inbox hinzugefügt.`);
          }
      });
  }
}

function renderTimeline() {
  // Part 1: Render completed tasks statistics
  const completedTasks = database.getTasks().filter(t => t.completed && t.completed_at);
  const now = new Date();
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const completedThisWeek = completedTasks.filter(t => new Date(t.completed_at) >= startOfWeek).length;
  const completedThisMonth = completedTasks.filter(t => new Date(t.completed_at) >= startOfMonth).length;
  const completedThisYear = completedTasks.filter(t => new Date(t.completed_at) >= startOfYear).length;

  document.getElementById("completed-week").textContent = completedThisWeek;
  document.getElementById("completed-month").textContent = completedThisMonth;
  document.getElementById("completed-year").textContent = completedThisYear;
  document.getElementById("completed-total").textContent = completedTasks.length;

  // Part 2: Render active project statistics
  const projectsGrid = document.getElementById("timeline-projects-grid");
  if (projectsGrid) {
    const activeProjects = database.getActiveProjects();
    if (activeProjects.length > 0) {
        projectsGrid.innerHTML = activeProjects.map(p => createProjectCardHtml(p)).join('');
    } else {
        projectsGrid.innerHTML = `<div class="empty-state"><p>Keine aktiven Projekte.</p></div>`;
    }
  }

  // Part 3: Render chronological timeline of events (optional, can be expanded later)
  const eventsContainer = document.getElementById("timeline-events");
  if (eventsContainer) {
      eventsContainer.innerHTML = completedTasks
          .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
          .slice(0, 10) // Show last 10 completed tasks
          .map(task => `
              <div class="inbox-item">
                  <div class="inbox-item-main">
                      <div class="inbox-item-text">${task.text}</div>
                      <div class="inbox-item-meta">Erledigt: ${formatRelativeTime(new Date(task.completed_at))}</div>
                  </div>
              </div>
          `).join('');
  }
}

function renderSettings() {
  const tabLinks = document.querySelectorAll(".tab-link");
  const tabContents = document.querySelectorAll(".tab-content");

  tabLinks.forEach(link => {
      link.addEventListener("click", () => {
          const tabId = link.dataset.tab;

          tabLinks.forEach(l => l.classList.remove("active"));
          link.classList.add("active");

          tabContents.forEach(content => {
              if (content.id === tabId) {
                  content.classList.add("active");
              } else {
                  content.classList.remove("active");
              }
          });
      });
  });

  // Add logic for save button, day picker, etc. as needed
  const saveButton = document.getElementById('save-settings-btn');
  if(saveButton) {
      saveButton.addEventListener('click', () => {
          // In a real app, you would collect all settings and save them.
          showToast("Einstellungen gespeichert!");
      });
  }
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
            <div class="card-header">
                <h3 class="project-title">${project.title}</h3>
                <div class="card-menu-container">
                    <span class="material-icons card-menu">more_horiz</span>
                    <div class="card-dropdown-menu hidden">
                        <a href="#" class="dropdown-item" data-action="edit">Bearbeiten</a>
                        <a href="#" class="dropdown-item" data-action="archive">Archivieren</a>
                    </div>
                </div>
            </div>
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
    const menuButton = card.querySelector('.card-menu');
    const dropdownMenu = card.querySelector('.card-dropdown-menu');

    // Click on the card itself navigates to project details
    card.addEventListener("click", (e) => {
      if (!menuButton.contains(e.target)) {
        navigateTo("project-detail-content", {
          projectId: card.dataset.projectId,
        });
      }
    });

    // Click on the menu icon toggles the dropdown
    menuButton.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent card click event
        dropdownMenu.classList.toggle('hidden');
    });
  });

  // Hide dropdowns when clicking anywhere else
  document.addEventListener('click', function(event) {
    const openMenus = document.querySelectorAll('.card-dropdown-menu:not(.hidden)');
    openMenus.forEach(menu => {
        if (!menu.parentElement.contains(event.target)) {
            menu.classList.add('hidden');
        }
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
  document.querySelectorAll(".process-item-btn").forEach((button) => {
    button.addEventListener("click", (e) => {
      const taskId = e.target.closest(".inbox-item").dataset.taskId;
      startGtdWizard(taskId);
    });
  });

  document.querySelectorAll(".delete-item-btn").forEach((button) => {
    button.addEventListener("click", async (e) => {
      const taskId = e.target.closest(".inbox-item").dataset.taskId;
      if (confirm("Möchtest du diesen Eintrag wirklich löschen?")) {
        await database.deleteTask(taskId);
        renderInbox(); // Inbox neu laden
        showToast("Eintrag gelöscht.");
      }
    });
  });
}

async function recalculateAndUpdateTimes(listElement, movedTaskId) {
    const taskItems = Array.from(listElement.children);
    const movedIndex = taskItems.findIndex(item => item.dataset.taskId === movedTaskId);

    if (movedIndex === -1) return;

    // Find the start time for the moved task. 
    // If it's the first task, it can start now. Otherwise, after the previous one.
    let previousTaskEndTime = new Date(); // Default to now

    if (movedIndex > 0) {
        const prevTaskId = taskItems[movedIndex - 1].dataset.taskId;
        const prevTask = database.getTaskById(prevTaskId);
        if (prevTask && prevTask.start_time) {
            const [hours, minutes] = prevTask.start_time.split(':').map(Number);
            const prevStartTime = new Date();
            prevStartTime.setHours(hours, minutes, 0, 0);
            // Assume a default duration of 30 minutes for each task
            previousTaskEndTime = new Date(prevStartTime.getTime() + 30 * 60000);
        }
    }

    // Now, update the moved task and all subsequent tasks
    for (let i = movedIndex; i < taskItems.length; i++) {
        const currentTaskId = taskItems[i].dataset.taskId;
        let newStartTime = previousTaskEndTime;

        // Round to nearest 15 minutes
        const roundedMinutes = Math.round(newStartTime.getMinutes() / 15) * 15;
        newStartTime.setMinutes(roundedMinutes, 0, 0);

        const newStartTimeString = `${newStartTime.getHours().toString().padStart(2, '0')}:${newStartTime.getMinutes().toString().padStart(2, '0')}`;

        await database.updateTask(currentTaskId, { start_time: newStartTimeString });

        // The next task starts after this one finishes
        previousTaskEndTime = new Date(newStartTime.getTime() + 30 * 60000);
    }

    renderToday(); // Re-render to show the updated times
}
