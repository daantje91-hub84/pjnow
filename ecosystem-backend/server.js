// ecosystem-backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { google } = require("googleapis");
const stream = require("stream");
const cheerio = require("cheerio"); // Stellen Sie sicher, dass Sie cheerio installiert haben: npm install cheerio

// Sicherheitsprüfung für API-Schlüssel
const requiredEnvVars = [
  "GEMINI_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(
      `\x1b[31mFEHLER: Der API-Schlüssel '${varName}' wurde nicht in der .env-Datei gefunden.\x1b[0m`
    );
    console.error(
      'Bitte stelle sicher, dass eine .env-Datei im "ecosystem-backend"-Ordner existiert und alle benötigten Schlüssel enthält.'
    );
    process.exit(1);
  }
}

const app = express();
const PORT = 3000;

// --- Initialisierung ---
app.use(cors());
app.use(express.json());

// Clients initialisieren
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:3000/api/auth/google/callback"
);

const scopes = ["https://www.googleapis.com/auth/drive.file"];
let userTokens = null;
let appFolderId = null; // Cache für die ID unseres App-Ordners

// --- Umfangreiche Mock-Datenbank ---
let db = {
  projects: [
    {
      id: "proj_1",
      userId: "user_123",
      title: "Marathon unter 4 Stunden laufen",
      status: "active",
      context_id: "ctx_1",
      milestones: [
        { id: "m1_1", title: "Grundlagen schaffen" },
        { id: "m1_2", title: "Ausdauer aufbauen" },
        { id: "m1_3", title: "Wettkampfvorbereitung" },
      ],
    },
    {
      id: "proj_2",
      userId: "user_123",
      title: "Neues Schach-Repertoire entwickeln",
      status: "active",
      context_id: "ctx_4",
      milestones: [
        { id: "m2_1", title: "Eröffnungstheorie (Weiß)" },
        { id: "m2_2", title: "Mittelspiel-Strategie" },
      ],
    },
    {
      id: "proj_3",
      userId: "user_123",
      title: "Balkon bepflanzen",
      status: "completed",
      context_id: "ctx_2",
      milestones: [],
    },
  ],
  tasks: [
    // Aufgaben für Projekt 1: Marathon
    {
      id: "task_1",
      projectId: "proj_1",
      milestone_id: "m1_1",
      text: "Die richtigen Laufschuhe kaufen",
      completed: true,
      created_at: "2025-08-20T10:00:00Z",
      scheduled_at: null,
    },
    {
      id: "task_2",
      projectId: "proj_1",
      milestone_id: "m1_1",
      text: "5km-Lauf zur Standortbestimmung",
      completed: true,
      created_at: "2025-08-21T10:00:00Z",
      scheduled_at: null,
    },
    {
      id: "task_3",
      projectId: "proj_1",
      milestone_id: "m1_2",
      text: "Erster 10km-Lauf",
      completed: false,
      created_at: "2025-08-22T10:00:00Z",
      scheduled_at: new Date().toISOString().slice(0, 10), // Für heute geplant
    },
    {
      id: "task_4",
      projectId: "proj_1",
      milestone_id: "m1_2",
      text: "Intervalltraining durchführen",
      completed: false,
      created_at: "2025-08-23T10:00:00Z",
      scheduled_at: new Date().toISOString().slice(0, 10), // Für heute geplant
    },

    // Aufgaben für Projekt 2: Schach
    {
      id: "task_5",
      projectId: "proj_2",
      milestone_id: "m2_1",
      text: "Analyse der sizilianischen Verteidigung",
      completed: false,
      created_at: "2025-08-25T10:00:00Z",
      scheduled_at: new Date().toISOString().slice(0, 10), // Für heute geplant
    },
    {
      id: "task_6",
      projectId: "proj_2",
      milestone_id: "m2_2",
      text: "30 Minuten Taktik-Aufgaben lösen",
      completed: false,
      isHabit: true,
      created_at: "2025-08-26T10:00:00Z",
      scheduled_at: new Date().toISOString().slice(0, 10), // Auch für heute
    },

    // Aufgaben ohne Projekt (für die Inbox)
    {
      id: "task_7",
      projectId: null,
      text: "Steuererklärung vorbereiten",
      completed: false,
      created_at: "2025-08-28T14:00:00Z",
      scheduled_at: null,
      isNote: false,
    },
    {
      id: "task_8",
      projectId: null,
      text: "Idee für Blogartikel über Produktivität notieren",
      completed: false,
      created_at: "2025-08-28T16:00:00Z",
      scheduled_at: null,
      isNote: false,
    },
  ],
  notes: [],
};

