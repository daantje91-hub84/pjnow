// main.js
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron"); // "shell" hinzufügen
const path = require("path");
const fs = require("fs");
const jsyaml = require("js-yaml");

// (Der electron-reloader-Teil bleibt unverändert)
(async () => {
  try {
    const reloader = await import("electron-reloader");
    (reloader.default || reloader)(module);
  } catch (e) {
    console.warn("electron-reloader could not be loaded:", e);
  }
})();

function createWindow() {
  // ... (deine createWindow Funktion bleibt unverändert)
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile("index.html");
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(async () => {
  const { default: Store } = await import("electron-store");
  const store = new Store();

  // ... (deine bestehenden ipcMain.handle Aufrufe bleiben hier)
  ipcMain.handle("settings:get", (event, key) => store.get(key));
  ipcMain.handle("settings:set", (event, key, value) => store.set(key, value));

  ipcMain.handle("dialog:openDirectory", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (canceled) {
      return null;
    } else {
      return filePaths[0];
    }
  });

  ipcMain.handle("notes:load", (event, folderPath) => {
    try {
      const files = fs.readdirSync(folderPath);
      const notes = files
        .filter((file) => file.endsWith(".md"))
        .map((file) => {
          const filePath = path.join(folderPath, file);
          const content = fs.readFileSync(filePath, "utf-8");
          const id = file;

          let title = "Unbenannte Notiz";
          let noteContent = content;
          let metadata = {};

          const frontmatterMatch = content.match(/^-{3}\n([\s\S]*?)\n---/);
          if (frontmatterMatch) {
            try {
              metadata = jsyaml.load(frontmatterMatch[1]) || {};
              noteContent = content.substring(frontmatterMatch[0].length).trim();
            } catch (e) {
              console.error(`Fehler beim Parsen von YAML in ${file}:`, e);
            }
          }

          const titleMatch = noteContent.match(/^#\s+(.*)/);
          if (titleMatch) {
            title = titleMatch[1];
            noteContent = noteContent.substring(titleMatch[0].length).trim();
          }

          return { id, title, content: noteContent, metadata };
        });
      return notes;
    } catch (error) {
      console.error("Fehler beim Laden der Notizen:", error);
      return [];
    }
  });

  ipcMain.handle("notes:save", (event, { filePath, content, metadata }) => {
    try {
      let fileContent = "";
      if (metadata && Object.keys(metadata).length > 0) {
        fileContent += `---\n${jsyaml.dump(metadata)}---\n\n`;
      }
      fileContent += content;
      fs.writeFileSync(filePath, fileContent, "utf-8");
      return { success: true };
    } catch (error) {
      console.error("Fehler beim Speichern der Notiz:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("notes:buildIndex", (event, notes) => {
    const nodes = notes.map((note) => ({
      id: note.id,
      label: note.title,
      group: note.metadata?.typ || "Notiz",
    }));

    const edges = [];
    const contextTree = {};

    notes.forEach((note) => {
      const explicitLinkRegex = /@(\w+)/g;
      let match;
      while ((match = explicitLinkRegex.exec(note.content)) !== null) {
        const targetTitle = match[1];
        const targetNote = notes.find(
          (n) => n.title.toLowerCase() === targetTitle.toLowerCase()
        );
        if (targetNote && targetNote.id !== note.id) {
          edges.push({
            from: note.id,
            to: targetNote.id,
            type: "explicit",
          });
        }
      }

      const contextRegex = /#([\w\/]+)/g;
      while ((match = contextRegex.exec(note.content)) !== null) {
        const contextPath = match[1];
        const parts = contextPath.split("/");
        let currentLevel = contextTree;

        parts.forEach((part) => {
          if (!currentLevel[part]) {
            currentLevel[part] = { notes: [], children: {} };
          }
          currentLevel = currentLevel[part];
        });
        if (!currentLevel.notes.includes(note.id)) {
          currentLevel.notes.push(note.id);
        }
      }
    });

    return { nodes, edges, contexts: contextTree };
  });

  // NEUER HANDLER: Lauscht auf die Anfrage vom Frontend und öffnet die URL sicher.
  ipcMain.on("open-external-url", (event, url) => {
    shell.openExternal(url);
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
