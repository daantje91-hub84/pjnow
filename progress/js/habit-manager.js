function generateDailyHabitTasks() {
    const today = new Date();
    const todayString = today.toISOString().slice(0, 10);
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1=Mo, 7=So

    const habitsToGenerate = database.habits.filter(habit => {
        // Prüfen, ob für diesen Habit heute schon eine Aufgabe existiert
        const taskExists = database.tasks.some(task =>
            task.habit_id === habit.id && task.scheduled_at === todayString
        );
        if (taskExists) return false; // Nicht erneut generieren

        // Prüfen, ob der Habit heute fällig ist
        if (habit.recurrence_rule.frequency === 'daily') {
            if (!habit.recurrence_rule.days || habit.recurrence_rule.days.includes(dayOfWeek)) {
                return true;
            }
        }
        // Hier könnte später Logik für 'weekly', 'monthly' etc. folgen
        return false;
    });

    // Fällige Aufgaben erstellen
    habitsToGenerate.forEach(habit => {
        database.addTask({
            text: habit.text,
            scheduled_at: todayString,
            isHabit: true, // Behalten wir als Flag zur einfachen Identifizierung
            habit_id: habit.id // Die wichtige Verknüpfung!
        });
    });
}

// Diese Funktion muss beim App-Start aufgerufen werden:
document.addEventListener('DOMContentLoaded', () => {
    console.log("Progress Journal App wird initialisiert...");
    generateDailyHabitTasks(); // <-- HIER
    initializeQuickAdd();
    navigateTo('dashboard');
});