const systemPrompt = `
Du bist ein intelligenter Assistent zur Aufgaben-Triagierung. Deine Aufgabe ist es, einen vom Nutzer bereitgestellten Text zu analysieren und ihn in ein strukturiertes JSON-Format zu überführen.
Klassifizierungsregeln:
1.  PROJECT: Wenn der Text ein klares Ziel beschreibt und mehrere untergeordnete Schritte enthält.
2.  TASK: Wenn der Text eine einzelne, konkrete Aktion beschreibt.
3.  APPOINTMENT: Wenn der Text ein spezifisches Datum und/oder eine Uhrzeit enthält.
4.  NOTE: Wenn keine der obigen Kategorien zutrifft.
Extraktionsregeln:
- Der 	id sollte die Hauptüberschrift sein.
- Extrahiere alle Metadaten (z.B. 	id: offen	id) in das 	idmetadata	id-Objekt.
Ausgabeformat:
Gib IMMER NUR ein valides JSON-Objekt zurück, ohne umschließende Markdown-Syntax.
`;

// =====================================================================
// Hilfsfunktion, um den App-Ordner zu finden oder zu erstellen
// =====================================================================
async function getOrCreateAppFolder(drive) {
  if (appFolderId) {
    return appFolderId;
  }

  const folderName = "Progress+Now Tresor";
  try {
    const res = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name)",
    });

    if (res.data.files.length > 0) {
      console.log(`App-Ordner '${folderName}' gefunden.`);
      appFolderId = res.data.files[0].id;
      return appFolderId;
    } else {
      console.log(`App-Ordner '${folderName}' nicht gefunden. Erstelle ihn...`);
      const fileMetadata = {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
      };
      const folder = await drive.files.create({
        resource: fileMetadata,
        fields: "id",
      });
      appFolderId = folder.data.id;
      console.log(`App-Ordner erfolgreich erstellt mit ID: ${appFolderId}`);
      return appFolderId;
    }
  } catch (err) {
    console.error("Fehler beim Suchen/Erstellen des App-Ordners:", err);
    throw err;
  }
}

// --- API-Endpunkte ---
app.get("/", (req, res) => res.send("Das Progress+Now Backend läuft! 🚀"));

// AUTHENTIFIZIERUNG
app.get("/api/auth/google", (req, res) => {
  const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    include_granted_scopes: true,
  });
  res.json({ url: authorizationUrl });
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    userTokens = tokens;
    oauth2Client.setCredentials(userTokens);
    console.log("Erfolgreich Tokens erhalten:", userTokens);
    res.send(
      "Erfolgreich mit Google Drive verbunden! Du kannst dieses Fenster jetzt schließen."
    );
  } catch (error) {
    console.error("Fehler beim Abrufen der Tokens:", error);
    res.status(500).send("Fehler bei der Authentifizierung.");
  }
});

// DATEN
app.get("/api/projects", (req, res) => res.json(db.projects));
app.get("/api/tasks", (req, res) => res.json(db.tasks));

// KI-VERARBEITUNG
app.post("/api/process-note", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Der Text der Notiz fehlt." });
  }

  try {
    const prompt = `Analysiere den folgenden Text und gib das Ergebnis als JSON zurück:\n\n---\n${text}\n---`;
    const result = await model.generateContent([systemPrompt, prompt]);
    const response = await result.response;
    const jsonText = response.text();

    const cleanJsonText = jsonText
      .replace(/```json\n/g, "")
      .replace(/\n```/g, "");

    console.log("KI-Antwort (bereinigt):", cleanJsonText);

    const structuredData = JSON.parse(cleanJsonText);

    console.log("Strukturierte Daten:", structuredData);

    res.json(structuredData);
  } catch (error) {
    console.error("Fehler bei der KI-Verarbeitung:", error);
    res.status(500).json({ error: "Fehler bei der Kommunikation mit der KI." });
  }
});

