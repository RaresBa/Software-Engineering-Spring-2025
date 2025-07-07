
let tasks = [];
let filteredTasks = [];
let sortDirection = 'desc';
let taskTableBody;
let statusFilter;
let priorityFilter;
let startDateFilter;
let endDateFilter;
let applyFiltersBtn;
let sortBySelect;
let sortDirectionBtn;


function getProjectId() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project_id') || getCookie('project_id');
    if (!projectId) {
        console.error('No project ID found');
        return null;
    }
    return projectId;
}


function getTeamId() {
    const teamId = getCookie('team_id');
    if (!teamId) {
        console.error('No team ID found');
        return null;
    }
    return teamId;
}


function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function initializeElements() {
    taskTableBody = document.getElementById('taskTableBody');
    statusFilter = document.getElementById('statusFilter');
    priorityFilter = document.getElementById('priorityFilter');
    startDateFilter = document.getElementById('startDate');
    endDateFilter = document.getElementById('endDate');
    applyFiltersBtn = document.getElementById('applyFilters');
    sortBySelect = document.getElementById('sortBy');
    sortDirectionBtn = document.getElementById('sortDirection');
}

document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    setupEventListeners();
    loadTasks();
});

function setupEventListeners() {
    if (!statusFilter || !priorityFilter || !startDateFilter || !endDateFilter || !applyFiltersBtn || !sortBySelect || !sortDirectionBtn) {
        console.error('Some DOM elements are not initialized');
        return;
    }

    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('sortBy').addEventListener('change', () => sortTasks());
    document.getElementById('sortDirection').addEventListener('click', () => {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        document.getElementById('sortDirection').innerHTML = 
            `<i class="fas fa-sort-amount-${sortDirection === 'asc' ? 'down' : 'up'}"></i>`;
        sortTasks();
    });

    document.getElementById('statusFilter').removeEventListener('change', applyFilters);
    document.getElementById('priorityFilter').removeEventListener('change', applyFilters);
    document.getElementById('startDate').removeEventListener('change', applyFilters);
    document.getElementById('endDate').removeEventListener('change', applyFilters);
}

async function loadTasks() {
    try {
        const projectId = getProjectId();
        const teamId = getTeamId();
        
        if (!projectId) {
            throw new Error('Missing project ID');
        }

        const url = teamId 
            ? `${window.API_BASE_URL}/tasks?project_id=${projectId}&team_id=${teamId}`
            : `${window.API_BASE_URL}/tasks?project_id=${projectId}`;

        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('API Error:', {
                status: response.status,
                statusText: response.statusText,
                error: errorData
            });
            throw new Error(`Failed to fetch tasks: ${response.status} ${response.statusText}`);
        }
        
        tasks = await response.json();
        filteredTasks = [...tasks];
        renderTasks();
    } catch (error) {
        console.error('Error loading tasks:', error);
        showError(error.message || 'Failed to load tasks. Please try again.');
    }
}

