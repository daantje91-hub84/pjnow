// ===================================================================
// NAVIGATIONSLOGIK
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Navigations-Menü für mobile Geräte einrichten
    const hamburgerBtn = document.getElementById('hamburger');
    if (hamburgerBtn) {
        if (window.innerWidth >= 768) {
            document.body.classList.add('sidenav-expanded');
        }
        hamburgerBtn.addEventListener('click', () => {
            document.body.classList.toggle('sidenav-expanded');
        });
    }

    // Event-Listener für die Hauptnavigation
    document.querySelectorAll('.app-nav .nav-item').forEach(navItem => {
        navItem.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(navItem.dataset.nav); 
        });
    });
});

/**
 * Aktualisiert den aktiven Zustand der Navigationslinks.
 */
function updateNavState() {
    document.querySelectorAll('.app-nav .nav-item').forEach(item => {
        item.classList.remove('active');
        const navTarget = item.dataset.nav;
        const currentView = window.currentView; // Zugriff auf globale Variable

        if (
            (navTarget === 'dashboard' && currentView.startsWith('dashboard')) ||
            (navTarget === 'projects-content' && currentView === 'project-detail-content') ||
            navTarget === currentView
        ) {
            item.classList.add('active');
        }
    });
}