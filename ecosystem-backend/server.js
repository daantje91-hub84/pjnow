// ecosystem-backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { google } = require("googleapis");
const stream = require("stream");

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

// --- Mock-Datenbank & System Prompt (unverändert) ---
let db = {
  projects: [
    {
      id: "proj_1",
      userId: "user_123",
      title: "Marathon unter 4 Stunden laufen",
      status: "active",
      milestones: [],
    },
  ],
  tasks: [
    {
      id: "task_1",
      projectId: "proj_1",
      text: "Die richtigen Laufschuhe kaufen",
      completed: false,
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
// NEU: Hilfsfunktion, um den App-Ordner zu finden oder zu erstellen
// =====================================================================
async function getOrCreateAppFolder(drive) {
  // Wenn wir die ID schon haben, geben wir sie direkt zurück (Caching)
  if (appFolderId) {
    return appFolderId;
  }

  const folderName = "Progress+Now Tresor";
  try {
    // Suche nach dem Ordner
    const res = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name)",
    });

    if (res.data.files.length > 0) {
      // Ordner gefunden
      console.log(`App-Ordner '${folderName}' gefunden.`);
      appFolderId = res.data.files[0].id;
      return appFolderId;
    } else {
      // Ordner nicht gefunden, also erstellen
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
    throw err; // Fehler weitergeben
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
    
    // Bereinigen der Antwort, um sicherzustellen, dass es valides JSON ist
    const cleanJsonText = jsonText.replace(/```json\n/g, "").replace(/\n```/g, "");
    
    console.log("KI-Antwort (bereinigt):", cleanJsonText);
    
    const structuredData = JSON.parse(cleanJsonText);

    // Hier würde man die Daten in der DB speichern, für jetzt geben wir sie zurück
    // z.B. db.tasks.push(structuredData);
    console.log("Strukturierte Daten:", structuredData);

    res.json(structuredData);
  } catch (error) {
    console.error("Fehler bei der KI-Verarbeitung:", error);
    res.status(500).json({ error: "Fehler bei der Kommunikation mit der KI." });
  }
});

