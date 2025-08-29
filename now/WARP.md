# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Architecture

This is a note-taking application built with Electron. The application allows users to create, view, and organize markdown-based notes. It also generates a graph visualization of the relationships between notes.

The application is divided into two main parts:

- **Main Process (`main.js`):** This is the entry point of the application. It's responsible for creating the main browser window, handling application lifecycle events, and managing all interactions with the user's file system and operating system. The main process also handles loading, saving, and parsing notes from markdown files. It uses `electron-store` for settings management and `js-yaml` for parsing frontmatter in the markdown files.

- **Renderer Process (frontend):** The frontend is responsible for rendering the user interface, displaying the notes, and handling user interactions. The main process and renderer process communicate using Electron's Inter-Process Communication (IPC) mechanism.

Key functionalities of the main process include:

- **Note Loading (`notes:load`):** Loads all markdown files from a specified directory, parses their content, and extracts metadata from the frontmatter.
- **Note Saving (`notes:save`):** Saves a note's content and metadata to a markdown file.
- **Graph Building (`notes:buildIndex`):** Creates a graph of the notes, with nodes representing individual notes and edges representing the relationships between them. These relationships are derived from explicit links and contextual tags within the notes.

## Common Development Tasks

### Running the Application

To run the application in a development environment, use the following command:

```bash
npm start
```

This will start the Electron application and open the main window. Developer tools are automatically opened for debugging.

### Modifying the Application

- **Backend Logic:** To modify the backend logic, edit `main.js`. This includes changing how notes are loaded, saved, or how the graph is built.
- **Frontend Logic:** To modify the frontend logic, edit `index.html` and the associated JavaScript files. The frontend is responsible for the user interface and interactions.

### Building for Production

There are no explicit build scripts in `package.json`. To build the application for production, you will need to add a build tool such as `electron-builder` or `electron-packager`.

