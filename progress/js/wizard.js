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
        goal: null, context_id: null, wizardType: null, milestones: [], aiPlan: null
    };

    let wizardStep = 0;
    let totalSteps = 4; // Standard für manuellen Pfad

    const wizardModal = document.getElementById('wizard-modal');
    if (!wizardModal) return;
    const footer = wizardModal.querySelector('.wizard-nav');

    function updateWizardUI() {
        const progressContainer = wizardModal.querySelector('.progress-bar');
        const prevButtonHTML = `<button type="button" id="prev-button" class="button-wizard secondary"><span class="material-icons">arrow_back</span><span>Zurück</span></button>`;
        const nextButtonHTML = `<button type="button" id="next-button" class="button-wizard"><span>Weiter</span><span class="material-icons">arrow_forward</span></button>`;
        
        // Reset footer and hide all steps
        footer.innerHTML = '';
        wizardModal.querySelectorAll('.wizard-step').forEach(step => step.classList.add('hidden'));

        if (wizardStep === 'ai-feedback') {
            progressContainer.style.display = 'none';
            wizardModal.querySelector(`#step-ai-feedback`).classList.remove('hidden');
            
            // Add Discard and Accept buttons
            footer.innerHTML = `
                <button type="button" id="discard-ai-plan" class="button-wizard secondary"><span class="material-icons">close</span><span>Verwerfen</span></button>
                <button type="button" id="accept-ai-plan" class="button-wizard"><span class="material-icons">check</span><span>Akzeptieren & Erstellen</span></button>
            `;
            wizardModal.querySelector('#discard-ai-plan').addEventListener('click', closeWizard);
            wizardModal.querySelector('#accept-ai-plan').addEventListener('click', saveAiProject);

        } else if (newProjectData.wizardType === 'ai') {
            progressContainer.style.display = 'none';
            wizardModal.querySelector(`#step-1`).classList.remove('hidden');
            footer.innerHTML = nextButtonHTML;
        } else {
            progressContainer.style.display = 'block';
            wizardModal.querySelector(`#step-${wizardStep}`)?.classList.remove('hidden');
            footer.innerHTML = prevButtonHTML + nextButtonHTML;
        }

        const progressLabel = wizardModal.querySelector('#progress-label');
        const progressFill = wizardModal.querySelector('#progress-fill');
        if (progressLabel) progressLabel.textContent = `Schritt ${wizardStep + 1} von ${totalSteps}`;
        if (progressFill) progressFill.style.width = `${((wizardStep + 1) / totalSteps) * 100}%`;
        
        const prevButton = wizardModal.querySelector('#prev-button');
        if (prevButton) {
            prevButton.classList.toggle('hidden', wizardStep === 0);
            prevButton.addEventListener('click', prevStep);
        }

        const nextButton = wizardModal.querySelector('#next-button');
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
            nextButton.addEventListener('click', nextStep);
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
    wizardModal.querySelector('#add-milestone-btn')?.addEventListener('click', addMilestoneInput);

    wizardModal.querySelector('#milestones-container, #ai-plan-container')?.addEventListener('click', (e) => {
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
    
    if (aiResult && aiResult.id) {
        newProjectData.aiPlan = aiResult;
        wizardStep = 'ai-feedback'; // Set a special step name
        updateWizardUI();
        renderAiFeedback(aiResult);
    } else {
        showToast('❌ Die KI konnte keinen Plan für dieses Ziel erstellen.');
        closeWizard();
    }
}

function renderAiFeedback(plan) {
    const container = document.getElementById('ai-plan-container');
    if (!container) return;

    container.innerHTML = `
        <div class="input-group">
            <label for="ai-project-title">Projekttitel</label>
            <input type="text" id="ai-project-title" class="wizard-input" value="${plan.id}">
        </div>
        <div class="input-group" style="margin-top: 16px;">
            <label>Aufgaben</label>
            <div id="ai-tasks-list" class="milestones-input-container">
                ${plan.tasks.map(task => `
                    <div class="milestone-input-group">
                        <input type="text" class="milestone-input ai-task-input" value="${task.text}">
                        <button type="button" class="button-icon remove-milestone-btn" title="Entfernen">
                            <span class="material-icons">delete_outline</span>
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

async function saveAiProject() {
    const newTitle = document.getElementById('ai-project-title').value;
    const taskInputs = document.querySelectorAll('.ai-task-input');
    const tasks = Array.from(taskInputs).map(input => ({ text: input.value.trim() })).filter(task => task.text);

    if (!newTitle || tasks.length === 0) {
        showToast('❌ Bitte gib einen Titel und mindestens eine Aufgabe an.');
        return;
    }

    const projectToCreate = { title: newTitle };
    const newProject = await database.addProject(projectToCreate);

    if (newProject) {
        for (const task of tasks) {
            await database.addTask({ text: task.text, projectId: newProject.id });
        }
        showToast('✅ KI-Projekt und Aufgaben erfolgreich erstellt!');
        closeWizard();
        navigateTo('project-detail-content', { projectId: newProject.id });
    } else {
        showToast('❌ Fehler beim Speichern des KI-Projekts.');
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

async function startGtdWizard(taskId, initialStartTime = null) {
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
        deadline: new Date().toISOString().split('T')[0], // Set default to today
        startTime: initialStartTime || null,
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
            try {
                const noteTitle = gtdWizardState.originalTaskText; // Use original task text as note title
                const noteContent = gtdWizardState.originalTaskText; // Use original task text as note content
                const response = await fetch('http://localhost:3000/api/create-shared-note', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: noteTitle, content: noteContent })
                });
                if (response.ok) {
                    showToast("Eintrag als Notiz in Now erstellt.");
                    // Do not delete from Progress inbox, just update its status
                    await database.updateTask(gtdWizardState.taskId, { isNote: true, projectId: null, scheduled_at: null, delegated_to: null });
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "Unbekannter Fehler");
                }
            } catch (error) {
                console.error("Fehler beim Erstellen der Notiz in Now:", error);
                showToast(`Fehler: ${error.message}. Konnte Notiz nicht in Now erstellen.`);
            }
            processNextInboxTask(); // Process next inbox task
            return;
        case 'is_trash':
            if (confirm(`Möchtest du "${gtdWizardState.originalTaskText}" wirklich löschen?`)) {
                await database.deleteTask(gtdWizardState.taskId);
                showToast("Eintrag gelöscht.");
                processNextInboxTask(); // Process next inbox task
            }
            return;
        case 'do_it_now':
            await database.updateTask(gtdWizardState.taskId, { completed: true, scheduled_at: new Date().toISOString().slice(0, 10) });
            showToast("Aufgabe sofort erledigt!");
            // Do not delete from inbox, it's completed and will be filtered out
            processNextInboxTask(); // Process next inbox task
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
                gtdWizardState.currentStep = 7; // Gehe direkt zum Terminieren-Schritt
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

    // If a deadline is set, assume it's scheduled for that day
    if (updateData.deadline) {
        updateData.scheduled_at = updateData.deadline;
    }

    // Wenn delegiert, aber keine Person angegeben, bleibe im Schritt
    if (gtdWizardState.currentStep === 6 && gtdWizardState.delegatedTo === null && gtdWizardModal.querySelector('#gtd-delegate-input-container').classList.contains('hidden') === false) {
        showToast('Bitte gib an, an wen du delegierst.');
        return;
    }

    await database.updateTask(gtdWizardState.taskId, updateData);
    showToast('Aufgabe erfolgreich geplant!');

    const remainingInboxTasks = database.getInboxTasks();
    if (remainingInboxTasks.length > 0) {
        startGtdWizard(remainingInboxTasks[0].id); // Start wizard for next task
    } else {
        closeGtdWizard();
        renderInbox(); // Re-render inbox to show it's empty
        showToast("Inbox erfolgreich verarbeitet! Alle Einträge erledigt.");
        navigateTo('today-content'); // Navigate to today view after processing all
    }
}

function updateGtdWizardUI() {
    const currentStepEl = gtdWizardModal.querySelector(`#gtd-step-${gtdWizardState.currentStep}`);
    gtdWizardModal.querySelectorAll('.wizard-step').forEach(step => step.classList.add('hidden'));
    if (currentStepEl) currentStepEl.classList.remove('hidden');

    // Display current task text in step 1
    const gtdCurrentTaskTextSpan = gtdWizardModal.querySelector('#gtd-current-task-text');
    if (gtdCurrentTaskTextSpan) {
        gtdCurrentTaskTextSpan.textContent = gtdWizardState.originalTaskText;
    }

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

async function processNextInboxTask() {
    const remainingInboxTasks = database.getInboxTasks();
    if (remainingInboxTasks.length > 0) {
        startGtdWizard(remainingInboxTasks[0].id); // Start wizard for next task
    } else {
        closeGtdWizard();
        renderInbox(); // Re-render inbox to show it's empty
        showToast("Inbox erfolgreich verarbeitet! Alle Einträge erledigt.");
        navigateTo('today-content'); // Navigate to today view after processing all
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