// GOOGLE DRIVE SYNC
app.post("/api/sync/note", async (req, res) => {
  if (!userTokens) {
    return res
      .status(401)
      .json({ error: "Benutzer ist nicht bei Google angemeldet." });
  }

  oauth2Client.setCredentials(userTokens);
  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const { fileId, content } = req.body;

  try {
    const folderId = await getOrCreateAppFolder(drive);

    const searchRes = await drive.files.list({
      q: `name='${fileId}' and '${folderId}' in parents`,
      spaces: "drive",
      fields: "files(id, name)",
    });

    const bufferStream = new stream.PassThrough();
    bufferStream.end(Buffer.from(content, "utf-8"));

    const media = {
      mimeType: "text/markdown",
      body: bufferStream,
    };

    if (searchRes.data.files.length > 0) {
      const googleFileId = searchRes.data.files[0].id;
      await drive.files.update({ fileId: googleFileId, media: media });
      console.log(`Datei '${fileId}' im Ordner erfolgreich aktualisiert.`);
      res.status(200).json({ message: "Datei aktualisiert." });
    } else {
      await drive.files.create({
        requestBody: {
          name: fileId,
          mimeType: "text/markdown",
          parents: [folderId],
        },
        media: media,
      });
      console.log(`Datei '${fileId}' im Ordner erfolgreich erstellt.`);
      res.status(201).json({ message: "Datei erstellt." });
    }
  } catch (error) {
    console.error(
      "Fehler bei der Google Drive Synchronisierung:",
      error.message
    );
    res.status(500).json({ error: "Fehler bei der Synchronisierung." });
  }
});

// Erweiterte URL-Anreicherung mit KI
app.post("/api/enrich-url", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL fehlt im Request-Body." });
  }

  let pageContent = "";
  let pageTitle = "";
  let pageDescription = "";

  try {
    const fetchResponse = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!fetchResponse.ok) {
      throw new Error(`HTTP-Fehler! Status: ${fetchResponse.status}`);
    }
    const html = await fetchResponse.text();

    const $ = cheerio.load(html);
    pageTitle =
      $("title").text() || $('meta[property="og:title"]').attr("content") || "";
    pageDescription =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "";

    let relevantText = "";
    $("p, h1, h2, h3, h4, h5, h6").each((i, el) => {
      if (relevantText.length < 500) {
        relevantText += $(el).text().trim() + "\n";
      } else {
        return false;
      }
    });
    pageContent = relevantText.substring(0, 1000);
  } catch (error) {
    console.warn(
      `Fehler beim Abrufen/Parsen der URL ${url}: ${error.message}. Versuche dennoch KI-Analyse.`
    );
  }

  const userPrompt = `
        DEIN ZIEL:
        Verwandle eine nutzlose URL in eine nützliche Information. Der Nutzer muss auf einen Blick verstehen, was sich hinter dem Link verbirgt, ohne darauf klicken zu müssen.
        DEIN PROZESS:
        Identifiziere die URL: ${url}
        Besuche die Seite (virtuell):
        Titel: ${pageTitle}
        Beschreibung: ${pageDescription}
        Inhalt (Auszug): ${pageContent}
        Bei einem TikTok-Video oder YouTube-Video geht es um den Inhalt des Videos. Was passiert darin?
        Bei einem Nachrichtenartikel geht es um die Hauptschlagzeile.
        Bei einem Song auf Soundcloud geht es um den Künstler und den Titel des Tracks.
        Erstelle einen prägnanten Titel: Formuliere aus deinem Verständnis einen kurzen, klaren Titel. Dieser Titel MUSS den Inhalt der Seite akkurat beschreiben.
        Ersetze die URL: Nimm den Originaltext und ersetze die nackte URL durch das neu formatierte Lesezeichen.
        AUSGABEFORMAT:
        Deine Antwort MUSS diesem Format folgen:
        [Bookmark] {Emoji} {Dein erstellter Titel}
        Beginne immer mit dem Tag [Bookmark].
        Wähle ein passendes Emoji:
        🎬 für Videos (TikTok, YouTube etc.)
        📰 für Nachrichtenartikel oder Blog-Posts
        🎵 für Musik oder Audio
        🖼️ für Bilder (Instagram etc.)
        🔗 für allgemeine Webseiten oder Tools
        Füge dann den von dir erstellten, aussagekräftigen Titel ein.
        BEISPIELE:
        Wenn du diesen Text erhältst:
        zeichnen mit Licht https://www.tiktok.com/@aqua_marina_/video/7541416776110787862
        Musst du antworten:
        zeichnen mit Licht [Bookmark] 🎬 TikTok: Tutorial zum Zeichnen mit Licht-Effekten
        Wenn du diesen Text erhältst:
        https://taz.de/Israels-Kriegsverbrechen-in-Gaza/!6100427/#
        Musst du antworten:
        [Bookmark] 📰 taz.de: Israels Kriegsverbrechen in Gaza
        Generiere jetzt den Bookmark-Titel für die URL: ${url}
      `;

  try {
    const result = await model.generateContent(userPrompt);
    const responseText = result.response.text();
    const formattedBookmark = responseText.trim();
    res.json({ bookmark: formattedBookmark });
  } catch (error) {
    console.error("Fehler bei der KI-Generierung des Bookmarks:", error);
    res
      .status(500)
      .json({ error: "Fehler bei der KI-Generierung des Bookmarks." });
  }
});

