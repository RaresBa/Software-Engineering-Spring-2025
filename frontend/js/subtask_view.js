const API_BASE_URL = 'http://localhost:5555/api';

const urlParams = new URLSearchParams(window.location.search);
const taskId = urlParams.get('taskId');

if (!taskId) {
    console.error('No task ID provided');
    document.body.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <p>No task ID provided</p>
            <a href="/task_view.html" class="back-btn">
                <i class="fas fa-arrow-left"></i> Back to Tasks
            </a>
        </div>
    `;
}

const subtasksList = document.getElementById('subtasksList');
const statusFilter = document.getElementById('statusFilter');
const priorityFilter = document.getElementById('priorityFilter');
const startDateFilter = document.getElementById('startDate');
const endDateFilter = document.getElementById('endDate');
const applyFiltersBtn = document.getElementById('applyFilters');
const sortBySelect = document.getElementById('sortBy');
const sortDirectionBtn = document.getElementById('sortDirection');


let subtasks = [];
let filteredSubtasks = [];
let sortDirection = 'desc';


applyFiltersBtn.addEventListener('click', applyFilters);
sortBySelect.addEventListener('change', () => sortTasks());
sortDirectionBtn.addEventListener('click', () => {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    sortDirectionBtn.innerHTML = `<i class="fas fa-sort-amount-${sortDirection === 'asc' ? 'up' : 'down'}"></i>`;
    sortTasks();
});


async function loadSubtasks() {
    try {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`);
        if (!response.ok) {
            throw new Error('Failed to load task');
        }
        const task = await response.json();
        console.log('Task data:', task);
        subtasks = task.subtasks || [];
        console.log('Subtasks:', subtasks);
        filteredSubtasks = [...subtasks];
        renderSubtasks(filteredSubtasks);
    } catch (error) {
        console.error('Error loading subtasks:', error);
        showError('Failed to load subtasks. Please try again.');
    }
}


function renderSubtasks(subtasks) {
    if (!subtasksList) return;

    if (subtasks.length === 0) {
        subtasksList.innerHTML = `
            <div class="no-tasks">
                <i class="fas fa-tasks"></i>
                <p>No subtasks found</p>
            </div>
        `;
        return;
    }

    subtasksList.innerHTML = subtasks.map(subtask => {
        console.log('Rendering subtask:', subtask);
        const status = subtask.completed ? 'Completed' : 'In Progress';
        const priority = subtask.priority || 'Non-Priority';
        const type = subtask.type || 'Service';
        
        let typeDetails = '';
        if (type === 'Service' && subtask.service) {
            typeDetails = `
                <div class="type-details">
                    <p><strong>Service:</strong> ${subtask.service.name}</p>
                    <p><strong>Hours:</strong> ${subtask.service.estimatedHours}</p>
                    <p><strong>People:</strong> ${subtask.service.estimatedPeople}</p>
                    <p><strong>Cost:</strong> $${subtask.service.estimatedCost}</p>
                </div>
            `;
        } else if (type === 'Good' && subtask.goods) {
            typeDetails = `
                <div class="type-details">
                    <p><strong>Good:</strong> ${subtask.goods.name}</p>
                    <p><strong>Quantity:</strong> ${subtask.goods.estimatedQuantity}</p>
                    <p><strong>Price/Piece:</strong> $${subtask.goods.estimatedPricePerPiece}</p>
                    <p><strong>Total Cost:</strong> $${subtask.goods.estimatedCost}</p>
                </div>
            `;
        }

        return `
            <div class="subtask-item">
                <div class="subtask-info">
                    <div class="subtask-title">${subtask.description || '—'}</div>
                    <div class="subtask-meta">
                        <span class="priority-badge priority-${priority.toLowerCase()}">
                            ${priority}
                        </span>
                        <span class="status-badge status-${status.toLowerCase()}">
                            ${status}
                        </span>
                        <span class="type-badge type-${type.toLowerCase()}">
                            ${type}
                        </span>
                        <span class="date-range">
                            ${formatDate(subtask.startTime)} - ${formatDate(subtask.endTime)}
                        </span>
                    </div>
                    ${typeDetails}
                </div>
                <div class="subtask-actions">
                    <button class="edit-btn" onclick="editSubtask('${subtask._id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-btn" onclick="deleteSubtask('${subtask._id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function applyFilters() {
    const status = statusFilter.value;
    const priority = priorityFilter.value;
    const startDate = startDateFilter.value;
    const endDate = endDateFilter.value;

    filteredSubtasks = subtasks.filter(subtask => {
        const matchesStatus = status === 'all' || subtask.status === status;
        const matchesPriority = priority === 'all' || subtask.priority === priority;
        const matchesStartDate = !startDate || new Date(subtask.startTime) >= new Date(startDate);
        const matchesEndDate = !endDate || new Date(subtask.endTime) <= new Date(endDate);
        
        return matchesStatus && matchesPriority && matchesStartDate && matchesEndDate;
    });

    sortTasks();
}

function sortTasks() {
    const sortBy = sortBySelect.value;
    
    filteredSubtasks.sort((a, b) => {
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

    renderSubtasks(filteredSubtasks);
}

async function updateSubtaskStatus(taskId, subtaskId, isCompleted) {
    try {
        console.log('Updating subtask status:', { taskId, subtaskId, isCompleted });
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/subtasks/${subtaskId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                completed: isCompleted
            })
        });

        if (!response.ok) {
            throw new Error('Failed to update subtask status');
        }

        await loadSubtasks();
    } catch (error) {
        console.error('Error updating subtask status:', error);
        showError('Failed to update subtask status. Please try again.');
    }
}

async function editSubtask(subtaskId) {
    const subtask = subtasks.find(s => s._id === subtaskId);
    if (!subtask) return;

    window.location.href = `/subtask.html?taskId=${taskId}&subtaskId=${subtaskId}`;
}

async function deleteSubtask(subtaskId) {
    if (!confirm('Are you sure you want to delete this subtask?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/subtasks/${subtaskId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete subtask');
        }

        await loadSubtasks();
    } catch (error) {
        console.error('Error deleting subtask:', error);
        showError('Failed to delete subtask. Please try again.');
    }
}


function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString();
}


function showError(message) {
    if (!subtasksList) return;
    
    subtasksList.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <p>${message}</p>
            <button class="retry-btn" onclick="loadSubtasks()">
                <i class="fas fa-redo"></i> Retry
            </button>
        </div>
    `;
}

loadSubtasks(); 