// GOOGLE DRIVE SYNC (AKTUALISIERT)
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
    // 1. Hole die ID des App-Ordners
    const folderId = await getOrCreateAppFolder(drive);

    // 2. Suche nach der Datei INNERHALB des App-Ordners
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
      // Datei existiert -> Aktualisieren
      const googleFileId = searchRes.data.files[0].id;
      await drive.files.update({ fileId: googleFileId, media: media });
      console.log(`Datei '${fileId}' im Ordner erfolgreich aktualisiert.`);
      res.status(200).json({ message: "Datei aktualisiert." });
    } else {
      // Datei existiert nicht -> Neu erstellen IM ORDNER
      await drive.files.create({
        requestBody: {
          name: fileId,
          mimeType: "text/markdown",
          parents: [folderId], // HIER wird die Datei dem Ordner zugeordnet
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

// NEU: Erweiterte URL-Anreicherung mit KI
app.post("/api/enrich-url", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL fehlt im Request-Body." });
  }

  let pageContent = "";
  let pageTitle = "";
  let pageDescription = "";

  try {
    // Schritt 1: Webseite abrufen
    const fetchResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!fetchResponse.ok) {
      throw new Error(`HTTP-Fehler! Status: ${fetchResponse.status}`);
    }
    const html = await fetchResponse.text();

    // Schritt 2: Inhalt mit Cheerio parsen
    const $ = cheerio.load(html);
    pageTitle = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
    pageDescription = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';

    // Extrahiere relevante Textinhalte (z.B. erste Absätze, Überschriften)
    let relevantText = '';
    $('p, h1, h2, h3, h4, h5, h6').each((i, el) => {
      if (relevantText.length < 500) { // Begrenze die Länge des Textes für den Prompt
        relevantText += $(el).text().trim() + '\n';
      } else {
        return false; // Break loop
      }
    });
    pageContent = relevantText.substring(0, 1000); // Max 1000 Zeichen für den Prompt

  } catch (error) {
    console.warn(`Fehler beim Abrufen/Parsen der URL ${url}: ${error.message}. Versuche dennoch KI-Analyse.`);
    // Bei Fehler wird pageContent leer sein, KI muss damit umgehen
  }

  // Schritt 3: KI-Prompt basierend auf der Benutzeranweisung erstellen
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

        Wenn du diesen Text erhältst:
        https://on.soundcloud.com/CSyVG10aCwBr2kpdaQ Kriegsgefahr lass uns bitte reden
        Musst du antworten:
        [Bookmark] 🎵 Soundcloud: "Kriegsgefahr" (Lass uns bitte reden)

        Generiere jetzt den Bookmark-Titel für die URL: ${url}
      `;

      try {
        const result = await model.generateContent(userPrompt);
        const responseText = result.response.text();
        
        // Die KI sollte direkt das gewünschte Format liefern, aber trimmen wir es zur Sicherheit
        const formattedBookmark = responseText.trim(); 
        
        res.json({ bookmark: formattedBookmark });

      } catch (error) {
        console.error("Fehler bei der KI-Generierung des Bookmarks:", error);
        res.status(500).json({ error: "Fehler bei der KI-Generierung des Bookmarks." });
      }
    });

// NEU: Erweiterte URL-Anreicherung mit KI
app.post("/api/enrich-url", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL fehlt im Request-Body." });
  }

  let pageContent = "";
  let pageTitle = "";
  let pageDescription = "";

  try {
    // Schritt 1: Webseite abrufen
    const fetchResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!fetchResponse.ok) {
      throw new Error(`HTTP-Fehler! Status: ${fetchResponse.status}`);
    }
    const html = await fetchResponse.text();

    // Schritt 2: Inhalt mit Cheerio parsen
    const $ = cheerio.load(html);
    pageTitle = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
    pageDescription = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';

    // Extrahiere relevante Textinhalte (z.B. erste Absätze, Überschriften)
    let relevantText = '';
    $('p, h1, h2, h3, h4, h5, h6').each((i, el) => {
      if (relevantText.length < 500) { // Begrenze die Länge des Textes für den Prompt
        relevantText += $(el).text().trim() + '\n';
      } else {
        return false; // Break loop
      }
    });
    pageContent = relevantText.substring(0, 1000); // Max 1000 Zeichen für den Prompt

  } catch (error) {
    console.warn(`Fehler beim Abrufen/Parsen der URL ${url}: ${error.message}. Versuche dennoch KI-Analyse.`);
    // Bei Fehler wird pageContent leer sein, KI muss damit umgehen
  }

  // Schritt 3: KI-Prompt basierend auf der Benutzeranweisung erstellen
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

        Wenn du diesen Text erhältst:
        https://on.soundcloud.com/CSyVG10aCwBr2kpdaQ Kriegsgefahr lass uns bitte reden
        Musst du antworten:
        [Bookmark] 🎵 Soundcloud: "Kriegsgefahr" (Lass uns bitte reden)

        Generiere jetzt den Bookmark-Titel für die URL: ${url}
      `;

      try {
        const result = await model.generateContent(userPrompt);
        const responseText = result.response.text();
        
        // Die KI sollte direkt das gewünschte Format liefern, aber trimmen wir es zur Sicherheit
        const formattedBookmark = responseText.trim(); 
        
        res.json({ bookmark: formattedBookmark });

      } catch (error) {
        console.error("Fehler bei der KI-Generierung des Bookmarks:", error);
        res.status(500).json({ error: "Fehler bei der KI-Generierung des Bookmarks." });
      }
    });

// NEU: Digitaler Synapsen-Knüpfer
app.post("/api/suggest-connections", async (req, res) => {
  const { focusNoteContent, allNotes } = req.body;

  if (!focusNoteContent || !allNotes || !Array.isArray(allNotes)) {
    return res.status(400).json({ error: "Fokus-Notiz oder Notiz-Archiv fehlen/sind ungültig." });
  }

  // Begrenze die Anzahl der Notizen im Archiv, um den Prompt nicht zu überladen
  const limitedAllNotes = allNotes.slice(0, 50); // Max 50 Notizen im Archiv für den Prompt

  const notesArchiveText = limitedAllNotes.map(note => `--- Titel: ${note.title}\nInhalt: ${note.content}`).join('\n\n');

  const userPrompt = `
        DEIN ZIEL:
        Du bist ein "Digitaler Synapsen-Knüpfer". Deine Aufgabe ist es, als intelligenter Assistent im Hintergrund zu arbeiten. Du liest die Notizen eines Nutzers und entdeckst verborgene, sinnvolle Verbindungen zwischen ihnen. Dein Ziel ist es, "Aha!"-Momente zu schaffen, indem du thematische Brücken zwischen Gedanken baust, die der Nutzer vielleicht getrennt voneinander aufgeschrieben hat.

        DEIN KONTEXT:
        Du arbeitest in der Notiz-App "Now". Diese App ist nicht nur ein Speicher, sondern ein "digitales Gehirn". Deine Aufgabe ist es, dieses Gehirn lebendig zu halten. Verhindere, dass Notizen zu isolierten Inseln werden. Verwandle sie in ein vernetztes, reiches Wissens-Gewebe.

        DEIN PROZESS:

        Analysiere die FOKUS-NOTIZ:
        Inhalt der Fokus-Notiz:
        ---
        ${focusNoteContent}
        ---

        Durchsuche das GESAMTE WISSEN:
        Hier ist das Archiv aller anderen Notizen des Nutters:
        ---
        ${notesArchiveText}
        ---

        Finde Verbindungen auf ZWEI EBENEN:
        Offensichtliche Verbindungen: Finde andere Notizen, die die exakt gleichen Schlüsselwörter oder Namen enthalten.
        Verborgene (semantische) Verbindungen: Das ist deine wichtigste Aufgabe! Finde Notizen, die thematisch oder konzeptuell verwandt sind, auch wenn sie nicht die gleichen Worte verwenden.

        Filtere und wähle die BESTEN 3 aus: Zeige dem Nutzer nicht alles. Wähle die 3 relevantesten und potenziell überraschendsten Verbindungen aus. Qualität ist wichtiger als Quantität.

        DEIN OUTPUT (Das ist entscheidend!):
        Deine Antwort MUSS eine Liste von Vorschlägen sein. Für JEDEN Vorschlag musst du nicht nur sagen, WELCHE Notiz du vorschlägst, sondern auch, WARUM du sie vorschlägst.

        AUSGABEFORMAT:
        Deine Antwort muss ein JSON-Objekt sein, das eine Liste von Verbindungen enthält. Jedes Objekt in der Liste muss folgendes Format haben:
        {
          "suggested_note_title": "Der Titel der verknüpften Notiz",
          "reason_for_connection": "Eine kurze, prägnante Begründung, warum diese Notiz relevant ist."
        }

        BEISPIELE:
        Die FOKUS-NOTIZ handelt von: "Expose Finja und die Butter schreiben"
        Deine Antwort könnte so aussehen (im JSON-Format):
        [
          {
            "suggested_note_title": "Die Eristoff Protokolle",
            "reason_for_connection": "...weil es hier ebenfalls um die Entwicklung einer erzählerischen Idee geht."
          },
          {
            "suggested_note_title": "Blogbeitrag über Markus Lanz",
            "reason_for_connection": "...weil du hier einen argumentativen Text strukturierst, ähnlich wie bei einem Exposé."
          },
          {
            "suggested_note_title": "Zeichnen mit Licht Tutorial",
            "reason_for_connection": "...weil dies eine weitere deiner kreativen Projektideen ist."
          }
        ]

        Generiere jetzt die 3 besten Verbindungsvorschläge für die oben genannte FOKUS-NOTIZ basierend auf dem Notiz-Archiv. Gib NUR das JSON-Array aus.
      `;

      try {
        const result = await model.generateContent(userPrompt);
        const responseText = result.response.text();
        
        // Die KI sollte direkt das gewünschte JSON liefern, aber trimmen wir es zur Sicherheit
        const cleanJsonText = responseText.trim().replace(/```json\n/g, "").replace(/\n```/g, "");
        
        const suggestions = JSON.parse(cleanJsonText);

        // Validiere das Format der Antwort
        if (!Array.isArray(suggestions) || suggestions.some(s => !s.suggested_note_title || !s.reason_for_connection)) {
            throw new Error("Ungültiges JSON-Format von der KI erhalten.");
        }

        res.json(suggestions);

      } catch (error) {
        console.error("Fehler bei der KI-Generierung der Verbindungen:", error);
        res.status(500).json({ error: "Fehler bei der KI-Generierung der Verbindungen." });
      }
    });

// Server starten


app.listen(PORT, () => {
  console.log(`Server lauscht auf http://localhost:${PORT}`);
});