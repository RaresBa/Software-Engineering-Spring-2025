
const API_BASE_URL = 'http://localhost:5555/api';
const GOOGLE_CONFIG = {
    CLIENT_ID: '892305130865-jdmsagkvfjetiefvhg0llln05t6lmjbh.apps.googleusercontent.com',
    SCOPES: "https://www.googleapis.com/auth/calendar.events",
    REDIRECT_URI: 'http://localhost:5000'
};


let accessToken = null;
let signoutButton;
let isEditMode = false;
let editTaskId = null;
let tasksLoaded = false;
let tokenClient = null;
let teamId = null;
let projectId = null;
let tasks = [];
let filteredTasks = [];


function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}


document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('DOM fully loaded, initializing team lead view...');
        projectId = getUrlParameter('projectId');
        if (!projectId) {
            throw new Error('No project ID provided');
        }
        await initializeTeamLeadView();
        initializeFilters();
    } catch (err) {
        console.error('Error initializing page:', err);
        showNotification('An error occurred while loading the page', 'error');
    }
});

function initializeFilters() {
    const applyFiltersBtn = document.getElementById('applyFilters');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
    }
}


function applyFilters() {
    const statusFilter = document.getElementById('statusFilter');
    const priorityFilter = document.getElementById('priorityFilter');
    const startDateFilter = document.getElementById('startDate');
    const endDateFilter = document.getElementById('endDate');

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

    renderFilteredTasks();
}

function renderFilteredTasks() {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;

    tableBody.innerHTML = ''; 
    filteredTasks.forEach(task => {
        addTaskToTable(task);
    });
}

async function initializeTeamLeadView() {
    console.log('Initializing team lead view...');
    try {
        const projectId = getCookie('project_id');
        const teamId = getCookie('team_id');
        
        if (!projectId || !teamId) {
            throw new Error('Missing project or team information');
        }

        window.projectId = projectId;
        window.teamId = teamId;
        
        const userRoleElement = document.getElementById('userRole');
        if (userRoleElement) {
            userRoleElement.textContent = `Team Lead`;
        }
        
        initializeGoogleAuth();
        await loadTeamTasks();
    } catch (error) {
        console.error('Error in initialization:', error);
        showNotification(error.message || 'Please log in to access this page', 'error');
        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 2000);
    }
}


