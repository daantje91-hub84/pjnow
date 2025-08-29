// ===================================================================
// POMODORO TIMER LOGIC
// Dieses Modul steuert die gesamte Funktionalität des Pomodoro-Timers.
// ===================================================================

function startTimerForTask(taskId) {
    // Wenn der Timer für die geklickte Aufgabe bereits läuft, pausiere ihn.
    if (pomodoroTimer.isRunning && pomodoroTimer.activeTaskId === taskId) {
        startPauseTimer();
        return;
    }
    // Starte den Timer für eine neue Aufgabe.
    resetTimer();
    pomodoroTimer.activeTaskId = taskId;
    startPauseTimer();
    renderToday(); // Aktualisiert die Ansicht, um den "in-progress"-Status anzuzeigen
}

function startPauseTimer() {
    pomodoroTimer.isRunning = !pomodoroTimer.isRunning;
    const startPauseBtn = document.getElementById('start-pause-btn');

    if (pomodoroTimer.isRunning) {
        if(startPauseBtn) startPauseBtn.innerHTML = `<span class="material-icons">pause</span> Pause`;
        pomodoroTimer.interval = setInterval(tick, 1000);
    } else {
        if(startPauseBtn) startPauseBtn.innerHTML = `<span class="material-icons">play_arrow</span> Start`;
        clearInterval(pomodoroTimer.interval);
    }
    renderToday(); // Ruft die Render-Funktion aus dem viewManager auf
}

function resetTimer() {
    clearInterval(pomodoroTimer.interval);
    pomodoroTimer.isRunning = false;
    pomodoroTimer.timeLeft = pomodoroTimer.DEFAULT_TIME;
    pomodoroTimer.activeTaskId = null;
    
    const startPauseBtn = document.getElementById('start-pause-btn');
    if(startPauseBtn) startPauseBtn.innerHTML = `<span class="material-icons">play_arrow</span> Start`;
    
    updateTimerDisplay();
    // Prüfen, ob die renderToday Funktion verfügbar ist, um Fehler zu vermeiden
    if (typeof renderToday === 'function') {
        renderToday();
    }
}

function tick() {
    pomodoroTimer.timeLeft--;
    updateTimerDisplay();
    if (pomodoroTimer.timeLeft <= 0) {
        clearInterval(pomodoroTimer.interval);
        pomodoroTimer.isRunning = false;
        if (pomodoroTimer.activeTaskId) {
            const task = database.getTaskById(pomodoroTimer.activeTaskId);
            if (task) {
                database.updateTask(pomodoroTimer.activeTaskId, { pomodoro_completed: (task.pomodoro_completed || 0) + 1 });
            }
        }
        alert("Pomodoro-Einheit abgeschlossen! Zeit für eine Pause.");
        resetTimer(); 
    }
}

function updateTimerDisplay() {
    const timerDisplay = document.getElementById('timer-display');
    if (!timerDisplay) return;
    const minutes = Math.floor(pomodoroTimer.timeLeft / 60);
    const seconds = pomodoroTimer.timeLeft % 60;
    timerDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
