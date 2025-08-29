// app.js

document.addEventListener("DOMContentLoaded", () => {
  // DOM-Elemente
  const mainNav = document.getElementById("main-nav");
  const appViews = document.querySelectorAll(".app-view");
  const contextsContainer = document.getElementById("contexts-container");
  const tocContainer = document.getElementById("toc-container");
  const splashScreen = document.getElementById("splash-screen");
  const startText = document.getElementById("start-text");
  const appContainer = document.getElementById("now-app-container");
  const newNoteBtn = document.getElementById("new-note-btn");
  const noteTitleInput = document.getElementById("note-title");
  const noteContentInput = document.getElementById("note-content");
  const highlightLayer = document.getElementById("highlight-layer");
  const editorContainer = document.getElementById("editor-container");
  const placeholder = document.getElementById("placeholder");
  const bottomContainer = document.getElementById("bottom-container");
  const backlinksList = document.getElementById("backlinks-list");
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const sidebar = document.getElementById("sidebar");
  const graphContainer = document.getElementById("graph-container");
  const metadataContainer = document.getElementById("metadata-container");
  const kanbanBoard = document.getElementById("kanban-board");
  const processNoteBtn = document.getElementById("process-note-btn");
  const connectGoogleDriveBtn = document.getElementById("connect-google-drive-btn");
  const googleDriveStatus = document.getElementById("google-drive-status");

  let notesDirectory = null;
  let notes = [];
  let activeNoteId = null;
  let graphIndex = null;
  let isGoogleDriveConnected = false; // Status-Variable

  // --- FUNKTIONEN ---

  const switchView = (viewId) => {
    appViews.forEach((view) => view.classList.add("hidden"));
    const targetView = document.getElementById(viewId);
    if (targetView) {
      targetView.classList.remove("hidden");
    }
    sidebar.querySelectorAll(".nav-button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === viewId);
    });

    if (viewId === "graph-view") {
      renderGraphView();
    }
    if (viewId === "projects-view") {
      renderProjectsView();
    }
  };

  const displayNote = (id) => {
    const note = notes.find((n) => n.id === id);
    if (note) {
      placeholder.classList.add("hidden");
      editorContainer.classList.remove("hidden");
      bottomContainer.classList.remove("hidden");

      switchView("notes-view");
      activeNoteId = id;
      noteTitleInput.value = note.title;
      noteContentInput.value = note.content;
      highlightLayer.innerHTML = highlightSyntax(note.content);
      renderBacklinks(id);
      renderMetadataView(note.metadata);
    }
  };

  const clearEditor = () => {
    noteTitleInput.value = "";
    noteContentInput.value = "";
    highlightLayer.innerHTML = "";
    metadataContainer.innerHTML = "";
    backlinksList.innerHTML =
      '<li class="text-gray-500">Für neue Notizen gibt es noch keine Verknüpfungen.</li>';
  };

  const createNewNote = async (title = "", content = "") => {
    if (!notesDirectory) {
      alert("Bitte wähle zuerst einen Ordner für deine Notizen aus.");
      return;
    }
    if (!Array.isArray(notes)) {
      notes = [];
    }

    clearEditor();

    const newNoteId = `${Date.now()}.md`;
    const newNote = {
      id: newNoteId,
      title: title,
      content: content,
      metadata: {},
    };
    notes.push(newNote);
    activeNoteId = newNoteId;

    displayNote(newNoteId);
    await saveNote();
    await buildGraphIndex();

    noteTitleInput.focus();
    return newNoteId;
  };

  const updateGoogleDriveStatus = (isConnected) => {
    isGoogleDriveConnected = isConnected;
    if (isConnected) {
      connectGoogleDriveBtn.classList.add("hidden");
      googleDriveStatus.classList.remove("hidden");
    } else {
      connectGoogleDriveBtn.classList.remove("hidden");
      googleDriveStatus.classList.add("hidden");
    }
  };

  const connectGoogleDrive = async () => {
    try {
      const response = await fetch("http://localhost:3000/api/auth/google");
      if (!response.ok)
        throw new Error(`HTTP-Fehler! Status: ${response.status}`);
      const data = await response.json();
      const { url } = data;
      if (url) {
        window.electronAPI.openExternal(url);
        updateGoogleDriveStatus(true);
      }
    } catch (error) {
      console.error("Fehler beim Verbinden mit Google Drive:", error);
      alert(
        "Konnte keine Verbindung zu Google Drive herstellen. Läuft das Backend?"
      );
    }
  };

  const renderContextsView = (contextData) => {
    contextsContainer.innerHTML = "";
    const renderNode = (nodeData, parentElement) => {
      Object.keys(nodeData)
        .sort()
        .forEach((key) => {
          const node = nodeData[key];
          const container = document.createElement("div");
          container.className = "context-node";
          const header = document.createElement("div");
          header.className = "context-header collapsible-header";
          header.innerHTML = `<span class="context-name">${key}</span> <span class="note-count">${node.notes.length}</span>`;
          const notesList = document.createElement("ul");
          notesList.className = "context-notes hidden";
          node.notes.forEach((noteId) => {
            const note = notes.find((n) => n.id === noteId);
            if (note) {
              const li = document.createElement("li");
              li.className = "context-note-item";
              li.textContent = note.title;
              li.dataset.id = note.id;
              notesList.appendChild(li);
            }
          });
          header.addEventListener("click", () => {
            notesList.classList.toggle("hidden");
            header.classList.toggle("open");
          });
          container.appendChild(header);
          container.appendChild(notesList);
          parentElement.appendChild(container);
          if (Object.keys(node.children).length > 0) {
            renderNode(node.children, container);
          }
        });
    };
    renderNode(contextData, contextsContainer);
  };

  const renderTocView = () => {
    if (!graphIndex || !Array.isArray(notes)) return;
    tocContainer.innerHTML = "";
    const createSection = (title, items) => {
      const section = document.createElement("div");
      section.className = "toc-section";
      const header = document.createElement("h2");
      header.className = "collapsible-header open";
      header.innerHTML = `${title} <span>(${items.length})</span>`;
      const list = document.createElement("ul");
      list.className = "toc-list";
      items.forEach((item) => {
        const li = document.createElement("li");
        li.className = "toc-item";
        li.textContent = item.label;
        li.dataset.id = item.id;
        list.appendChild(li);
      });
      header.addEventListener("click", () => {
        list.classList.toggle("hidden");
        header.classList.toggle("open");
      });
      section.appendChild(header);
      section.appendChild(list);
      tocContainer.appendChild(section);
    };
    const allPages = notes
      .map((n) => ({ id: n.id, label: n.title }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const orphanedPages = graphIndex.nodes
      .filter((node) => !graphIndex.edges.some((edge) => edge.to === node.id))
      .sort((a, b) => a.label.localeCompare(b.label));
    createSection("Alle Seiten", allPages);
    createSection("Verwaiste Seiten", orphanedPages);
  };

  const renderGraphView = () => {
    if (!graphIndex || !graphContainer) return;

    const coloredEdges = graphIndex.edges.map((edge) => {
      const newEdge = { ...edge };
      if (edge.type === "explicit") {
        newEdge.color = "#818cf8";
        newEdge.width = 2.5;
      } else {
        newEdge.color = "#4b5563";
        newEdge.width = 1.5;
      }
      return newEdge;
    });

    const nodes = new vis.DataSet(graphIndex.nodes);
    const edges = new vis.DataSet(coloredEdges);

    const data = {
      nodes: nodes,
      edges: edges,
    };

    const options = {
      nodes: {
        shape: "dot",
        size: 18,
        font: {
          size: 14,
          color: "#e5e7eb",
        },
        borderWidth: 2,
        color: {
          background: "#374151",
          border: "#60a5fa",
          highlight: {
            background: "#4f46e5",
            border: "#a78bfa",
          },
        },
      },
      edges: {
        smooth: {
          type: "cubicBezier",
        },
      },
      physics: {
        forceAtlas2Based: {
          gravitationalConstant: -26,
          centralGravity: 0.005,
          springLength: 230,
          springConstant: 0.18,
        },
        maxVelocity: 146,
        solver: "forceAtlas2Based",
        timestep: 0.35,
        stabilization: { iterations: 150 },
      },
      interaction: {
        tooltipDelay: 200,
        hideEdgesOnDrag: true,
        hover: true,
      },
    };

    const network = new vis.Network(graphContainer, data, options);

    network.on("selectNode", function (params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        displayNote(nodeId);
      }
    });
  };

  const renderMetadataView = (metadata) => {
    metadataContainer.innerHTML = "";
    if (!metadata) return;

    for (const key in metadata) {
      const value = metadata[key];
      const itemDiv = document.createElement("div");
      itemDiv.className = "metadata-item";

      const keyLabel = document.createElement("label");
      keyLabel.className = "metadata-key";
      keyLabel.textContent = key.charAt(0).toUpperCase() + key.slice(1);

      const valueInput = document.createElement("input");
      valueInput.type = "text";
      valueInput.className = "metadata-value";
      valueInput.value = value;
      valueInput.dataset.key = key;

      itemDiv.appendChild(keyLabel);
      itemDiv.appendChild(valueInput);
      metadataContainer.appendChild(itemDiv);
    }
  };

  const renderProjectsView = () => {
    kanbanBoard.innerHTML = "";

    const columns = {
      offen: "To Do",
      "in-bearbeitung": "In Progress",
      erledigt: "Done",
    };

    const tasks = notes.filter(
      (note) => note.metadata && note.metadata.typ === "Aufgabe"
    );

    for (const status in columns) {
      const title = columns[status];
      const columnDiv = document.createElement("div");
      columnDiv.className = "kanban-column";
      columnDiv.dataset.status = status;

      const titleH3 = document.createElement("h3");
      titleH3.className = "kanban-column-title";
      titleH3.textContent = title;
      columnDiv.appendChild(titleH3);

      const cardsContainer = document.createElement("div");
      cardsContainer.className = "kanban-cards-container";
      cardsContainer.style.minHeight = "50px";

      tasks
        .filter((task) => task.metadata.status === status)
        .forEach((task) => {
          const cardDiv = document.createElement("div");
          cardDiv.className = "kanban-card";
          cardDiv.textContent = task.title;
          cardDiv.dataset.id = task.id;

          if (task.metadata.priorität) {
            cardDiv.classList.add(
              `kanban-card-prio-${task.metadata.priorität}`
            );
          }
          cardsContainer.appendChild(cardDiv);
        });

      columnDiv.appendChild(cardsContainer);
      kanbanBoard.appendChild(columnDiv);

      new Sortable(cardsContainer, {
        group: "kanban",
        animation: 150,
        ghostClass: "sortable-ghost",
        onEnd: async (evt) => {
          const card = evt.item;
          const noteId = card.dataset.id;
          const newStatus = evt.to.parentElement.dataset.status;

          const noteToUpdate = notes.find((n) => n.id === noteId);
          if (noteToUpdate && noteToUpdate.metadata.status !== newStatus) {
            noteToUpdate.metadata.status = newStatus;

            const filePath = `${notesDirectory}/${noteToUpdate.id}`;
            const fileContent = `# ${noteToUpdate.title}\n\n${noteToUpdate.content}`;
            await window.electronAPI.saveNote({
              filePath,
              content: fileContent,
              metadata: noteToUpdate.metadata,
            });

            card.style.transition = "background-color 0.3s";
            card.style.backgroundColor = "#22c55e";
            setTimeout(() => {
              card.style.backgroundColor = "";
            }, 300);
          }
        },
      });
    }
  };

  const buildGraphIndex = async () => {
    if (Array.isArray(notes) && notes.length > 0) {
      graphIndex = await window.electronAPI.buildIndex(notes);
      if (graphIndex && graphIndex.contexts) {
        renderContextsView(graphIndex.contexts);
      }
      renderTocView();
      renderGraphView();
    }
  };

  const loadNotes = async () => {
    if (!notesDirectory) return;
    const loadedNotes = await window.electronAPI.loadNotes(notesDirectory);
    notes = Array.isArray(loadedNotes) ? loadedNotes : [];
    await buildGraphIndex();
    if (document.getElementById("toc-view").classList.contains("hidden")) {
      switchView("toc-view");
    }
  };

  const initApp = (folderPath) => {
    notesDirectory = folderPath;
    placeholder.classList.add("hidden");
    editorContainer.classList.remove("hidden");
    bottomContainer.classList.remove("hidden");
    loadNotes();
  };

  const runOnboardingOrInit = async () => {
    const savedPath = await window.electronAPI.getSetting("notesDirectory");
    if (savedPath) {
      initApp(savedPath);
    } else {
      editorContainer.classList.add("hidden");
      bottomContainer.classList.add("hidden");
      placeholder.classList.remove("hidden");
      placeholder.innerHTML = `<p class="font-headline text-4xl mb-4">Willkommen bei Now</p><p class="text-xl mb-8">Bitte wähle einen Ordner aus, um deine Notizen zu speichern.</p><button id="select-folder-btn" class="font-button bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-lg transition-colors text-lg tracking-wider">\"Tresor\" auswählen</button>`;
      document
        .getElementById("select-folder-btn")
        .addEventListener("click", selectFolder);
    }
  };

  const selectFolder = async () => {
    const folderPath = await window.electronAPI.openFolderDialog();
    if (folderPath) {
      await window.electronAPI.setSetting("notesDirectory", folderPath);
      initApp(folderPath);
    }
  };

  const highlightSyntax = (text) => {
    let highlightedText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // NEU: Markdown-Links für Bookmarks hervorheben
    highlightedText = highlightedText.replace(
      /\\\[(.*?)\\\\.?.*? (https?:\\/\\/[^\\s]+?)\\\\/g,
      '<a href="$2" class="bookmark-link" target="_blank">$1</a>'
    );

    highlightedText = highlightedText.replace(
      /@(\w+)/g,
      '<span class="page-link" data-page-name="$1">@$1</span>'
    );
    highlightedText = highlightedText.replace(
      /#([\\w\\/]+)/g,
      (match, contextPath) => {
        const parts = contextPath.split("/");
        const styledParts = parts
          .map(
            (part, index) =>
              `<span class="context-part context-level-${index}">${part}</span>`
          )
          .join('<span class="context-separator">/</span>');
        return `<span class="tag">${styledParts}</span>`;
      }
    );
    return highlightedText;
  };

  const saveNote = async () => {
    if (!activeNoteId || !notesDirectory) return;
    const note = notes.find((n) => n.id === activeNoteId);
    if (note) {
      note.title = noteTitleInput.value;
      note.content = noteContentInput.value;

      const updatedMetadata = note.metadata || {};
      const metadataInputs =
        metadataContainer.querySelectorAll(".metadata-value");
      metadataInputs.forEach((input) => {
        updatedMetadata[input.dataset.key] = input.value;
      });
      note.metadata = updatedMetadata;

      const fileContentForLocalSave = `# ${note.title}\n\n${note.content}`;
      const filePath = `${notesDirectory}/${note.id}`;

      await window.electronAPI.saveNote({
        filePath,
        content: fileContentForLocalSave,
        metadata: note.metadata,
      });
      console.log(`Notiz '${note.id}' lokal gespeichert.`);

      if (isGoogleDriveConnected) {
        try {
          let fileContentForDrive = "";
          if (note.metadata && Object.keys(note.metadata).length > 0) {
            const metadataString = Object.entries(note.metadata)
              .map(([key, value]) => `${key}: ${value}`)
              .join("\n");
            fileContentForDrive += `---\n${metadataString}\n---\n`;
          }
          fileContentForDrive += `# ${note.title}\n\n${note.content}`;

          await fetch("http://localhost:3000/api/sync/note", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileId: note.id,
              content: fileContentForDrive,
            }),
          });
          console.log(
            `Synchronisierung für '${note.id}' erfolgreich angestoßen.`
          );
        } catch (error) {
          console.error("Fehler beim Anstoßen der Synchronisierung:", error);
        }
      }
      await buildGraphIndex(); // HINZUGEFÜGT: UI nach dem Speichern aktualisieren
    }
  };

  const renderBacklinks = (noteId) => {
    backlinksList.innerHTML = "";
    if (!graphIndex || !noteId) return;
    const incomingLinks = graphIndex.edges.filter((edge) => edge.to === noteId);
    if (incomingLinks.length === 0) {
      backlinksList.innerHTML =
        '<li class="text-gray-500">Keine Verknüpfungen gefunden.</li>';
      return;
    }
    incomingLinks.forEach((link) => {
      const sourceNote = notes.find((n) => n.id === link.from);
      if (sourceNote) {
        const li = document.createElement("li");
        li.className = "backlink-item";
        li.dataset.id = sourceNote.id;
        const linkTypeSpan = document.createElement("span");
        linkTypeSpan.className = `link-type ${link.type}`;
        linkTypeSpan.textContent = link.type === "explicit" ? "@" : "·";
        const textSpan = document.createElement("span");
        textSpan.textContent = sourceNote.title;
        li.appendChild(linkTypeSpan);
        li.appendChild(textSpan);
        backlinksList.appendChild(li);
      }
    });
  };

  // --- EVENT LISTENERS ---

  hamburgerBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });

  if (connectGoogleDriveBtn) {
    connectGoogleDriveBtn.addEventListener("click", connectGoogleDrive);
  }

  // NEU: Event Listener für "Finde Verbindungen" Button
  const findConnectionsBtn = document.getElementById("find-connections-btn");
  if (findConnectionsBtn) {
    findConnectionsBtn.addEventListener("click", async () => {
      if (!activeNoteId) {
        alert("Bitte wählen Sie zuerst eine Notiz aus, um Verbindungen zu finden.");
        return;
      }

      const focusNote = notes.find(n => n.id === activeNoteId);
      if (!focusNote) {
        alert("Fokus-Notiz konnte nicht gefunden werden.");
        return;
      }

      const focusNoteContent = `# ${focusNote.title}\n\n${focusNote.content}`;
      
      // Filtere die Fokus-Notiz aus dem Archiv heraus
      const allOtherNotes = notes.filter(n => n.id !== activeNoteId).map(n => ({
        title: n.title,
        content: `# ${n.title}\n\n${n.content}` // Format for AI prompt
      }));

      console.log("Frontend: Sende Anfrage an Backend...");
      console.log("Frontend: Fokus-Notiz Inhalt:", focusNoteContent);
      console.log("Frontend: Archiv-Notizen (Anzahl):", allOtherNotes.length);

      findConnectionsBtn.textContent = "Suche Verbindungen...";
      findConnectionsBtn.disabled = true;

      try {
        const response = await fetch("http://localhost:3000/api/suggest-connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ focusNoteContent, allNotes: allOtherNotes }),
        });

        if (!response.ok) {
          console.error(`Frontend: HTTP-Fehler! Status: ${response.status}`);
          throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        const suggestions = await response.json();
        console.log("Frontend: Empfangene Vorschläge:", suggestions);

        if (suggestions.length > 0) {
          let alertMessage = "Vorgeschlagene Verbindungen:\n\n";
          suggestions.forEach((s, index) => {
            alertMessage += `${index + 1}. ${s.suggested_note_title}\n   Grund: ${s.reason_for_connection}\n\n`;
          });
          alert(alertMessage);
        } else {
          alert("Keine relevanten Verbindungen gefunden.");
        }

      } catch (error) {
        console.error("Frontend: Fehler beim Finden von Verbindungen:", error);
        alert("Es gab einen Fehler beim Suchen nach Verbindungen. (Läuft das Backend?)");
      } finally {
        findConnectionsBtn.innerHTML = `<span class="material-icons" style="font-size: 20px">psychology</span> Finde Verbindungen`;
        findConnectionsBtn.disabled = false;
      }
    });
  }

  sidebar.addEventListener("click", (e) => {
    const button = e.target.closest(".nav-button");
    if (button && button.dataset.view) {
      switchView(button.dataset.view);
    }
  });

  newNoteBtn.addEventListener("click", () => createNewNote());

  const debounce = (func, delay) => {
    let timeout;
    return function (...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), delay);
    };
  };

  const debouncedSave = debounce(saveNote, 500);

  // --- NEU: URL-Markierung ---
  const markUrlAsBookmark = async (content) => {
    const urlRegex = /https?:\/\/[^\s]+/g;
    let lastMatch;
    let match;
    // Finde die letzte URL im Text
    while ((match = urlRegex.exec(content)) !== null) {
        const url = match[0];
        // Check if the text immediately preceding the URL is '[bookmark] '
        const precedingText = content.substring(match.index - 11, match.index);
        if (precedingText !== '[bookmark] ') { // Still check to avoid re-processing
            lastMatch = match;
        }
    }

    if (lastMatch) {
      const url = lastMatch[0];
      const urlIndex = lastMatch.index;
      try {
        const response = await fetch("http://localhost:3000/api/enrich-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!response.ok) {
          console.error("Fehler beim Abrufen des angereicherten Bookmarks:", response.status);
          return content; // Return original content on error
        }
        const data = await response.json();
        const formattedBookmark = data.bookmark; // Get the formatted string from backend

        // Replace the original URL with the new formatted bookmark
        return content.substring(0, urlIndex) + `[${formattedBookmark}](${url})` + content.substring(urlIndex + url.length);

      } catch (error) {
        console.error("Fehler beim Anreichern der URL:", error);
        return content; // Return original content on error
      }
    }
    return content;
  };

  const debouncedBookmark = debounce(async () => {
    const currentContent = noteContentInput.value;
    const newContent = await markUrlAsBookmark(currentContent);
    if (newContent !== currentContent) {
      noteContentInput.value = newContent;
      highlightLayer.innerHTML = highlightSyntax(newContent);
      debouncedSave();
    }
  }, 1000);

  noteTitleInput.addEventListener("input", debouncedSave);
  noteContentInput.addEventListener("input", () => {
    const text = noteContentInput.value;
    highlightLayer.innerHTML = highlightSyntax(text);
    highlightLayer.scrollTop = noteContentInput.scrollTop;
    highlightLayer.scrollLeft = noteContentInput.scrollLeft;
    debouncedSave();
    debouncedBookmark(); // Hinzugefügt
  });
  noteContentInput.addEventListener("scroll", () => {
    highlightLayer.scrollTop = noteContentInput.scrollTop;
    highlightLayer.scrollLeft = noteContentInput.scrollLeft;
  });

  contextsContainer.addEventListener("click", (e) => {
    const noteItem = e.target.closest(".context-note-item");
    if (noteItem) {
      displayNote(noteItem.dataset.id);
    }
  });

  tocContainer.addEventListener("click", (e) => {
    const tocItem = e.target.closest(".toc-item");
    if (tocItem) {
      displayNote(tocItem.dataset.id);
    }
  });

  kanbanBoard.addEventListener("click", (e) => {
    const card = e.target.closest(".kanban-card");
    if (card && card.dataset.id) {
      displayNote(card.dataset.id);
    }
  });

  setTimeout(() => {
    startText.classList.remove("opacity-0");
    startText.classList.add("animate-pulse");
  }, 5000);

  splashScreen.addEventListener("click", () => {
    splashScreen.classList.add("hidden-view");
    appContainer.classList.remove("hidden-view");
    runOnboardingOrInit();
  });

  placeholder.addEventListener("click", (e) => {
    const target = e.target.closest("#select-folder-btn");
    if (target) {
      selectFolder();
    }
  });

  backlinksList.addEventListener("click", (e) => {
    const backlinkItem = e.target.closest(".backlink-item");
    if (backlinkItem && backlinkItem.dataset.id) {
      displayNote(backlinkItem.dataset.id);
    }
  });

  highlightLayer.addEventListener("click", async (e) => {
    const target = e.target;
    if (target.classList.contains("page-link")) {
      e.preventDefault();
      const pageName = target.dataset.pageName;
      const existingNote = notes.find(
        (note) => note.title.toLowerCase() === pageName.toLowerCase()
      );
      if (existingNote) {
        displayNote(existingNote.id);
      } else {
        const newNoteId = await createNewNote(pageName);
        displayNote(newNoteId);
      }
    } else {
      noteContentInput.focus();
    }
  });

  metadataContainer.addEventListener("change", async () => {
    await saveNote();
    await loadNotes();
  });
});