function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function initializeGoogleAuth() {
    try {
        if (typeof google === 'undefined' || !google.accounts) {
            console.log('Waiting for Google Identity Services to load...');
            setTimeout(initializeGoogleAuth, 100);
            return;
        }

        console.log('Initializing Google Sign-In...');
        
        google.accounts.id.initialize({
            client_id: GOOGLE_CONFIG.CLIENT_ID,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            prompt_parent_id: 'g_id_signin',
            ux_mode: 'popup',
            flow: 'implicit',
            scope: GOOGLE_CONFIG.SCOPES,
            origin: window.location.origin
        });

        google.accounts.id.renderButton(
            document.getElementById('g_id_signin'),
            {
                type: 'standard',
                theme: 'outline',
                size: 'large',
                width: '250px',
                text: 'signin_with',
                shape: 'rectangular',
                logo_alignment: 'left'
            }
        );

        console.log('Google Sign-In button rendered');

        signoutButton = document.getElementById('signout_button');
        if (signoutButton) {
            signoutButton.onclick = handleSignout;
        }

    } catch (error) {
        console.error('Error initializing Google Auth:', error);
        const signinContainer = document.getElementById('g_id_signin');
        if (signinContainer) {
            signinContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Unable to load Google Sign-In. Please check your browser settings and try again.</p>
                    <button onclick="window.location.reload()" class="retry-btn">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            `;
        }
    }
}

function handleCredentialResponse(response) {
    try {
        if (!response || !response.credential) {
            throw new Error('No credential received from Google');
        }

        console.log('Received credential response');

        localStorage.setItem('google_token', response.credential);
        
        document.getElementById('g_id_signin').style.display = 'none';
        document.getElementById('signout_button').style.display = 'block';

        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CONFIG.CLIENT_ID,
            scope: GOOGLE_CONFIG.SCOPES,
            callback: function(tokenResponse) {
                if (tokenResponse.error) {
                    console.error('Token Error:', tokenResponse);
                    showNotification("Google sign-in failed.", 'error');
                    return;
                }
                accessToken = tokenResponse.access_token;
                localStorage.setItem('access_token', accessToken);
                console.log('Got access token:', accessToken);
                if (!tasksLoaded) {
                    loadTeamTasks();
                }
            }
        });

        tokenClient.requestAccessToken({prompt: ''});
        
    } catch (error) {
        console.error('Error handling credential response:', error);
        showNotification('There was an error signing in. Please try again.', 'error');
        document.getElementById('g_id_signin').style.display = 'block';
        document.getElementById('signout_button').style.display = 'none';
    }
}

function handleSignout() {
    try {
        google.accounts.id.disableAutoSelect();
        accessToken = null;
        localStorage.removeItem('google_token');
        document.getElementById('g_id_signin').style.display = 'block';
        signoutButton.style.display = 'none';
        tasksLoaded = false;
    } catch (error) {
        console.error('Error during signout:', error);
        showNotification('Error signing out. Please try again.', 'error');
    }
}

async function loadTeamTasks() {
    console.log('Loading team tasks...');
    const tableBody = document.getElementById('table-body');
    
    if (!tableBody) {
        console.error('Table body element not found!');
        return;
    }

    try {
        console.log('Making API request with team_id:', window.teamId, 'project_id:', window.projectId);
        const tasksResponse = await fetch(`${API_BASE_URL}/tasks?team_id=${window.teamId}&project_id=${window.projectId}`);
        
        if (!tasksResponse.ok) {
            if (tasksResponse.status === 401) {
                window.location.href = '/login';
                return;
            }
            throw new Error('Failed to load tasks');
        }
        
        tasks = await tasksResponse.json();
        console.log('Received tasks:', tasks);

        if (Array.isArray(tasks)) {
            filteredTasks = [...tasks]; 
            renderFilteredTasks();
            tasksLoaded = true;
        } else {
            console.error("Expected tasks array, got:", tasks);
        }
    } catch (err) {
        console.error('Error loading tasks:', err);
        tableBody.innerHTML = `<tr><td colspan="11">Error loading tasks: ${err.message}</td></tr>`;
    }
}

function viewTeamProgress() {
    window.location.href = `/progress.html?projectId=${window.projectId}&teamId=${window.teamId}`;
}

function addTaskToTable(task) {
    const tableBody = document.getElementById('table-body');
    const row = document.createElement('tr');
    row.setAttribute('data-task-id', task._id);

    let progressPercentage = 0;
    if (task.subtasks && Array.isArray(task.subtasks) && task.subtasks.length > 0) {
        const completedSubtasks = task.subtasks.filter(sub => sub.completed).length;
        progressPercentage = Math.round((completedSubtasks / task.subtasks.length) * 100);
    }


    const getTeamName = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/tasks/project/${projectId}/teams`);
            if (!response.ok) {
                throw new Error('Failed to fetch teams');
            }
            const teams = await response.json();
            const team = teams.find(t => t.TeamID === task.team_id);
            return team ? team.TeamName : 'Unknown Team';
        } catch (error) {
            console.error('Error fetching team name:', error);
            return 'Unknown Team';
        }
    };

    row.innerHTML = `
        <td>
            <span class="toggle-arrow" onclick="toggleSubtasks('${task._id}', this)">${task.subtasks && task.subtasks.length > 0 ? '▶' : ''}</span>
            ${task._id}
        </td>
        <td>
            ${task.description}
            ${task.status === 'Completed' ? '<span class="completed-tag">COMPLETED</span>' : ''}
        </td>
        <td>${task.priority}</td>
        <td class="status-${task.status.toLowerCase().replace(' ', '-')}">
            <span class="status-icon">${getStatusIcon(task.status)}</span>
            <select onchange="updateTaskStatus('${task._id}', this.value, this)">
                <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                <option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
                <option value="Frozen" ${task.status === 'Frozen' ? 'selected' : ''}>Frozen</option>
            </select>
        </td>
        <td>${formatDate(task.startTime)}</td>
        <td>${formatDate(task.endTime)}</td>
        <td class="team-name">Loading...</td>
        <td>
            <div class="calendar-buttons">
                <button onclick="addToCalendar('${task._id}')" class="action-btn" title="Add to Calendar">
                    <i class="fas fa-calendar-plus"></i>
                </button>
                ${task.googleEventId ? `
                    <button onclick="removeFromCalendar('${task._id}')" class="action-btn" title="Remove from Calendar">
                        <i class="fas fa-calendar-minus"></i>
                    </button>
                ` : ''}
            </div>
        </td>
        <td>
            <button onclick="viewSubtasks('${task._id}')" class="subtask-btn">
                <i class="fas fa-tasks"></i> Subtasks
                <span class="subtask-count">${task.subtasks ? task.subtasks.length : 0}</span>
            </button>
        </td>
    `;
    tableBody.appendChild(row);

    getTeamName().then(teamName => {
        const teamCell = row.querySelector('.team-name');
        if (teamCell) {
            teamCell.textContent = teamName;
        }
    });

    if (task.subtasks && Array.isArray(task.subtasks)) {
        task.subtasks.forEach(subtask => {
            const subtaskRow = document.createElement('tr');
            subtaskRow.className = `subtask-row-${task._id} subtask-row`;
            subtaskRow.style.display = 'none';
            subtaskRow.innerHTML = `
                <td><span style="color:#888;">🟢</span> ${subtask._id}</td>
                <td>${subtask.description}</td>
                <td>${subtask.priority || '—'}</td>
                <td>
                    <select onchange="updateSubtaskStatusDropdown('${task._id}', '${subtask._id}', this.value)">
                        <option value="In Progress" ${subtask.status === 'In Progress' || !subtask.completed ? 'selected' : ''}>In Progress</option>
                        <option value="Completed" ${subtask.status === 'Completed' || subtask.completed ? 'selected' : ''}>Completed</option>
                    </select>
                </td>
                <td>${formatDate(subtask.startTime)}</td>
                <td>${formatDate(subtask.endTime)}</td>
                <td class="team-name">Loading...</td>
                <td>
                    <div class="calendar-buttons"></div>
                </td>
                <td>
                    <input type="checkbox" ${subtask.completed ? 'checked' : ''} 
                           onchange="updateSubtaskStatus('${task._id}', '${subtask._id}', this.checked)">
                </td>
            `;
            tableBody.appendChild(subtaskRow);

            getTeamName().then(teamName => {
                const teamCell = subtaskRow.querySelector('.team-name');
                if (teamCell) {
                    teamCell.textContent = teamName;
                }
            });
        });
    }
}

