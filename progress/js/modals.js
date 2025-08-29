// ===================================================================
// MODAL LOGIC
// Dieses Modul verwaltet alle Modals/Overlays, wie z.B. das Quick-Add-Fenster.
// ===================================================================

function initializeQuickAdd() {
    const quickAddBtn = document.getElementById('quick-add-btn');
    const closeBtn = document.getElementById('close-quick-add-btn');
    const saveBtn = document.getElementById('save-quick-add-btn');
    const modal = document.getElementById('quick-add-modal');

    if (quickAddBtn) quickAddBtn.addEventListener('click', openQuickAddModal);
    if (closeBtn) closeBtn.addEventListener('click', closeQuickAddModal);
    if (saveBtn) saveBtn.addEventListener('click', saveQuickAddItem);

    // Schließt das Modal, wenn außerhalb geklickt wird
    if (modal) modal.addEventListener('click', (e) => {
        if (e.target === modal) closeQuickAddModal();
    });
}

function openQuickAddModal() {
    const modal = document.getElementById('quick-add-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('quick-add-input').focus();
    }
}

function closeQuickAddModal() {
    const modal = document.getElementById('quick-add-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.getElementById('quick-add-input').value = '';
    }
}

function saveQuickAddItem() {
    const input = document.getElementById('quick-add-input');
    const text = input.value.trim();
    if (text) {
        database.addTask({ text: text });
        closeQuickAddModal();
        // Wenn wir in der Inbox sind, die Ansicht neu laden
        if (currentView === 'inbox-content') {
             renderInbox(); // Funktion aus viewManager.js
        }
    }
}
