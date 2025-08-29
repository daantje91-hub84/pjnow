// ===================================================================
// WIZARD LOGIC
// Dieses Modul enthält die Logik für mehrstufige Prozesse wie die
// Projekterstellung und die Inbox-Verarbeitung.
// ===================================================================

// ===================================================================
// TEIL 1: PROJEKTERSTELLUNGS-WIZARD
// ===================================================================

function setupWizardTriggers() {
    document.querySelectorAll('#open-wizard-btn, #open-wizard-btn-filled, #open-wizard-btn-projects').forEach(btn => {
        if(btn) btn.addEventListener('click', startProjectWizard);
    });
}

function closeWizard() {
    document.getElementById('wizard-modal')?.remove();
}

async function startProjectWizard() {
    closeWizard();
    closeProcessWizard(); // Stellt sicher, dass auch der andere Wizard geschlossen ist
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
    let totalSteps = 4;

    const wizardModal = document.getElementById('wizard-modal');
    if (!wizardModal) return;

    function updateWizardUI() {
        const progressLabel = wizardModal.querySelector('#progress-label');
        const progressFill = wizardModal.querySelector('#progress-fill');
        const prevButton = wizardModal.querySelector('#prev-button');
        const nextButton = wizardModal.querySelector('#next-button');
        
        wizardModal.querySelectorAll('.wizard-step').forEach(step => step.classList.add('hidden'));
        wizardModal.querySelector(`#step-${wizardStep}`)?.classList.remove('hidden');

        if (progressLabel) progressLabel.textContent = `Schritt ${wizardStep + 1} von ${totalSteps}`;
        if (progressFill) progressFill.style.width = `${((wizardStep + 1) / totalSteps) * 100}%`;
        if (prevButton) prevButton.classList.toggle('hidden', wizardStep === 0);
        
        if (nextButton) {
            let isEnabled = false;
            let buttonText = "Weiter";
            let buttonIcon = "arrow_forward";

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
            nextButton.disabled = !isEnabled;
            nextButton.innerHTML = `<span>${buttonText}</span><span class="material-icons">${buttonIcon}</span>`;
        }
    }
    
    function nextStep() {
        if (wizardStep < totalSteps - 1) {
            wizardStep++;
            if (wizardStep === 2) {
                populateContextOptions();
            }
            updateWizardUI();
        } else {
            const newProject = createNewProject();
            closeWizard();
            if (newProject) {
                navigateTo('project-detail-content', { projectId: newProject.id });
            }
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
            const typeBtn = e.target.closest('[data-wizard-type="manual"]');
            if (typeBtn) {
                step0.querySelectorAll('.option-button').forEach(btn => btn.classList.remove('selected'));
                typeBtn.classList.add('selected');
                newProjectData.wizardType = 'manual';
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
    container.innerHTML = database.contexts.map(context => 
        `<button type="button" class="option-button" data-value="${context.id}">${context.emoji} ${context.title}</button>`
    ).join('');
}

function createNewProject() {
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
        milestones: milestones
    };

    const newProject = database.addProject(projectToCreate);
    
    return newProject;
}


// ===================================================================
// TEIL 2: INBOX-VERARBEITUNGS-WIZARD
// ===================================================================

// Hält den Zustand des Wizards, während er geöffnet ist
let processWizardState = {};

function closeProcessWizard() {
    document.getElementById('process-wizard-modal')?.remove();
    processWizardState = {}; // Zustand zurücksetzen
}

async function startProcessWizard(taskId) {
    closeWizard(); // Sicherstellen, dass keine anderen Wizards offen sind
    const task = database.getTaskById(taskId);
    if (!task) {
        console.error("Task für Verarbeitung nicht gefunden.");
        return;
    }

    // Initialisiere den Zustand für diesen Wizard
    processWizardState = {
        currentStep: 1,
        taskId: taskId,
        taskText: task.text
    };

    try {
        const response = await fetch('views/inbox_wizard_content.html');
        if (!response.ok) throw new Error('Inbox-Wizard-Datei nicht gefunden');
        document.body.insertAdjacentHTML('beforeend', await response.text());
        
        const wizardModal = document.getElementById('process-wizard-modal');
        
        // UI-Elemente initialisieren
        wizardModal.querySelector('#process-wizard-task-text').textContent = processWizardState.taskText;
        
        // Event-Listener für alle Aktionen im Wizard
        wizardModal.addEventListener('click', handleProcessWizardAction);
        wizardModal.querySelector('#close-process-wizard-btn').addEventListener('click', closeProcessWizard);
        wizardModal.querySelector('#process-prev-button').addEventListener('click', () => navigateProcessWizard(-1));

        // Den ersten Schritt anzeigen
        updateProcessWizardUI();

    } catch (error) {
        console.error("Fehler beim Laden des Inbox-Wizards:", error);
    }
}

function handleProcessWizardAction(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    const { taskId } = processWizardState;

    switch (action) {
        case 'is_task':
            navigateProcessWizard(1); // Gehe zu Schritt 2
            break;
        case 'is_note':
            database.updateTask(taskId, { isNote: true });
            showToast("Eintrag als Notiz gespeichert.");
            closeProcessWizard();
            renderInbox();
            break;
        case 'trash':
            if (confirm(`Möchtest du "${processWizardState.taskText}" wirklich löschen?`)) {
                database.deleteTask(taskId);
                showToast("Eintrag gelöscht.");
                closeProcessWizard();
                renderInbox();
            }
            break;
        case 'new_project':
            // TODO: Logik zum Erstellen eines neuen Projekts aus dem Task
            alert('Funktion "Neues Projekt erstellen" kommt als nächstes.');
            closeProcessWizard();
            break;
        case 'single_task':
            navigateProcessWizard(1); // Gehe zu Schritt 3 (Projektzuordnung)
            break;
        case 'standalone_task':
            database.updateTask(taskId, { scheduled_at: new Date().toISOString().slice(0, 10) }); // Für heute planen
            showToast("Aufgabe für heute geplant.");
            closeProcessWizard();
            renderInbox();
            navigateTo('today-content');
            break;
        default:
             // Dynamische Projekt-Buttons
            if (action.startsWith('assign_to_project_')) {
                const projectId = action.replace('assign_to_project_', '');
                database.updateTask(taskId, { project_id: projectId });
                showToast(`Aufgabe zum Projekt "${database.getProjectById(projectId).title}" hinzugefügt.`);
                closeProcessWizard();
                renderInbox();
            }
            break;
    }
}

function navigateProcessWizard(direction) {
    processWizardState.currentStep += direction;
    updateProcessWizardUI();
}

function updateProcessWizardUI() {
    const wizardModal = document.getElementById('process-wizard-modal');
    if (!wizardModal) return;

    // Alle Schritte ausblenden
    wizardModal.querySelectorAll('.wizard-step').forEach(step => step.classList.add('hidden'));
    
    // Den aktuellen Schritt anzeigen
    const currentStepEl = wizardModal.querySelector(`#process-step-${processWizardState.currentStep}`);
    if (currentStepEl) currentStepEl.classList.remove('hidden');

    // Zurück-Button verwalten
    wizardModal.querySelector('#process-prev-button').classList.toggle('hidden', processWizardState.currentStep === 1);

    // Spezifische Logik für Schritt 3: Projektliste laden
    if (processWizardState.currentStep === 3) {
        const projectListContainer = wizardModal.querySelector('#project-list-container');
        const projects = database.getActiveProjects();
        if (projects.length > 0) {
            projectListContainer.innerHTML = projects.map(p => `
                <button type="button" class="option-button" data-action="assign_to_project_${p.id}">
                    ${database.getContextById(p.context_id)?.emoji || '📁'} ${p.title}
                </button>
            `).join('');
        } else {
            projectListContainer.innerHTML = '<p>Du hast noch keine aktiven Projekte.</p>';
        }
    }
}