function viewSubtasks(taskId) {
    localStorage.setItem('parentTaskId', taskId);
    window.location.href = 'subtask.html';
}

function toggleSubtasks(taskId, arrow) {
    const rows = document.querySelectorAll(`.subtask-row-${taskId}`);
    const isHidden = rows[0]?.style.display === 'none';

    rows.forEach(row => {
        row.style.display = isHidden ? 'table-row' : 'none';
    });

    arrow.innerHTML = isHidden ? '▼' : '▶';
}


function formatDate(dateString) {
    if (!dateString) return '—';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusIcon(status) {
    switch(status) {
        case 'Completed':
            return '<i class="fas fa-check-circle" style="color: #4CAF50;"></i>';
        case 'In Progress':
            return '<i class="fas fa-spinner fa-spin" style="color: #2196F3;"></i>';
        case 'Frozen':
            return '<i class="fas fa-snowflake" style="color: #9C27B0;"></i>';
        default:
            return '<i class="fas fa-question-circle" style="color: #FF9800;"></i>';
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <span>${message}</span>
        </div>
        <div class="notification-progress"></div>
    `;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 100);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        transform: translateX(120%);
        transition: transform 0.3s ease;
        z-index: 1000;
        min-width: 300px;
        max-width: 400px;
    }

    .notification.show {
        transform: translateX(0);
    }

    .notification-content {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
    }

    .notification i {
        font-size: 20px;
    }

    .notification.success {
        border-left: 4px solid #28a745;
    }

    .notification.success i {
        color: #28a745;
    }

    .notification.error {
        border-left: 4px solid #dc3545;
    }

    .notification.error i {
        color: #dc3545;
    }

    .notification-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: #28a745;
        width: 100%;
        animation: progress 3s linear;
    }

    .notification.error .notification-progress {
        background: #dc3545;
    }

    @keyframes progress {
        from { width: 100%; }
        to { width: 0%; }
    }
`;
document.head.appendChild(notificationStyles);

function updateTaskStatus(taskId, newStatus, selectElement) {
    const row = selectElement.closest('tr');
    const descriptionCell = row.cells[1];
    const statusIcon = row.querySelector('.status-icon');
    const previousStatus = row.querySelector('select').value;

    statusIcon.innerHTML = getStatusIcon(newStatus);

    const completedTag = descriptionCell.querySelector('.completed-tag');
    if (newStatus === 'Completed') {
        if (!completedTag) {
            const newTag = document.createElement('span');
            newTag.innerText = 'COMPLETED';
            newTag.className = 'completed-tag';
            descriptionCell.appendChild(newTag);
        }
    } else {
        if (completedTag) {
            completedTag.remove();
        }
    }

    const subtaskRows = document.querySelectorAll(`.subtask-row-${taskId}`);
    subtaskRows.forEach(subRow => {
        const statusCell = subRow.cells[3];
        statusCell.innerText = newStatus === 'Completed' ? '✅' : 'In Progress';
    });


    fetch(`http://localhost:5555/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
    })
    .then(res => {
        if (!res.ok) {
            throw new Error('Failed to update task status');
        }
        return res.json();
    })
    .then(updatedTask => {
        console.log('Task updated successfully:', updatedTask);
        showNotification('Task status updated successfully', 'success');
    })
    .catch(err => {
        console.error('Error updating task status:', err);
        showNotification('Failed to update task status: ' + err.message, 'error');
    
        statusIcon.innerHTML = getStatusIcon(previousStatus);
        selectElement.value = previousStatus;
        if (newStatus === 'Completed' && completedTag) {
            completedTag.remove();
        } else if (previousStatus === 'Completed' && !completedTag) {
            const newTag = document.createElement('span');
            newTag.innerText = 'COMPLETED';
            newTag.className = 'completed-tag';
            descriptionCell.appendChild(newTag);
        }
    });
}


function updateSubtaskStatus(taskId, subtaskId, completed) {
    console.log('Sending update request:', {
        taskId,
        subtaskId,
        completed
    });
    
    fetch(`http://localhost:5555/api/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed })
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(err => {
                throw new Error(err.error || 'Failed to update subtask');
            });
        }
        return res.json();
    })
    .then(updatedTask => {
        console.log('Subtask updated successfully:', updatedTask);
        
    
        const row = document.querySelector(`tr:has(input[type="checkbox"][checked="${completed}"])`);
        if (row) {
            const statusCell = row.cells[3];
            statusCell.innerText = completed ? 'Completed' : 'In Progress';
        }

        const subtaskRows = document.querySelectorAll(`.subtask-row-${taskId}`);
        const allSubtasksCompleted = Array.from(subtaskRows).every(row => {
            const checkbox = row.querySelector('input[type="checkbox"]');
            return checkbox && checkbox.checked;
        });


        const mainTaskRow = document.querySelector(`tr[data-task-id="${taskId}"]`);
        if (mainTaskRow) {
            const descriptionCell = mainTaskRow.cells[1];
            const statusCell = mainTaskRow.cells[3];
            const statusSelect = statusCell.querySelector('select');
            
 
            const existingTags = descriptionCell.querySelectorAll('.completed-tag');
            existingTags.forEach(tag => tag.remove());
            
            if (allSubtasksCompleted && subtaskRows.length > 0) {
       
                const completedTag = document.createElement('span');
                completedTag.innerText = 'COMPLETED';
                completedTag.className = 'completed-tag';
                descriptionCell.appendChild(completedTag);
                
         
                if (statusSelect) {
                    statusSelect.value = 'Completed';
                    const statusIcon = statusCell.querySelector('.status-icon');
                    if (statusIcon) {
                        statusIcon.innerHTML = getStatusIcon('Completed');
                    }
                }
            } else {
                if (statusSelect) {
                    statusSelect.value = 'In Progress';
                    const statusIcon = statusCell.querySelector('.status-icon');
                    if (statusIcon) {
                        statusIcon.innerHTML = getStatusIcon('In Progress');
                    }
                }
            }
        }
    })
    .catch(err => {
        console.error('Error updating subtask:', err);
        showNotification('Failed to update subtask status: ' + err.message, 'error');
    });
}

function addToCalendar(taskId) {
    if (!accessToken) {

        accessToken = localStorage.getItem('access_token');
        if (!accessToken) {
     
            tokenClient.requestAccessToken({prompt: 'consent'});
            return;
        }
    }

    console.log('Adding task to calendar:', taskId);

    fetch(`http://localhost:5555/api/tasks/${taskId}`)
        .then(res => {
            if (!res.ok) {
                throw new Error('Failed to get task data');
            }
            return res.json();
        })
        .then(task => {
            console.log('Task data:', task);
            
            if (!task) {
                throw new Error('Task not found');
            }

            const event = {
                summary: task.description,
                description: `Priority: ${task.priority}\nTeam: ${task.team_name || 'Unknown Team'}`,
                start: {
                    dateTime: new Date(task.startTime).toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                },
                end: {
                    dateTime: new Date(task.endTime).toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                }
            };

            console.log('Creating calendar event:', event);

            return fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(event)
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(err => {
                        if (err.error && err.error.status === 'UNAUTHENTICATED') {
                  
                            tokenClient.requestAccessToken({prompt: 'consent'});
                            return;
                        }
                        throw new Error(err.error?.message || 'Failed to create calendar event');
                    });
                }
                return res.json();
            })
            .then(response => {
                console.log('Calendar event created:', response);
                
                
                return fetch(`http://localhost:5555/api/tasks/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ googleEventId: response.id })
                });
            });
        })
        .then(() => {
            console.log('Task updated with calendar event ID');
          
            const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
            if (row) {
                const calendarCell = row.querySelector('td:nth-child(8)');
                if (calendarCell) {
                    calendarCell.innerHTML = `
                        <div class="calendar-buttons">
                            <button onclick="addToCalendar('${taskId}')" class="action-btn" title="Add to Calendar">
                                <i class="fas fa-calendar-plus"></i>
                            </button>
                            <button onclick="removeFromCalendar('${taskId}')" class="action-btn" title="Remove from Calendar">
                                <i class="fas fa-calendar-minus"></i>
                            </button>
                        </div>
                    `;
                }
            }
            showNotification('Event added to Calendar!', 'success');
        })
        .catch(err => {
            console.error('Calendar Error:', err);
            showNotification('Failed to add event to Calendar: ' + err.message, 'error');
        });
}


function removeFromCalendar(taskId) {
    if (!accessToken) {
        showNotification("Please sign in to Google first.", 'error');
        return;
    }

    console.log('Removing calendar event for task:', taskId);


    fetch(`http://localhost:5555/api/tasks/${taskId}`)
        .then(res => res.json())
        .then(task => {
            console.log('Task data:', task);
            
           
            if (!task) {
                throw new Error('Task not found');
            }

            const eventId = task.googleEventId || task.google_event_id || task.calendar_event_id;
            
            if (!eventId) {
                console.error('No event ID found in task:', task);
                throw new Error('No calendar event found for this task');
            }

            console.log('Found event ID:', eventId);

     
            fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            })
            .then(() => {
                console.log('Successfully deleted from Google Calendar');
                
                return fetch(`http://localhost:5555/api/tasks/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ googleEventId: null })
                });
            })
            .then(() => {
                console.log('Successfully removed event ID from task');
              
                const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
                if (row) {
                    const calendarCell = row.querySelector('td:nth-child(8)');
                    if (calendarCell) {
                        calendarCell.innerHTML = `
                            <div class="calendar-buttons">
                                <button onclick="addToCalendar('${taskId}')" class="action-btn" title="Add to Calendar">
                                    <i class="fas fa-calendar-plus"></i>
                                </button>
                            </div>
                        `;
                    }
                }
                showNotification('Event removed from Calendar!', 'success');
            })
            .catch(err => {
                console.error('Calendar Error:', err);
                showNotification('Failed to remove event from Calendar: ' + err.message, 'error');
            });
        })
        .catch(err => {
            console.error('Error:', err);
            showNotification('Failed to get task data: ' + err.message, 'error');
        });
}


async function loadTaskCosts() {
    try {

        const response = await fetch(`http://localhost:5555/api/tasks?project_id=${window.projectId}&team_id=${window.teamId}`);
        if (!response.ok) throw new Error('Failed to load tasks');
        const tasks = await response.json();

        const costsTableBody = document.getElementById('costs-table-body');
        costsTableBody.innerHTML = '';

        let totalEstimatedServiceCost = 0;
        let totalEstimatedGoodsCost = 0;
        let totalActualServiceCost = 0;
        let totalActualGoodsCost = 0;

        tasks.forEach(task => {
            const estimatedServiceCost = calculateEstimatedServiceCost(task);
            const estimatedGoodsCost = calculateEstimatedGoodsCost(task);
            const actualServiceCost = calculateActualServiceCost(task);
            const actualGoodsCost = calculateActualGoodsCost(task);

            totalEstimatedServiceCost += estimatedServiceCost;
            totalEstimatedGoodsCost += estimatedGoodsCost;
            totalActualServiceCost += actualServiceCost;
            totalActualGoodsCost += actualGoodsCost;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${task.description}</td>
                <td>$${estimatedServiceCost.toFixed(2)}</td>
                <td>$${estimatedGoodsCost.toFixed(2)}</td>
                <td>$${(estimatedServiceCost + estimatedGoodsCost).toFixed(2)}</td>
                <td>$${actualServiceCost.toFixed(2)}</td>
                <td>$${actualGoodsCost.toFixed(2)}</td>
                <td>$${(actualServiceCost + actualGoodsCost).toFixed(2)}</td>
            `;
            costsTableBody.appendChild(row);
        });

        updateProjectSummary(
            totalEstimatedServiceCost + totalEstimatedGoodsCost,
            totalActualServiceCost + totalActualGoodsCost
        );
    } catch (error) {
        console.error('Error loading task costs:', error);
    }
}

function calculateEstimatedServiceCost(task) {
    if (!task.subtasks) return 0;
    return task.subtasks
        .filter(subtask => subtask.type === 'Service')
        .reduce((total, subtask) => {
            if (subtask.service) {
                return total + (subtask.service.estimatedHours * subtask.service.estimatedPeople * subtask.service.costPerPerson);
            }
            return total;
        }, 0);
}

function calculateEstimatedGoodsCost(task) {
    if (!task.subtasks) return 0;
    return task.subtasks
        .filter(subtask => subtask.type === 'Good')
        .reduce((total, subtask) => {
            if (subtask.goods) {
                return total + (subtask.goods.estimatedQuantity * subtask.goods.estimatedPricePerPiece);
            }
            return total;
        }, 0);
}

function calculateActualServiceCost(task) {
    if (!task.subtasks) return 0;
    return task.subtasks
        .filter(subtask => subtask.type === 'Service')
        .reduce((total, subtask) => {
            if (subtask.service) {
                return total + (subtask.service.actualHours * subtask.service.actualPeople * subtask.service.costPerPerson);
            }
            return total;
        }, 0);
}

function calculateActualGoodsCost(task) {
    if (!task.subtasks) return 0;
    return task.subtasks
        .filter(subtask => subtask.type === 'Good')
        .reduce((total, subtask) => {
            if (subtask.goods) {
                return total + (subtask.goods.actualQuantity * subtask.goods.actualPricePerPiece);
            }
            return total;
        }, 0);
}

function updateProjectSummary(totalEstimated, totalActual) {
    const savings = Math.max(0, totalEstimated - totalActual);
    const extraCost = Math.max(0, totalActual - totalEstimated);

    document.getElementById('projectSavings').textContent = `$${savings.toFixed(2)}`;
    document.getElementById('projectExtraCost').textContent = `$${extraCost.toFixed(2)}`;
}


document.getElementById('applyCostSort')?.addEventListener('click', function() {
    const sortBy = document.getElementById('costSortBy').value;
    const tbody = document.getElementById('costs-table-body');
    const rows = Array.from(tbody.getElementsByTagName('tr'));

    rows.sort((a, b) => {
        if (sortBy === 'cost') {
            const costA = parseFloat(a.cells[3].textContent.replace('$', ''));
            const costB = parseFloat(b.cells[3].textContent.replace('$', ''));
            return costB - costA;
        } else {
            const nameA = a.cells[0].textContent;
            const nameB = b.cells[0].textContent;
            return nameA.localeCompare(nameB);
        }
    });

    rows.forEach(row => tbody.appendChild(row));
});

document.addEventListener('DOMContentLoaded', function() {
    loadTaskCosts();
});



function formatCurrency(amount) {
    return `$${amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

function generateCosts(mult = 1) {

    return {
        labor: Math.round(500 * mult + Math.random() * 200 * mult),
        material: Math.round(300 * mult + Math.random() * 100 * mult),
        additional: Math.round(100 * mult + Math.random() * 50 * mult)
    };
}

function updateProgressBars(costs) {
    const total = costs.labor + costs.material + costs.additional;
    document.getElementById('laborProgress').style.width = total ? `${(costs.labor/total)*100}%` : '0%';
    document.getElementById('materialProgress').style.width = total ? `${(costs.material/total)*100}%` : '0%';
    document.getElementById('additionalProgress').style.width = total ? `${(costs.additional/total)*100}%` : '0%';
}

async function loadTasksDropdown() {
    const taskSelect = document.getElementById('taskSelect');
    if (!taskSelect) return;
    taskSelect.innerHTML = '<option value="">Choose a task...</option>';
    try {
        const response = await fetch(`http://localhost:5555/api/tasks?team_id=${window.teamId}&project_id=${window.projectId}`);
        if (!response.ok) throw new Error('Failed to load tasks');
        const tasks = await response.json();
     
        const priorityTasks = tasks.filter(task => task.priority === 'Priority');
        const nonPriorityTasks = tasks.filter(task => task.priority === 'Non-Priority');
        if (priorityTasks.length > 0) {
            const priorityGroup = document.createElement('optgroup');
            priorityGroup.label = 'Priority Tasks';
            priorityTasks.forEach(task => {
                const option = document.createElement('option');
                option.value = task._id;
                option.textContent = task.description;
                priorityGroup.appendChild(option);
            });
            taskSelect.appendChild(priorityGroup);
        }
        if (nonPriorityTasks.length > 0) {
            const nonPriorityGroup = document.createElement('optgroup');
            nonPriorityGroup.label = 'Non-Priority Tasks';
            nonPriorityTasks.forEach(task => {
                const option = document.createElement('option');
                option.value = task._id;
                option.textContent = task.description;
                nonPriorityGroup.appendChild(option);
            });
            taskSelect.appendChild(nonPriorityGroup);
        }
    } catch (error) {
        console.error('Error loading tasks:', error);
        taskSelect.innerHTML = '<option value="">Error loading tasks</option>';
    }
}

async function loadTaskCostsPMStyle() {
    const taskId = document.getElementById('taskSelect').value;
    const costContent = document.getElementById('costContent');
    if (!taskId) {
        costContent.style.display = 'none';
        return;
    }
    try {
        const response = await fetch(`http://localhost:5555/api/tasks/${taskId}`);
        if (!response.ok) throw new Error('Failed to load task');
        const task = await response.json();
        costContent.style.display = 'block';
      
        const taskCosts = generateCosts(1.5);
        document.getElementById('laborCost').textContent = formatCurrency(taskCosts.labor);
        document.getElementById('materialCost').textContent = formatCurrency(taskCosts.material);
        document.getElementById('additionalCost').textContent = formatCurrency(taskCosts.additional);
        updateProgressBars(taskCosts);

        const subtaskList = document.getElementById('subtaskList');
        subtaskList.innerHTML = '';
        if (task.subtasks && task.subtasks.length > 0) {
            task.subtasks.forEach(subtask => {
                const subtaskCosts = generateCosts(1); 
                const total = subtaskCosts.labor + subtaskCosts.material + subtaskCosts.additional;
                const subtaskEl = document.createElement('div');
                subtaskEl.className = 'subtask-item';
                subtaskEl.innerHTML = `
                    <div class="subtask-header">
                        <h3>${subtask.description}</h3>
                        <span class="total-cost">${formatCurrency(total)}</span>
                    </div>
                    <div class="cost-details">
                        <div class="cost-detail-item">
                            <div class="cost-detail-label">Labor</div>
                            <div class="cost-detail-value">${formatCurrency(subtaskCosts.labor)}</div>
                        </div>
                        <div class="cost-detail-item">
                            <div class="cost-detail-label">Material</div>
                            <div class="cost-detail-value">${formatCurrency(subtaskCosts.material)}</div>
                        </div>
                        <div class="cost-detail-item">
                            <div class="cost-detail-label">Additional</div>
                            <div class="cost-detail-value">${formatCurrency(subtaskCosts.additional)}</div>
                        </div>
                    </div>
                `;
                subtaskList.appendChild(subtaskEl);
            });
        } else {
            subtaskList.innerHTML = '<p>No subtasks found for this task.</p>';
        }
    } catch (error) {
        console.error('Error loading task costs:', error);
        costContent.style.display = 'none';
    }
}

(function() {
    document.addEventListener('DOMContentLoaded', function() {
        loadTasksDropdown();
        const taskSelect = document.getElementById('taskSelect');
        if (taskSelect) {
            taskSelect.addEventListener('change', loadTaskCostsPMStyle);
        }
    });
})();

window.openSubtaskCostModal = async function(taskId) {
    const modal = document.getElementById('subtaskCostModal');
    const list = document.getElementById('subtaskCostList');
    const closeBtn = document.getElementById('closeSubtaskCostModal');
   
    closeBtn.onclick = function() {
        modal.style.display = 'none';
    };

    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };

    list.innerHTML = '<div>Loading subtasks...</div>';
    modal.style.display = 'block';

    try {
        const response = await fetch(`http://localhost:5555/api/tasks/${taskId}`);
        if (!response.ok) throw new Error('Failed to load task');
        const task = await response.json();
        if (!task.subtasks || task.subtasks.length === 0) {
            list.innerHTML = '<div>No subtasks found for this task.</div>';
            return;
        }
        list.innerHTML = '';
        task.subtasks.forEach((subtask, idx) => {
            const row = document.createElement('div');
            row.className = 'subtask-cost-row';
            let fields = '';
            if (subtask.type === 'Service' && subtask.service) {
                fields = `
                    <div class="cost-info">
                        <div class="cost-section">
                            <h4>Estimated Values</h4>
                            <p><strong>Type:</strong> Service</p>
                            <p><strong>Hours:</strong> ${subtask.service.estimatedHours}</p>
                            <p><strong>People:</strong> ${subtask.service.estimatedPeople}</p>
                            <p><strong>Cost per Person:</strong> $${subtask.service.costPerPerson}</p>
                            <p><strong>Total Cost:</strong> $${subtask.service.estimatedCost}</p>
                        </div>
                        <div class="cost-section">
                            <h4>Actual Values</h4>
                            <div class="input-group">
                                <label>Hours:</label>
                                <input type="number" class="actual-hours" value="${subtask.service.actualHours || 0}" min="0" step="0.5">
                            </div>
                            <div class="input-group">
                                <label>People:</label>
                                <input type="number" class="actual-people" value="${subtask.service.actualPeople || 0}" min="0">
                            </div>
                            <p><strong>Cost per Person:</strong> $${subtask.service.costPerPerson}</p>
                            <p><strong>Total Cost:</strong> <span class="actual-cost">$${subtask.service.actualCost || 0}</span></p>
                            <button onclick="updateServiceValues('${task._id}', '${subtask._id}', this)" class="update-btn">
                                <i class="fas fa-check"></i> Enter
                            </button>
                        </div>
                    </div>
                `;
            } else if (subtask.type === 'Good' && subtask.goods) {
                fields = `
                    <div class="cost-info">
                        <div class="cost-section">
                            <h4>Estimated Values</h4>
                            <p><strong>Type:</strong> Good</p>
                            <p><strong>Quantity:</strong> ${subtask.goods.estimatedQuantity}</p>
                            <p><strong>Price/Piece:</strong> $${subtask.goods.estimatedPricePerPiece}</p>
                            <p><strong>Total Cost:</strong> $${subtask.goods.estimatedCost}</p>
                        </div>
                        <div class="cost-section">
                            <h4>Actual Values</h4>
                            <div class="input-group">
                                <label>Quantity:</label>
                                <input type="number" class="actual-quantity" value="${subtask.goods.actualQuantity || 0}" min="0">
                            </div>
                            <div class="input-group">
                                <label>Price/Piece:</label>
                                <input type="number" class="actual-price" value="${subtask.goods.actualPricePerPiece || 0}" min="0" step="0.01">
                            </div>
                            <p><strong>Total Cost:</strong> <span class="actual-cost">$${subtask.goods.actualCost || 0}</span></p>
                            <button onclick="updateGoodsValues('${task._id}', '${subtask._id}', this)" class="update-btn">
                                <i class="fas fa-check"></i> Enter
                            </button>
                        </div>
                    </div>
                `;
            } else {
                fields = `<div class="cost-info"><div class="cost-section"><p>Unknown subtask type</p></div></div>`;
            }
            row.innerHTML = `
                <div class="subtask-header">
                    <h3>${subtask.description} <span class="subtask-type">(${subtask.type})</span></h3>
                    <span class="status-badge status-${subtask.completed ? 'completed' : 'in-progress'}">
                        ${subtask.completed ? 'Completed' : 'In Progress'}
                    </span>
                </div>
                ${fields}
            `;
            list.appendChild(row);
        });
    } catch (error) {
        list.innerHTML = `<div style='color:red;'>Error loading subtasks: ${error.message}</div>`;
    }
};

window.updateServiceValues = async function(taskId, subtaskId, button) {
    const subtaskItem = button.closest('.subtask-cost-row');
    const hoursInput = subtaskItem.querySelector('.actual-hours');
    const peopleInput = subtaskItem.querySelector('.actual-people');
    const costDisplay = subtaskItem.querySelector('.actual-cost');
    const costPerPerson = parseFloat(subtaskItem.querySelector('.cost-section').textContent.match(/Cost per Person: \$(\d+)/)[1]);
    const hours = parseFloat(hoursInput.value);
    const people = parseInt(peopleInput.value);
    if (isNaN(hours) || isNaN(people)) {
        button.innerHTML = '<i class="fas fa-times"></i> Invalid Input';
        button.classList.add('error');
        setTimeout(() => {
            button.innerHTML = '<i class="fas fa-check"></i> Enter';
            button.classList.remove('error');
        }, 2000);
        return;
    }
    const actualCost = hours * people * costPerPerson;
    costDisplay.textContent = `$${actualCost.toFixed(2)}`;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    button.disabled = true;
    try {
        const response = await fetch(`http://localhost:5555/api/tasks/${taskId}/subtasks/${subtaskId}/actual`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service: {
                    actualHours: hours,
                    actualPeople: people,
                    actualCost: actualCost
                }
            })
        });
        if (!response.ok) throw new Error('Failed to update actual values');
        button.innerHTML = '<i class="fas fa-check"></i> Updated';
        button.classList.add('success');
        setTimeout(() => {
            button.innerHTML = '<i class="fas fa-check"></i> Enter';
            button.classList.remove('success');
            button.disabled = false;
        }, 2000);
        
        loadTaskCosts();
    } catch (error) {
        button.innerHTML = '<i class="fas fa-times"></i> Error';
        button.classList.add('error');
        setTimeout(() => {
            button.innerHTML = '<i class="fas fa-check"></i> Enter';
            button.classList.remove('error');
            button.disabled = false;
        }, 2000);
    }
};

window.updateGoodsValues = async function(taskId, subtaskId, button) {
    const subtaskItem = button.closest('.subtask-cost-row');
    const quantityInput = subtaskItem.querySelector('.actual-quantity');
    const priceInput = subtaskItem.querySelector('.actual-price');
    const costDisplay = subtaskItem.querySelector('.actual-cost');
    const quantity = parseFloat(quantityInput.value);
    const pricePerPiece = parseFloat(priceInput.value);
    if (isNaN(quantity) || isNaN(pricePerPiece)) {
        button.innerHTML = '<i class="fas fa-times"></i> Invalid Input';
        button.classList.add('error');
        setTimeout(() => {
            button.innerHTML = '<i class="fas fa-check"></i> Enter';
            button.classList.remove('error');
        }, 2000);
        return;
    }
    const actualCost = quantity * pricePerPiece;
    costDisplay.textContent = `$${actualCost.toFixed(2)}`;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    button.disabled = true;
    try {
        const response = await fetch(`http://localhost:5555/api/tasks/${taskId}/subtasks/${subtaskId}/actual`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                goods: {
                    actualQuantity: quantity,
                    actualPricePerPiece: pricePerPiece,
                    actualCost: actualCost
                }
            })
        });
        if (!response.ok) throw new Error('Failed to update actual values');
        button.innerHTML = '<i class="fas fa-check"></i> Updated';
        button.classList.add('success');
        setTimeout(() => {
            button.innerHTML = '<i class="fas fa-check"></i> Enter';
            button.classList.remove('success');
            button.disabled = false;
        }, 2000);
        loadTaskCosts();
    } catch (error) {
        button.innerHTML = '<i class="fas fa-times"></i> Error';
        button.classList.add('error');
        setTimeout(() => {
            button.innerHTML = '<i class="fas fa-check"></i> Enter';
            button.classList.remove('error');
            button.disabled = false;
        }, 2000);
    }
}; 