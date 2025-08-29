// js/api.js

const API_BASE_URL = "http://localhost:3000/api";

const api = {
  /**
   * Ruft alle Projekte vom Backend ab.
   * @returns {Promise<Array>} Ein Promise, das zu einem Array von Projekt-Objekten auflöst.
   */
  async getProjects() {
    try {
      const response = await fetch(`${API_BASE_URL}/projects`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Fehler beim Abrufen der Projekte:", error);
      return []; // Im Fehlerfall eine leere Liste zurückgeben
    }
  },

  /**
   * Ruft alle Aufgaben vom Backend ab.
   * @returns {Promise<Array>} Ein Promise, das zu einem Array von Aufgaben-Objekten auflöst.
   */
  async getTasks() {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Fehler beim Abrufen der Aufgaben:", error);
      return []; // Im Fehlerfall eine leere Liste zurückgeben
    }
  },

  // Hier können später weitere API-Funktionen hinzugefügt werden
  // z.B. createProject, updateTask, etc.
};
