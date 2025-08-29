// ===================================================================
// WIZARD LOGIC
// Dieses Modul enthält die Logik für mehrstufige Prozesse wie die
// Projekterstellung und die Inbox-Verarbeitung.
// ===================================================================

// ===================================================================
// TEIL 1: PROJEKTERSTELLUNGS-WIZARD
// Event-Delegation für die Wizard-Trigger, da die Buttons dynamisch geladen werden.
// ===================================================================

document.body.addEventListener('click', function(event) {
    const wizardButton = event.target.closest('#open-wizard-btn, #open-wizard-btn-filled, #open-wizard-btn-projects');
    if (wizardButton) {
        startProjectWizard();
    }
});

function closeWizard() {
    document.getElementById('wizard-modal')?.remove();
}

async function startProjectWizard() {
    closeWizard();
    closeGtdWizard(); // Stellt sicher, dass der GTD-Wizard geschlossen ist
    try {
        const response = await fetch('views/wizard_content.html');
        if (!response.ok) throw new Error('Wizard-Datei nicht gefunden');
        document.body.insertAdjacentHTML('beforeend', await response.text());
        initializeWizard();
    } catch (error) {
        console.error("Fehler beim Laden des Wizards:", error);
    }
}

function initializeWizard() {
    newProjectData = {
        goal: null, context_id: null, wizardType: null, milestones: []
    };

    let wizardStep = 0;
    let totalSteps = 4; // Standard für manuellen Pfad

    const wizardModal = document.getElementById('wizard-modal');
    if (!wizardModal) return;

    function updateWizardUI() {
        const progressContainer = wizardModal.querySelector('.progress-bar');
        const progressLabel = wizardModal.querySelector('#progress-label');
        const progressFill = wizardModal.querySelector('#progress-fill');
        const prevButton = wizardModal.querySelector('#prev-button');
        const nextButton = wizardModal.querySelector('#next-button');
        
        wizardModal.querySelectorAll('.wizard-step').forEach(step => step.classList.add('hidden'));
        
        // Logik zur Anzeige der Schritte basierend auf dem Wizard-Typ
        if (newProjectData.wizardType === 'ai') {
            progressContainer.style.display = 'none'; // Keine Schritte für KI
            wizardModal.querySelector(`#step-1`).classList.remove('hidden'); // Nur Zieleingabe
        } else {
            progressContainer.style.display = 'block';
            wizardModal.querySelector(`#step-${wizardStep}`)?.classList.remove('hidden');
        }

        if (progressLabel) progressLabel.textContent = `Schritt ${wizardStep + 1} von ${totalSteps}`;
        if (progressFill) progressFill.style.width = `${((wizardStep + 1) / totalSteps) * 100}%`;
        if (prevButton) prevButton.classList.toggle('hidden', wizardStep === 0 || newProjectData.wizardType === 'ai');
        
        if (nextButton) {
            let isEnabled = false;
            let buttonText = "Weiter";
            let buttonIcon = "arrow_forward";

            if (newProjectData.wizardType === 'ai') {
                isEnabled = newProjectData.goal && newProjectData.goal.length >= 10;
                buttonText = "Projekt mit KI erstellen";
                buttonIcon = "auto_awesome";
            } else {
                 switch(wizardStep) {
                    case 0: isEnabled = newProjectData.wizardType === 'manual'; break;
                    case 1: isEnabled = newProjectData.goal && newProjectData.goal.length >= 5; break;
                    case 2: isEnabled = newProjectData.context_id !== null; break;
                    case 3:
                        isEnabled = true;
                        buttonText = "Projekt erstellen";
                        buttonIcon = "check_circle_outline";
                        break;
                }
            }
            nextButton.disabled = !isEnabled;
            nextButton.innerHTML = `<span>${buttonText}</span><span class="material-icons">${buttonIcon}</span>`;
        }
    }
    
    async function nextStep() {
        if (newProjectData.wizardType === 'ai') {
            await createProjectWithAI();
            return;
        }

        if (wizardStep < totalSteps - 1) {
            wizardStep++;
            if (wizardStep === 2) {
                populateContextOptions();
            }
            updateWizardUI();
        } else {
            await createNewManualProject();
        }
    }
    
    function prevStep() {
        if (wizardStep > 0) {
            wizardStep--;
            updateWizardUI();
        }
    }

    function addMilestoneInput() {
        const container = wizardModal.querySelector('#milestones-container');
        if (!container) return;
        const newMilestoneHTML = `
            <div class="milestone-input-group">
                <input type="text" class="milestone-input" name="milestone" placeholder="z.B. Grundlagen recherchieren">
                <button type="button" class="button-icon remove-milestone-btn" title="Entfernen">
                    <span class="material-icons">delete_outline</span>
                </button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', newMilestoneHTML);
    }

    // --- Event Listeners ---
    wizardModal.querySelector('#close-wizard-btn')?.addEventListener('click', closeWizard);
    wizardModal.querySelector('#prev-button')?.addEventListener('click', prevStep);
    wizardModal.querySelector('#next-button')?.addEventListener('click', nextStep);
    wizardModal.querySelector('#add-milestone-btn')?.addEventListener('click', addMilestoneInput);

    wizardModal.querySelector('#milestones-container')?.addEventListener('click', (e) => {
        if (e.target.closest('.remove-milestone-btn')) {
            e.target.closest('.milestone-input-group').remove();
        }
    });

    const step0 = wizardModal.querySelector('#step-0');
    if (step0) {
        step0.addEventListener('click', (e) => {
            const typeBtn = e.target.closest('[data-wizard-type]');
            if (typeBtn) {
                step0.querySelectorAll('.option-button').forEach(btn => btn.classList.remove('selected'));
                typeBtn.classList.add('selected');
                newProjectData.wizardType = typeBtn.dataset.wizardType;
                
                if (newProjectData.wizardType === 'manual') {
                    wizardStep = 1; // Springe zum nächsten Schritt
                }
                updateWizardUI();
            }
        });
    }
    
    wizardModal.querySelector('#goal-input')?.addEventListener('input', (e) => {
        newProjectData.goal = e.target.value;
        updateWizardUI();
    });
    
    wizardModal.querySelector('#context-options')?.addEventListener('click', (e) => {
        const contextBtn = e.target.closest('[data-value]');
        if (contextBtn) {
            wizardModal.querySelectorAll('#context-options .option-button').forEach(btn => btn.classList.remove('selected'));
            contextBtn.classList.add('selected');
            newProjectData.context_id = contextBtn.dataset.value;
            updateWizardUI();
        }
    });
    
    wizardModal.classList.remove('hidden');
    updateWizardUI();
}

function populateContextOptions() {
    const container = document.getElementById('context-options');
    if (!container) return;
    // Annahme: database.contexts ist verfügbar. Ggf. muss dies aus der DB geladen werden.
    const contexts = [{id: 'ctx_1', emoji: '🏃', title: 'Fitness'}, {id: 'ctx_2', emoji: '🏠', title: 'Zuhause'}, {id: 'ctx_4', emoji: '♟️', title: 'Lernen'}];
    container.innerHTML = contexts.map(context => 
        `<button type="button" class="option-button" data-value="${context.id}">${context.emoji} ${context.title}</button>`
    ).join('');
}

async function createNewManualProject() {
    if (!newProjectData.goal) return null;

    const milestoneInputs = document.querySelectorAll('#milestones-container .milestone-input');
    const milestones = Array.from(milestoneInputs)
        .map(input => input.value.trim())
        .filter(text => text.length > 0)
        .map(text => ({ title: text }));

    if (milestones.length === 0) {
        milestones.push({ title: 'Erster Meilenstein' });
    }

    const projectToCreate = {
        title: newProjectData.goal,
        context_id: newProjectData.context_id,
        // milestones werden aktuell nicht im Backend gespeichert, aber die Struktur ist hier
    };

    const newProject = await database.addProject(projectToCreate);
    closeWizard();
    if (newProject) {
        navigateTo('project-detail-content', { projectId: newProject.id });
    }
    return newProject;
}

async function createProjectWithAI() {
    if (!newProjectData.goal) return;

    showToast('🤖 KI analysiert dein Ziel und erstellt einen Plan...');
    const aiResult = await database.processGoalWithAI(newProjectData.goal);
    closeWizard();

    if (aiResult && aiResult.id) {
        // Annahme: Die KI gibt ein Projekt-ähnliches Objekt zurück.
        // Wir erstellen das Projekt und die zugehörigen Aufgaben.
        const projectToCreate = { title: aiResult.id };
        const newProject = await database.addProject(projectToCreate);

        if (newProject && aiResult.tasks && aiResult.tasks.length > 0) {
            for (const task of aiResult.tasks) {
                await database.addTask({ text: task.text, projectId: newProject.id });
            }
            showToast('✅ KI-Projekt und Aufgaben erfolgreich erstellt!');
            navigateTo('project-detail-content', { projectId: newProject.id });
        } else if (newProject) {
            showToast('✅ KI-Projekt erfolgreich erstellt!');
            navigateTo('project-detail-content', { projectId: newProject.id });
        } else {
            showToast('❌ Fehler beim Speichern des KI-Projekts.');
        }
    } else {
        showToast('❌ Die KI konnte keinen Plan für dieses Ziel erstellen.');
    }
}


// ===================================================================
// TEIL 2: INBOX-VERARBEITUNGS-WIZARD (GTD-Wizard)
// ===================================================================

let gtdWizardState = {};
let gtdWizardModal;

function closeGtdWizard() {
    gtdWizardModal?.remove();
    gtdWizardState = {}; // Zustand zurücksetzen
}

async function startGtdWizard(taskId) {
    closeWizard(); // Sicherstellen, dass keine anderen Wizards offen sind
    closeGtdWizard(); // Sicherstellen, dass der GTD-Wizard nicht doppelt offen ist

    const task = database.getTaskById(taskId);
    if (!task) {
        console.error("Task für GTD-Verarbeitung nicht gefunden.");
        return;
    }

    // Initialisiere den Zustand für diesen Wizard
    gtdWizardState = {
        currentStep: 1,
        taskId: taskId,
        originalTaskText: task.text,
        currentTaskText: task.text, // Der Text, der im Wizard bearbeitet wird
        projectId: task.projectId, // Falls schon einem Projekt zugeordnet
        delegatedTo: null,
        deadline: null,
        startTime: null,
        isNewProject: false, // Flag, ob ein neues Projekt erstellt wird
        selectedProjectId: null, // Das ausgewählte Projekt im Schritt 5
    };

    try {
        const response = await fetch('views/gtd_wizard_content.html');
        if (!response.ok) throw new Error('GTD-Wizard-Datei nicht gefunden');
        document.body.insertAdjacentHTML('beforeend', await response.text());
        
        gtdWizardModal = document.getElementById('gtd-wizard-modal');
        if (!gtdWizardModal) return;

        // Event-Listener für alle Aktionen im Wizard
        gtdWizardModal.addEventListener('click', handleGtdWizardAction);
        gtdWizardModal.querySelector('#gtd-close-wizard-btn').addEventListener('click', closeGtdWizard);
        gtdWizardModal.querySelector('#gtd-prev-button').addEventListener('click', () => navigateGtdWizard(-1));
        gtdWizardModal.querySelector('#gtd-next-button').addEventListener('click', () => navigateGtdWizard(1));
        gtdWizardModal.querySelector('#gtd-finish-button').addEventListener('click', finishGtdWizard);

        // Input-Felder überwachen
        gtdWizardModal.querySelector('#gtd-task-text-input')?.addEventListener('input', (e) => {
            gtdWizardState.currentTaskText = e.target.value;
            updateGtdWizardUI();
        });
        gtdWizardModal.querySelector('#gtd-delegated-to-input')?.addEventListener('input', (e) => {
            gtdWizardState.delegatedTo = e.target.value;
            updateGtdWizardUI();
        });
        gtdWizardModal.querySelector('#gtd-deadline-input')?.addEventListener('change', (e) => {
            gtdWizardState.deadline = e.target.value;
            updateGtdWizardUI();
        });
        gtdWizardModal.querySelector('#gtd-start-time-input')?.addEventListener('change', (e) => {
            gtdWizardState.startTime = e.target.value;
            updateGtdWizardUI();
        });

        // Den ersten Schritt anzeigen
        updateGtdWizardUI();

    } catch (error) {
        console.error("Fehler beim Laden des GTD-Wizards:", error);
    }
}

async function handleGtdWizardAction(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    switch (action) {
        case 'is_task':
            gtdWizardState.currentStep = 2;
            break;
        case 'is_note':
            await database.updateTask(gtdWizardState.taskId, { isNote: true, projectId: null, scheduled_at: null });
            showToast("Eintrag als Notiz gespeichert.");
            closeGtdWizard();
            renderInbox();
            return;
        case 'is_trash':
            if (confirm(`Möchtest du "${gtdWizardState.originalTaskText}" wirklich löschen?`)) {
                await database.deleteTask(gtdWizardState.taskId);
                showToast("Eintrag gelöscht.");
                closeGtdWizard();
                renderInbox();
            }
            return;
        case 'do_it_now':
            await database.updateTask(gtdWizardState.taskId, { completed: true, scheduled_at: new Date().toISOString().slice(0, 10) });
            showToast("Aufgabe sofort erledigt!");
            closeGtdWizard();
            renderInbox();
            return;
        case 'defer_or_delegate':
            gtdWizardState.currentStep = 4;
            break;
        case 'assign_to_project':
            gtdWizardState.currentStep = 5;
            await populateProjectList();
            break;
        case 'single_task':
            gtdWizardState.currentStep = 6;
            break;
        case 'create_new_project_from_task':
            gtdWizardState.isNewProject = true;
            // Erstelle das Projekt und weise die Aufgabe zu
            const newProject = await database.addProject({ title: gtdWizardState.currentTaskText });
            if (newProject) {
                gtdWizardState.selectedProjectId = newProject.id;
                await database.updateTask(gtdWizardState.taskId, { projectId: newProject.id });
                showToast(`Projekt "${newProject.title}" erstellt und Aufgabe zugewiesen.`);
                gtdWizardState.currentStep = 6; // Gehe direkt zum Terminieren
            } else {
                showToast('Fehler beim Erstellen des Projekts.');
                // Bleibe im aktuellen Schritt oder gehe zurück
                return;
            }
            break;
        case 'do_it_myself':
            gtdWizardState.currentStep = 7;
            break;
        case 'delegate_task':
            // Zeige Eingabefeld für Delegierung
            gtdWizardState.currentStep = 7; // Gehe zum Abschluss
            gtdWizardModal.querySelector('#gtd-delegate-input-container').classList.remove('hidden');
            break;
        default:
            // Dynamische Projekt-Buttons im Schritt 5
            if (action.startsWith('select_project_')) {
                gtdWizardState.selectedProjectId = action.replace('select_project_', '');
                await database.updateTask(gtdWizardState.taskId, { projectId: gtdWizardState.selectedProjectId });
                showToast(`Aufgabe Projekt zugewiesen.`);
                gtdWizardState.currentStep = 6; // Gehe zum Terminieren
            }
            break;
    }
    updateGtdWizardUI();
}

function navigateGtdWizard(direction) {
    gtdWizardState.currentStep += direction;
    updateGtdWizardUI();
}

async function finishGtdWizard() {
    const updateData = {
        text: gtdWizardState.currentTaskText,
        projectId: gtdWizardState.selectedProjectId || null, // Falls kein Projekt gewählt wurde
        delegated_to: gtdWizardState.delegatedTo || null,
        deadline: gtdWizardState.deadline || null,
        start_time: gtdWizardState.startTime || null,
        completed: false // Standardmäßig nicht erledigt beim Planen
    };

    // Wenn delegiert, aber keine Person angegeben, bleibe im Schritt
    if (gtdWizardState.currentStep === 6 && gtdWizardState.delegatedTo === null && gtdWizardModal.querySelector('#gtd-delegate-input-container').classList.contains('hidden') === false) {
        showToast('Bitte gib an, an wen du delegierst.');
        return;
    }

    await database.updateTask(gtdWizardState.taskId, updateData);
    showToast('Aufgabe erfolgreich geplant!');
    closeGtdWizard();
    renderInbox(); // Inbox neu laden
    navigateTo('today-content'); // Oder zur Today-Ansicht navigieren
}

function updateGtdWizardUI() {
    const currentStepEl = gtdWizardModal.querySelector(`#gtd-step-${gtdWizardState.currentStep}`);
    gtdWizardModal.querySelectorAll('.wizard-step').forEach(step => step.classList.add('hidden'));
    if (currentStepEl) currentStepEl.classList.remove('hidden');

    const prevButton = gtdWizardModal.querySelector('#gtd-prev-button');
    const nextButton = gtdWizardModal.querySelector('#gtd-next-button');
    const finishButton = gtdWizardModal.querySelector('#gtd-finish-button');

    // Standard-Buttons ausblenden
    prevButton.classList.add('hidden');
    nextButton.classList.add('hidden');
    finishButton.classList.add('hidden');

    // Logik für die Sichtbarkeit der Buttons und Eingabefelder
    switch (gtdWizardState.currentStep) {
        case 1: // Klären
            // Keine Navigationsbuttons, nur Aktionsbuttons im HTML
            break;
        case 2: // Konkretisieren
            gtdWizardModal.querySelector('#gtd-task-text-input').value = gtdWizardState.currentTaskText;
            prevButton.classList.remove('hidden');
            nextButton.classList.remove('hidden');
            nextButton.disabled = gtdWizardState.currentTaskText.length < 5; // Mindestlänge
            break;
        case 3: // 2-Minuten-Regel
            // Keine Navigationsbuttons, nur Aktionsbuttons im HTML
            break;
        case 4: // Projekt oder Einzelaufgabe
            // Keine Navigationsbuttons, nur Aktionsbuttons im HTML
            break;
        case 5: // Projektliste
            prevButton.classList.remove('hidden');
            // nextButton bleibt hidden, da Auswahl über Projekt-Buttons erfolgt
            break;
        case 6: // Delegieren oder selbst erledigen
            prevButton.classList.remove('hidden');
            // nextButton bleibt hidden, da Auswahl über Aktionsbuttons erfolgt
            gtdWizardModal.querySelector('#gtd-delegate-input-container').classList.add('hidden'); // Standardmäßig ausblenden
            break;
        case 7: // Terminieren
            prevButton.classList.remove('hidden');
            finishButton.classList.remove('hidden');
            // Werte aus dem State in die Felder laden
            gtdWizardModal.querySelector('#gtd-deadline-input').value = gtdWizardState.deadline || '';
            gtdWizardModal.querySelector('#gtd-start-time-input').value = gtdWizardState.startTime || '';
            break;
    }

    gtdWizardModal.classList.remove('hidden');
}

async function populateProjectList() {
    const container = gtdWizardModal.querySelector('#gtd-project-list');
    if (!container) return;
    const projects = database.getActiveProjects(); // Oder alle Projekte, je nach Anforderung
    if (projects.length > 0) {
        container.innerHTML = projects.map(p => `
            <button type="button" class="option-button" data-action="select_project_${p.id}">
                ${p.title}
            </button>
        `).join('');
    } else {
        container.innerHTML = '<p>Du hast noch keine aktiven Projekte.</p>';
    }
}

// ===================================================================
// TEIL 3: HELFERFUNKTIONEN (aus altem Inbox-Wizard, ggf. anpassen)
// ===================================================================

// Diese Funktionen sind jetzt Teil des GTD-Wizards oder werden nicht mehr benötigt
// let processWizardState = {};
// function closeProcessWizard() { ... }
// async function startProcessWizard(taskId) { ... }
// function handleProcessWizardAction(e) { ... }
// function navigateProcessWizard(direction) { ... }
// function updateProcessWizardUI() { ... }