function renderTasks() {
    if (!taskTableBody) return;

    if (filteredTasks.length === 0) {
        taskTableBody.innerHTML = `
            <div class="no-tasks">
                <i class="fas fa-tasks"></i>
                <p>No tasks found</p>
            </div>
        `;
        return;
    }

    taskTableBody.innerHTML = filteredTasks.map(task => `
        <div class="task-item" data-task-id="${task._id}">
            <div class="task-main">
                <div class="task-info">
                    <div class="task-title">
                        <i class="fas fa-chevron-right"></i>
                        ${task.description || 'Untitled Task'}
                    </div>
                    <div class="task-meta">
                        <span class="priority-badge priority-${(task.priority || 'medium').toLowerCase()}">
                            ${task.priority || 'Medium'}
                        </span>
                        <span class="status-badge status-${(task.status || 'pending').toLowerCase()}">
                            ${task.status || 'Pending'}
                        </span>
                        <span class="date-range">
                            ${formatDate(task.startTime)} - ${formatDate(task.endTime)}
                        </span>
                    </div>
                </div>
            </div>
            <div class="subtasks-container">
                <div class="loading">
                    <i class="fas fa-spinner"></i> Loading subtasks...
                </div>
            </div>
        </div>
    `).join('');
    document.querySelectorAll('.task-main').forEach(main => {
        main.addEventListener('click', async (e) => {
            const taskItem = main.closest('.task-item');
            const taskId = taskItem.dataset.taskId;
            const subtasksContainer = taskItem.querySelector('.subtasks-container');

            if (taskItem.classList.contains('expanded')) {
                taskItem.classList.remove('expanded');
                subtasksContainer.innerHTML = `
                    <div class="loading">
                        <i class="fas fa-spinner"></i> Loading subtasks...
                    </div>
                `;
            } else {
                taskItem.classList.add('expanded');
                try {
                    const response = await fetch(`${window.API_BASE_URL}/tasks/${taskId}`);
                    if (!response.ok) throw new Error('Failed to fetch task');
                    const task = await response.json();

                    subtasksContainer.innerHTML = task.subtasks.map(subtask => {
                        const status = subtask.status || 'In Progress';
                        const statusClass = status.toLowerCase().replace(' ', '-');
                        return `
                            <div class="subtask-item">
                                <div class="subtask-info">
                                    <div class="subtask-title">${subtask.description || '—'}</div>
                                    <div class="subtask-meta">
                                        <span class="priority-badge priority-${(subtask.priority || 'medium').toLowerCase()}">
                                            ${subtask.priority || 'Medium'}
                                        </span>
                                        <span class="status-badge status-${statusClass}">
                                            <i class="fas ${getStatusIconClass(status)}"></i>
                                            ${status}
                                        </span>
                                        <div class="date-range">
                                            ${formatDate(subtask.startTime)} - ${formatDate(subtask.endTime)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('');
                } catch (error) {
                    console.error('Error loading subtasks:', error);
                    subtasksContainer.innerHTML = `
                        <div class="error-message">
                            <i class="fas fa-exclamation-circle"></i>
                            <p>Failed to load subtasks</p>
                        </div>
                    `;
                }
            }
        });
    });
}

function applyFilters() {
    if (!statusFilter || !priorityFilter || !startDateFilter || !endDateFilter) return;

    const status = statusFilter.value;
    const priority = priorityFilter.value;
    const startDate = startDateFilter.value;
    const endDate = endDateFilter.value;

    filteredTasks = tasks.filter(task => {
        const matchesStatus = status === 'all' || task.status === status;
        const matchesPriority = priority === 'all' || task.priority === priority;
        const matchesStartDate = !startDate || new Date(task.startTime) >= new Date(startDate);
        const matchesEndDate = !endDate || new Date(task.endTime) <= new Date(endDate);
        
        return matchesStatus && matchesPriority && matchesStartDate && matchesEndDate;
    });

    sortTasks();
}

function sortTasks() {
    if (!sortBySelect) return;

    const sortBy = sortBySelect.value;
    
    filteredTasks.sort((a, b) => {
        let comparison = 0;
        
        switch (sortBy) {
            case 'startTime':
                comparison = new Date(a.startTime) - new Date(b.startTime);
                break;
            case 'endTime':
                comparison = new Date(a.endTime) - new Date(b.endTime);
                break;
            case 'priority':
                const priorityOrder = { High: 3, Medium: 2, Low: 1 };
                comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
                break;
            case 'status':
                comparison = a.status.localeCompare(b.status);
                break;
        }
        
        return sortDirection === 'asc' ? comparison : -comparison;
    });

    renderTasks();
}

function addNewTask() {
    console.log('Add new task clicked');
}

function editTask(taskId) {

    console.log('Edit task clicked for task:', taskId);
}

function viewSubtasks(taskId) {
    window.location.href = `http://localhost:5000/subtask_view.html?taskId=${taskId}`;
}

function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

async function updateTaskStatus(taskId, completed) {
    try {
        const response = await fetch(`${window.API_BASE_URL}/tasks/${taskId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ completed })
        });

        if (!response.ok) {
            throw new Error('Failed to update task status');
        }


        await loadTasks();
    } catch (error) {
        console.error('Error updating task status:', error);
        alert('Failed to update task status. Please try again.');
    }
}

function showError(message) {
    if (!taskTableBody) return;
    
    taskTableBody.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <p>${message}</p>
            <button class="retry-btn" onclick="loadTasks()">
                <i class="fas fa-redo"></i> Retry
            </button>
        </div>
    `;
}

window.updateSubtaskStatus = async function(taskId, subtaskId, isCompleted) {
    try {
        console.log('Starting subtask status update:', { taskId, subtaskId, isCompleted });
        
        const currentTaskResponse = await fetch(`${window.API_BASE_URL}/tasks/${taskId}`);
        if (!currentTaskResponse.ok) {
            throw new Error('Failed to fetch current task data');
        }
        const currentTask = await currentTaskResponse.json();
        console.log('Current task data:', currentTask);

        const updateResponse = await fetch(`${window.API_BASE_URL}/tasks/${taskId}/subtasks/${subtaskId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                completed: isCompleted
            })
        });

        if (!updateResponse.ok) {
            const errorData = await updateResponse.json().catch(() => ({}));
            console.error('Update failed:', {
                status: updateResponse.status,
                statusText: updateResponse.statusText,
                error: errorData
            });
            throw new Error('Failed to update subtask status');
        }

        console.log('Status update successful, fetching updated task...');

        const updatedTaskResponse = await fetch(`${window.API_BASE_URL}/tasks/${taskId}`);
        if (!updatedTaskResponse.ok) {
            throw new Error('Failed to fetch updated task data');
        }
        
        const updatedTask = await updatedTaskResponse.json();
        console.log('Updated task data:', updatedTask);

        const subtasks = updatedTask.subtasks || [];
        const allSubtasksCompleted = subtasks.length > 0 && subtasks.every(subtask => subtask.completed);
        
        const parentTaskResponse = await fetch(`${window.API_BASE_URL}/tasks/${taskId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                completed: allSubtasksCompleted,
                status: allSubtasksCompleted ? 'Completed' : 'Pending'
            })
        });

        if (!parentTaskResponse.ok) {
            console.error('Failed to update parent task status');
        }

        await loadTasks();

        const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
        if (taskItem) {
            taskItem.classList.add('expanded');
            const taskMain = taskItem.querySelector('.task-main');
            if (taskMain) {
                taskMain.click(); 
            }
        }
    } catch (error) {
        console.error('Error updating subtask status:', error);
        showError('Failed to update subtask status. Please try again.');
    }
};

function getStatusIconClass(status) {
    switch(status) {
        case 'Completed':
            return 'fa-check-circle';
        case 'In Progress':
            return 'fa-spinner fa-spin';
        case 'Frozen':
            return 'fa-snowflake';
        default:
            return 'fa-spinner fa-spin'; 
    }
}

loadTasks(); 