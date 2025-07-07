const API_BASE_URL = 'http://localhost:5555/api';
let currentTasks = [];

function showError(message, isFatal = false) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        ${message}
    `;
    
    if (isFatal) {
        errorDiv.style.backgroundColor = 'var(--danger-color)';
    }
    
    document.querySelector('.container').insertBefore(errorDiv, document.querySelector('.card'));
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function calculateProgress(subtasks) {
    try {
        if (!Array.isArray(subtasks)) {
            throw new Error('Invalid subtasks data');
        }
        
        const total = subtasks.length;
        const completed = subtasks.filter(sub => sub.completed).length;
        const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
        
        return { percent, completed, total };
    } catch (error) {
        console.error('Progress calculation error:', error);
        showError('Error calculating progress');
        return { percent: 0, completed: 0, total: 0 };
    }
}

function updateProgressDisplay(progress, subtasks) {
    try {
        const container = document.getElementById('progressContainer');
        const label = document.getElementById('progressLabel');
        const bar = document.getElementById('progressBar');
        const subtasksContainer = document.querySelector('.subtasks-container');

        container.style.display = 'block';
        label.innerText = `${progress.percent}%`;
        bar.style.width = `${progress.percent}%`;

        if (progress.percent === 100) {
            bar.style.backgroundColor = 'var(--success-color)';
        } else {
            bar.style.backgroundColor = 'var(--primary-color)';
        }

        subtasksContainer.innerHTML = '';
        if (subtasks && subtasks.length > 0) {
            subtasks.forEach(sub => {
                if (!sub || typeof sub !== 'object') {
                    throw new Error('Invalid subtask data');
                }
                const subtaskElement = document.createElement('div');
                subtaskElement.className = 'subtask-item';
                subtaskElement.innerHTML = `
                    <div class="subtask-status ${sub.completed ? 'completed' : ''}">
                        <i class="fas ${sub.completed ? 'fa-check-circle' : 'fa-clock'}"></i>
                    </div>
                    <div class="subtask-content">
                        <div class="subtask-description">${sub.description}</div>
                        <div class="subtask-meta">
                            <span class="subtask-time"><i class="fas fa-clock"></i> ${sub.startTime} - ${sub.endTime}</span>
                            <span class="subtask-priority ${sub.priority === 'Priority' ? 'priority-high' : ''}">
                                <i class="fas fa-flag"></i> ${sub.priority}
                            </span>
                        </div>
                    </div>
                `;
                subtasksContainer.appendChild(subtaskElement);
            });
        } else {
            subtasksContainer.innerHTML = `
                <div class="no-subtasks">
                    <i class="fas fa-info-circle"></i>
                    <p>No subtasks found for this task</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Display update error:', error);
        showError('Error updating progress display');
    }
}

async function loadTasks() {
    try {
    
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project_id');
        
        if (!projectId) {
            throw new Error('Project ID is required');
        }

        const response = await fetch(`${API_BASE_URL}/tasks?project_id=${projectId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const tasks = await response.json();
        
        if (!Array.isArray(tasks)) {
            throw new Error('Invalid tasks data received');
        }

        currentTasks = tasks;
        const selector = document.getElementById('taskSelector');
        
        if (!selector) {
            throw new Error('Task selector element not found');
        }

        selector.innerHTML = '<option disabled selected>Choose a task...</option>';
        
        tasks.forEach(task => {
            if (!task._id || !task.description) {
                console.warn('Invalid task data:', task);
                return;
            }
            const option = document.createElement('option');
            option.value = task._id;
            option.text = task.description;
            selector.appendChild(option);
        });

        selector.onchange = () => {
            try {
                const task = currentTasks.find(t => t._id === selector.value);
                if (task) {
                    const progress = calculateProgress(task.subtasks);
                    updateProgressDisplay(progress, task.subtasks);
                } else {
                    document.getElementById('progressContainer').style.display = 'none';
                    showError('Task not found');
                }
            } catch (error) {
                console.error('Task selection error:', error);
                showError('Error loading task details');
            }
        };
    } catch (error) {
        console.error('Tasks loading error:', error);
        showError('Failed to load tasks. Please try again.', true);
    }
}

async function initializeWithRetry(retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            await loadTasks();
            return;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

window.onload = () => {
    initializeWithRetry().catch(error => {
        console.error('Initialization failed after retries:', error);
        showError('Failed to initialize. Please refresh the page.', true);
    });
}; 