// Digitaler Synapsen-Knüpfer
app.post("/api/suggest-connections", async (req, res) => {
  const { focusNoteContent, allNotes } = req.body;

  if (!focusNoteContent || !allNotes || !Array.isArray(allNotes)) {
    return res
      .status(400)
      .json({ error: "Fokus-Notiz oder Notiz-Archiv fehlen/sind ungültig." });
  }

  const limitedAllNotes = allNotes.slice(0, 50);

  const notesArchiveText = limitedAllNotes
    .map((note) => `--- Titel: ${note.title}\nInhalt: ${note.content}`)
    .join("\n\n");

  const userPrompt = `
        DEIN ZIEL:
        Du bist ein "Digitaler Synapsen-Knüpfer". Deine Aufgabe ist es, als intelligenter Assistent im Hintergrund zu arbeiten. Du liest die Notizen eines Nutzers und entdeckst verborgene, sinnvolle Verbindungen zwischen ihnen.
        DEIN KONTEXT:
        Du arbeitest in der Notiz-App "Now". Deine Aufgabe ist es, dieses Gehirn lebendig zu halten.
        DEIN PROZESS:
        Analysiere die FOKUS-NOTIZ:
        ---
        ${focusNoteContent}
        ---
        Durchsuche das GESAMTE WISSEN:
        ---
        ${notesArchiveText}
        ---
        Finde Verbindungen auf ZWEI EBENEN:
        Offensichtliche Verbindungen und Verborgene (semantische) Verbindungen.
        Filtere und wähle die BESTEN 3 aus.
        DEIN OUTPUT (Das ist entscheidend!):
        Deine Antwort MUSS eine Liste von Vorschlägen sein und für JEDEN Vorschlag musst du sagen, WELCHE Notiz du vorschlägst und WARUM.
        AUSGABEFORMAT:
        Deine Antwort muss ein JSON-Objekt sein, das eine Liste von Verbindungen enthält. Jedes Objekt in der Liste muss folgendes Format haben:
        {
          "suggested_note_title": "Der Titel der verknüpften Notiz",
          "reason_for_connection": "Eine kurze, prägnante Begründung, warum diese Notiz relevant ist."
        }
        Generiere jetzt die 3 besten Verbindungsvorschläge für die oben genannte FOKUS-NOTIZ basierend auf dem Notiz-Archiv. Gib NUR das JSON-Array aus.
      `;

  try {
    const result = await model.generateContent(userPrompt);
    const responseText = result.response.text();

    const cleanJsonText = responseText
      .trim()
      .replace(/```json\n/g, "")
      .replace(/\n```/g, "");

    const suggestions = JSON.parse(cleanJsonText);

    if (
      !Array.isArray(suggestions) ||
      suggestions.some(
        (s) => !s.suggested_note_title || !s.reason_for_connection
      )
    ) {
      throw new Error("Ungültiges JSON-Format von der KI erhalten.");
    }
    res.json(suggestions);
  } catch (error) {
    console.error("Fehler bei der KI-Generierung der Verbindungen:", error);
    res
      .status(500)
      .json({ error: "Fehler bei der KI-Generierung der Verbindungen." });
  }
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server lauscht auf http://localhost:${PORT}`);
});
