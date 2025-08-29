/**
 * @file database.js
 * @description Central data management interface for the Progress application.
 * Handles all communication with the backend, manages a local cache,
 * and provides data access methods to the rest of the application.
 * Implements optimistic updates for a responsive user experience.
 */

// Assuming a global showToast function exists for user feedback.
// function showToast(message, duration = 3000) { ... }

const database = (() => {
    // --- Private State ---
    const _cache = {
        projects: [],
        tasks: [],
        contexts: [],
        user_settings: {}
    };

    const _api = {
        baseUrl: 'http://localhost:3000/api',

        /**
         * Generic fetch wrapper for API requests.
         * @param {string} endpoint - The API endpoint (e.g., '/tasks').
         * @param {object} [options={}] - Fetch options (method, headers, body).
         * @returns {Promise<any>} The JSON response from the server.
         */
        async request(endpoint, options = {}) {
            const url = this.baseUrl + endpoint;
            const config = {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            };

            if (options.body) {
                config.body = JSON.stringify(options.body);
            }

            try {
                const response = await fetch(url, config);
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ message: response.statusText }));
                    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                }
                // Handle responses with no content (e.g., DELETE)
                if (response.status === 204) {
                    return null;
                }
                return response.json();
            } catch (error) {
                console.error(`API request failed for ${options.method || 'GET'} ${endpoint}:`, error);
                throw error;
            }
        }
    };

    // --- Public API ---
    const publicApi = {
        /**
         * Initializes the local cache by fetching all projects and tasks from the backend.
         * @returns {Promise<boolean>} True if initialization was successful, false otherwise.
         */
        async initialize() {
            try {
                const [projects, tasks] = await Promise.all([
                    _api.request('/projects'),
                    _api.request('/tasks')
                ]);
                _cache.projects = projects || [];
                _cache.tasks = tasks || [];
                console.log('Database initialized successfully.');
                return true;
            } catch (error) {
                console.error('Failed to initialize database:', error);
                showToast('Error: Could not load data from server.');
                return false;
            }
        },

        // --- Task Methods ---

        /**
         * Adds a new task by sending it to the backend and then adding the response to the cache.
         * @param {object} taskData - The data for the new task.
         * @returns {Promise<object|null>} The newly created task or null on failure.
         */
        async addTask(taskData) {
            try {
                const newTask = await _api.request('/tasks', { method: 'POST', body: taskData });
                _cache.tasks.push(newTask);
                return newTask;
            } catch (error) {
                showToast('Error: Could not create task.');
                return null;
            }
        },

        /**
         * Updates a task using an optimistic approach.
         * @param {string|number} taskId - The ID of the task to update.
         * @param {object} updateData - An object with the properties to update.
         * @returns {Promise<object|null>} The updated task or null on failure.
         */
        async updateTask(taskId, updateData) {
            const taskIndex = _cache.tasks.findIndex(t => t.id === taskId);
            if (taskIndex === -1) return null;

            const originalTask = { ..._cache.tasks[taskIndex] };
            const updatedTask = { ...originalTask, ...updateData };

            // Optimistic update
            _cache.tasks[taskIndex] = updatedTask;

            try {
                // The backend response is the source of truth after update
                const savedTask = await _api.request(`/tasks/${taskId}`, { method: 'PUT', body: updateData });
                _cache.tasks[taskIndex] = savedTask; // Sync with server response
                return savedTask;
            } catch (error) {
                // Rollback on failure
                _cache.tasks[taskIndex] = originalTask;
                showToast('Error: Could not update task.');
                // Notify UI to re-render with rolled-back data
                document.dispatchEvent(new CustomEvent('data-changed'));
                return null;
            }
        },

        /**
         * Deletes a task using an optimistic approach.
         * @param {string|number} taskId - The ID of the task to delete.
         * @returns {Promise<boolean>} True on success, false on failure.
         */
        async deleteTask(taskId) {
            const taskIndex = _cache.tasks.findIndex(t => t.id === taskId);
            if (taskIndex === -1) return false;

            const deletedTask = _cache.tasks[taskIndex];
            
            // Optimistic deletion
            _cache.tasks.splice(taskIndex, 1);

            try {
                await _api.request(`/tasks/${taskId}`, { method: 'DELETE' });
                return true;
            } catch (error) {
                // Rollback on failure
                _cache.tasks.splice(taskIndex, 0, deletedTask);
                showToast('Error: Could not delete task.');
                // Notify UI to re-render with rolled-back data
                document.dispatchEvent(new CustomEvent('data-changed'));
                return false;
            }
        },

        /**
         * Toggles the completion status of a task.
         * @param {string|number} taskId - The ID of the task.
         * @returns {Promise<object|null>} The updated task or null.
         */
        toggleTaskCompleted(taskId) {
            const task = this.getTaskById(taskId);
            if (!task) return Promise.resolve(null);
            return this.updateTask(taskId, { completed: !task.completed });
        },

        // --- Project Methods ---

        /**
         * Adds a new project.
         * @param {object} projectData - Data for the new project.
         * @returns {Promise<object|null>} The newly created project or null on failure.
         */
        async addProject(projectData) {
            try {
                const newProject = await _api.request('/projects', { method: 'POST', body: projectData });
                _cache.projects.push(newProject);
                return newProject;
            } catch (error) {
                showToast('Error: Could not create project.');
                return null;
            }
        },

        // --- Getter Functions (operating on the local cache) ---

        getTasks: () => _cache.tasks,
        getProjects: () => _cache.projects,
        getTaskById: (id) => _cache.tasks.find(t => t.id === id),
        getProjectById: (id) => _cache.projects.find(p => p.id === id),
        getActiveProjects: () => _cache.projects.filter(p => p.status === 'active'),
        getTasksByProjectId: (projectId) => _cache.tasks.filter(t => t.projectId === projectId),
        
        /**
         * Gets tasks scheduled for today.
         * @returns {Array<object>}
         */
        getTodayTasks() {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            return _cache.tasks.filter(task => 
                !task.completed && task.scheduled_at && task.scheduled_at.startsWith(today)
            );
        },

        /**
         * Gets tasks scheduled for the next 7 days.
         * @returns {Array<object>}
         */
        getUpcomingTasks() {
            const today = new Date();
            const nextWeek = new Date();
            nextWeek.setDate(today.getDate() + 7);
            today.setHours(0, 0, 0, 0); // Start of today

            return _cache.tasks.filter(task => {
                if (task.completed || !task.scheduled_at) return false;
                const scheduledDate = new Date(task.scheduled_at);
                return scheduledDate >= today && scheduledDate <= nextWeek;
            });
        }
    };

    return publicApi;
})();