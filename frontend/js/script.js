
const API_BASE_URL = 'http://localhost:5555/api';
const GOOGLE_CONFIG = {
    CLIENT_ID: '892305130865-jdmsagkvfjetiefvhg0llln05t6lmjbh.apps.googleusercontent.com',
    SCOPES: "https://www.googleapis.com/auth/calendar.events",
    REDIRECT_URI: 'http://localhost:5000'
};


console.log('Current URL:', window.location.href);
console.log('Current Origin:', window.location.origin);
console.log('Current Path:', window.location.pathname);


let project_id;
if (window.location.pathname.includes('subtask.html')) {
   
    project_id = parseInt(localStorage.getItem('project_id'));
} else {
  
    project_id = parseInt(new URLSearchParams(window.location.search).get('project_id'));
    if (!isNaN(project_id)) {
        localStorage.setItem('project_id', project_id);
    }
}

console.log('Project ID:', project_id);
console.log('Project ID type:', typeof project_id);

if (!window.location.pathname.includes('subtask.html')) {
    if (isNaN(project_id)) {
        console.error('Invalid project_id:', project_id);
        console.error('URL params:', window.location.search);
        console.error('Current URL:', window.location.href);
    }
}


let accessToken = null;
let signoutButton;
let isEditMode = false;
let editTaskId = null;
let tasksLoaded = false;
let tokenClient = null;
let tasks = []; 
let filteredTasks = []; 


function initializeFilters() {
    const applyFiltersBtn = document.getElementById('applyFilters');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
        
        const filters = ['statusFilter', 'priorityFilter', 'startDate', 'endDate'];
        filters.forEach(filterId => {
            const element = document.getElementById(filterId);
            if (element) {
                element.addEventListener('change', () => {
               
                    const allFiltersEmpty = filters.every(id => {
                        const el = document.getElementById(id);
                        return !el.value || el.value === 'all';
                    });
                    
                    if (allFiltersEmpty) {
                        filteredTasks = [...tasks];
                        renderFilteredTasks();
                    }
                });
            }
        });
    }
}


function applyFilters() {
    const statusFilter = document.getElementById('statusFilter');
    const priorityFilter = document.getElementById('priorityFilter');
    const startDateFilter = document.getElementById('startDate');
    const endDateFilter = document.getElementById('endDate');
    const typeFilter = document.getElementById('typeFilter');

    if (!statusFilter || !priorityFilter || !startDateFilter || !endDateFilter) return;

    const status = statusFilter.value;
    const priority = priorityFilter.value;
    const startDate = startDateFilter.value ? new Date(startDateFilter.value) : null;
    const endDate = endDateFilter.value ? new Date(endDateFilter.value) : null;
    const type = typeFilter ? typeFilter.value : null;


    const isSubtaskPage = window.location.pathname.includes('subtask.html');

    const itemsToFilter = isSubtaskPage ? subtasks : tasks;

    const filteredItems = itemsToFilter.filter(item => {
        const itemStartDate = new Date(item.startTime);
        const itemEndDate = new Date(item.endTime);
        
        const statusMatch = status === 'all' || item.status === status;
        const priorityMatch = priority === 'all' || item.priority === priority;
        const startDateMatch = !startDate || itemStartDate >= startDate;
        const endDateMatch = !endDate || itemEndDate <= endDate;
        const typeMatch = !type || type === 'all' || item.type === type;

        return statusMatch && priorityMatch && startDateMatch && endDateMatch && typeMatch;
    });

  
    renderFilteredItems(filteredItems, isSubtaskPage);
}

function renderFilteredItems(items, isSubtaskPage) {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;

    tableBody.innerHTML = ''; 
    
    if (items.length === 0) {
        const noResultsRow = document.createElement('tr');
        noResultsRow.innerHTML = `
            <td colspan="11" style="text-align: center; padding: 20px;">
                <i class="fas fa-search" style="color: #666; font-size: 24px; margin-bottom: 10px;"></i>
                <p style="color: #666; margin: 0;">No ${isSubtaskPage ? 'subtasks' : 'tasks'} match the current filters</p>
            </td>
        `;
        tableBody.appendChild(noResultsRow);
        return;
    }

 
    items.forEach(item => {
        if (isSubtaskPage) {
            addSubtaskToTable(item);
        } else {
            addTaskToTable(item);
        }
    });
}


function loadGoogleAPI() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.onload = () => {
            console.log('Google Identity Services loaded');
            resolve();
        };
        script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(script);
    });
}


document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('DOM fully loaded, initializing application...');
        if (window.location.pathname.includes('subtask.html')) {
            initializeSubtaskPage();
        } else {
            initializeApp();
        }
    } catch (err) {
        console.error('Error initializing page:', err);
        alert('An error occurred while loading the page');
    }
});

async function initializeApp() {
    console.log('Initializing app...');
    initializeGoogleAuth();
    
    const userRole = localStorage.getItem('user_role') || (window.userRole || '');
    if (userRole !== 'Team Lead') {
        console.log('Loading teams...');
        await loadTeams();
    } else {
        console.log('Skipping loadTeams() for Team Lead');
    }
    
    console.log('Loading tasks...');
    loadTasksFromBackend();
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
            context: 'signin',
            ux_mode: 'popup',
            itp_support: true
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
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CONFIG.CLIENT_ID,
            scope: GOOGLE_CONFIG.SCOPES,
            callback: function(tokenResponse) {
                if (tokenResponse.error) {
                    console.error('Token Error:', tokenResponse);
                    showNotification('Google authentication failed. Please try again.', 'error');
                    return;
                }
                accessToken = tokenResponse.access_token;
                localStorage.setItem('access_token', accessToken);
                console.log('Got access token:', accessToken);
                
           
                const signinContainer = document.getElementById('g_id_signin');
                const signoutButton = document.getElementById('signout_button');
                if (signinContainer) signinContainer.style.display = 'none';
                if (signoutButton) signoutButton.style.display = 'block';
                

                if (!tasksLoaded) {
                    loadTasksFromBackend().then(() => {
      
                        checkFrozenTasks();
                    });
                }
            },
            error_callback: function(error) {
                console.error('OAuth error:', error);
                showNotification('Google authentication failed. Please try again.', 'error');
            }
        });

        signoutButton = document.getElementById('signout_button');
        if (signoutButton) {
            signoutButton.onclick = handleSignout;
        }

        const storedToken = localStorage.getItem('access_token');
        if (storedToken) {
            accessToken = storedToken;
            const signinContainer = document.getElementById('g_id_signin');
            const signoutButton = document.getElementById('signout_button');
            if (signinContainer) signinContainer.style.display = 'none';
            if (signoutButton) signoutButton.style.display = 'block';
            
     
            if (!tasksLoaded) {
                loadTasksFromBackend().then(() => {
                    checkFrozenTasks();
                });
            }
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
   
        const signinContainer = document.getElementById('g_id_signin');
        const signoutButton = document.getElementById('signout_button');
        if (signinContainer) signinContainer.style.display = 'none';
        if (signoutButton) signoutButton.style.display = 'block';

        if (tokenClient) {
            try {
                tokenClient.requestAccessToken({prompt: 'consent'});
            } catch (error) {
                console.warn('Could not automatically get access token, will prompt user when needed', error);
                showNotification('Please sign in to Google Calendar when prompted', 'warning');
            }
        } else {
            console.warn('Token client not initialized, will initialize when calendar functions are used');
            showNotification('Please sign in to Google Calendar when prompted', 'warning');
        }
        
        
        if (!tasksLoaded) {
            loadTasksFromBackend().then(() => {

                checkFrozenTasks();
            });
        }
        
    } catch (error) {
        console.error('Error handling credential response:', error);
        showNotification('There was an error signing in. Please try again.', 'error');
        const signinContainer = document.getElementById('g_id_signin');
        const signoutButton = document.getElementById('signout_button');
        if (signinContainer) signinContainer.style.display = 'block';
        if (signoutButton) signoutButton.style.display = 'none';
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
        alert('Error signing out. Please try again.');
    }
}

async function loadTasksFromBackend() {
    try {
        console.log('Loading tasks from backend...');
        const response = await fetch(`${API_BASE_URL}/tasks?project_id=${project_id}`);
        
        if (!response.ok) {
            if (response.status === 401) {
                console.warn('Unauthorized access; please sign in again.');
                return;
            }
            throw new Error('Failed to load tasks');
        }
        
        tasks = await response.json();
        console.log('Received tasks:', tasks);

        if (Array.isArray(tasks)) {
            filteredTasks = [...tasks]; 
            renderFilteredItems(tasks, false); 
            tasksLoaded = true;
            initializeFilters();
        } else {
            console.error("Expected tasks array, got:", tasks);
        }
    } catch (err) {
        console.error('Error loading tasks:', err);
        showNotification('Error loading tasks: ' + err.message, 'error');
    }
}


async function addTask() {
    try {
        console.log('Starting addTask function');
        const description = document.getElementById('description').value.trim();
        const priority = document.getElementById('priority').value;
        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;
        const team = document.getElementById('team').value;

        console.log('Form values:', { description, priority, startTime, endTime, team });

        
        if (!description) {
            throw new Error('Please enter a description');
        }
        if (!priority) {
            throw new Error('Please select a priority level');
        }
        if (!startTime || !endTime) {
            throw new Error('Please select both start and end times');
        }
        if (!team) {
            throw new Error('Please select a team');
        }

     
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        if (startDate >= endDate) {
            throw new Error('End time must be after start time');
        }


        if (isNaN(project_id)) {
            console.error('Invalid project_id:', project_id);
            throw new Error('Invalid project ID');
        }


        const existingTasksResponse = await fetch(`${API_BASE_URL}/tasks?project_id=${project_id}`);
        if (!existingTasksResponse.ok) {
            throw new Error('Failed to check for existing tasks');
        }
        const existingTasks = await existingTasksResponse.json();
        
        const duplicateTask = existingTasks.find(task => 
            task.description.toLowerCase() === description.toLowerCase() && 
            (!isEditMode || task._id !== editTaskId)
        );
        
        if (duplicateTask) {
            throw new Error('A task with this description already exists in this project');
        }

        const taskData = {
            description,
            priority,
            startTime,
            endTime,
            status: 'In Progress',
            project_id: project_id,
            team_id: parseInt(team)
        };

        console.log('Task data to be sent:', taskData);

        let response;
        if (isEditMode && editTaskId) {
            console.log('Updating existing task:', editTaskId);
            response = await fetch(`${API_BASE_URL}/tasks/${editTaskId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskData)
            });
        } else {
            console.log('Creating new task');
            response = await fetch(`${API_BASE_URL}/tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskData)
            });
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to add/update task');
        }

        const result = await response.json();
        console.log('Success response:', result);

        if (!isEditMode) {
            addTaskToTable(result);
            showNotification('Task created successfully!');
            
            const filesInput = document.getElementById('attachments');
            if (filesInput && filesInput.files.length > 0) {
                const formData = new FormData();
                formData.append('project_id', project_id);
                formData.append('task_id', result._id);
                for (let i = 0; i < filesInput.files.length; i++) {
                    formData.append('files', filesInput.files[i]);
                }
                try {
                    const uploadResponse = await fetch('/upload_task_files', {
                        method: 'POST',
                        body: formData
                    });
                    if (uploadResponse.ok) {
                        const uploadResult = await uploadResponse.json();
                        console.log('Uploaded files:', uploadResult);
                        showNotification('Files uploaded successfully!');
                    } else {
                        console.error('File upload failed');
                        showNotification('File upload failed', 'error');
                    }
                } catch (err) {
                    console.error('Error uploading files:', err);
                    showNotification('Error uploading files', 'error');
                }
            }
        } else {
            showNotification('Task updated successfully!');
            setTimeout(() => window.location.reload(), 1000);
        }

       
        clearForm();
        if (isEditMode) {
            localStorage.removeItem('editMode');
            document.querySelector('button[onclick="addTask()"]').innerText = "Add Task";
        }

    } catch (error) {
        console.error('Error in addTask:', error);
        showNotification(error.message || 'An error occurred', 'error');
    }
}

async function addSubtask() {
    try {
        console.log('Starting addSubtask function');
        const description = document.getElementById('description').value.trim();
        const priority = document.getElementById('priority').value;
        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;
        const type = document.querySelector('input[name="type"]:checked')?.value;

        console.log('Form values:', { description, priority, startTime, endTime, type });

        if (!description) {
            throw new Error('Please enter a description');
        }
        if (!priority) {
            throw new Error('Please select a priority level');
        }
        if (!startTime || !endTime) {
            throw new Error('Please select both start and end times');
        }
        if (!type) {
            throw new Error('Please select a type for the subtask');
        }


        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        if (startDate >= endDate) {
            throw new Error('End time must be after start time');
        }

        const parentTaskId = localStorage.getItem('parentTaskId');
        const subtaskId = localStorage.getItem('subtaskId');
        const isEditMode = localStorage.getItem('editMode') === 'true';

        if (!parentTaskId) {
            throw new Error('No parent task selected');
        }

        const parentTaskResponse = await fetch(`${API_BASE_URL}/tasks/${parentTaskId}`);
        if (!parentTaskResponse.ok) {
            throw new Error('Failed to fetch parent task');
        }
        const parentTask = await parentTaskResponse.json();

        if (!parentTask.project_id || !parentTask.team_id) {
            throw new Error('Parent task is missing required project_id or team_id');
        }

        let serviceOrGoodsData = {};
        if (type === 'Service') {
            const estimatedHours = parseFloat(document.getElementById('estimatedHours').value);
            const estimatedPeople = parseInt(document.getElementById('estimatedPeople').value);

            if (isNaN(estimatedHours) || isNaN(estimatedPeople)) {
                throw new Error('Please enter valid numbers for hours and people');
            }

   
            console.log('Fetching team cost for project:', parentTask.project_id);
            const teamResponse = await fetch(`${API_BASE_URL}/tasks/project/${parentTask.project_id}/teams`);
            if (!teamResponse.ok) {
                throw new Error('Failed to fetch team cost');
            }
            const teams = await teamResponse.json();
            console.log('[Frontend] Teams data:', teams);

            const team = teams.find(t => t.TeamID === parentTask.team_id);
            console.log('[Frontend] Found team:', team);

            if (!team || team.costPerPerson === undefined || team.costPerPerson === null) {
                throw new Error('Team cost is not defined in the database. Please check the team settings.');
            }

            const costPerPerson = parseFloat(team.costPerPerson);
            if (isNaN(costPerPerson)) {
                throw new Error('Invalid team cost value in database');
            }

            console.log('[Frontend] Using cost per person:', costPerPerson);

            const estimatedCost = estimatedHours * estimatedPeople * costPerPerson;
            console.log('Calculated cost:', {
                hours: estimatedHours,
                people: estimatedPeople,
                costPerPerson,
                total: estimatedCost
            });

            
            const costDisplay = document.getElementById('serviceEstimatedCost');
            if (costDisplay) {
                costDisplay.textContent = `$${estimatedCost.toFixed(2)}`;
            }

            serviceOrGoodsData = {
                service: {
                    name: description,
                    estimatedHours,
                    estimatedPeople,
                    costPerPerson,
                    estimatedCost
                }
            };
        } else if (type === 'Good') {
            const estimatedQuantity = parseInt(document.getElementById('estimatedQuantity').value);
            const estimatedPricePerPiece = parseFloat(document.getElementById('estimatedPricePerPiece').value);

            if (isNaN(estimatedQuantity) || isNaN(estimatedPricePerPiece)) {
                throw new Error('Please enter valid numbers for quantity and price');
            }

            const estimatedCost = estimatedQuantity * estimatedPricePerPiece;

    
            const costDisplay = document.getElementById('goodEstimatedCost');
            if (costDisplay) {
                costDisplay.textContent = `$${estimatedCost.toFixed(2)}`;
            }

            serviceOrGoodsData = {
                goods: {
                    name: description,
                    estimatedQuantity,
                    estimatedPricePerPiece,
                    estimatedCost
                }
            };
        }

        const subtaskData = {
            description,
            priority,
            startTime,
            endTime,
            type,
            status: 'In Progress',
            completed: false,
            project_id: parentTask.project_id,
            ...serviceOrGoodsData
        };

        console.log('Subtask data to be sent:', subtaskData);

        let response;
        if (isEditMode && subtaskId) {
            console.log('Editing existing subtask:', subtaskId);
            response = await fetch(`${API_BASE_URL}/tasks/${parentTaskId}/subtasks/${subtaskId}/edit`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subtaskData)
            });
        } else {
            console.log('Adding new subtask to task:', parentTaskId);
            response = await fetch(`${API_BASE_URL}/tasks/${parentTaskId}/subtasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subtaskData)
            });
        }

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server response:', errorData);
            throw new Error(errorData.error || 'Failed to add/update subtask');
        }

        const result = await response.json();
        console.log('Success response:', result);

        if (isEditMode) {
            showNotification('Subtask updated successfully!');
            setTimeout(() => window.location.reload(), 1000);
        } else {
            showNotification('Subtask created successfully!');
            setTimeout(() => window.location.reload(), 1000);
        }

        clearForm();
        if (isEditMode) {
            localStorage.removeItem('editMode');
            localStorage.removeItem('subtaskId');
            document.querySelector('button[onclick="addItem()"]').innerText = "Add Subtask";
        }

    } catch (error) {
        console.error('Error in addSubtask:', error);
        showNotification(error.message || 'An error occurred', 'error');
    }
}

function addItem() {
    if (window.location.pathname.includes('subtask.html')) {
        addSubtask();
    } else {
        addTask();
    }
}


function clearForm() {
    document.getElementById('description').value = '';
    document.getElementById('priority').value = 'Non-Priority';
    document.getElementById('startTime').value = '';
    document.getElementById('endTime').value = '';
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
        if (task.team_name) {
            return task.team_name;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/tasks/project/${project_id}/teams`);
            if (!response.ok) throw new Error('Failed to load teams');
            const teams = await response.json();
            const team = teams.find(t => t.TeamID === task.team_id);
            return team ? team.TeamName : 'Unknown Team';
        } catch (err) {
            console.error('Error loading team name:', err);
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
            <button onclick="deleteTask('${task._id}', this.closest('tr'))" class="action-btn">
                <i class="fas fa-trash"></i>
            </button>
        </td>
        <td>
            <button onclick="editItem('${task._id}')" class="action-btn">
                <i class="fas fa-edit"></i>
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
                    <div class="calendar-buttons">
                        <button onclick="addToCalendar('${subtask._id}')" class="action-btn" title="Add to Calendar">
                            <i class="fas fa-calendar-plus"></i>
                        </button>
                        ${subtask.googleEventId ? `
                            <button onclick="removeFromCalendar('${subtask._id}')" class="action-btn" title="Remove from Calendar">
                                <i class="fas fa-calendar-minus"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
                <td>
                    <button onclick="deleteSubtask('${task._id}', '${subtask._id}')" class="action-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
                <td>
                    <button onclick="editSubtask('${task._id}', '${subtask._id}')" class="action-btn">
                        <i class="fas fa-edit"></i>
                    </button>
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

        const allDone = task.subtasks.length > 0 && task.subtasks.every(s => s.completed);
        if (allDone) {
            const descriptionCell = row.cells[1];
            
            const existingTags = descriptionCell.querySelectorAll('.completed-tag');
            existingTags.forEach(tag => tag.remove());
            
            const completedTag = document.createElement('span');
            completedTag.innerText = 'COMPLETED';
            completedTag.className = 'completed-tag';
            descriptionCell.appendChild(completedTag);
        }
    }
}


function editTask(taskId) {
    fetch(`${API_BASE_URL}/tasks/${taskId}`)
        .then(res => {
            if (!res.ok) {
                throw new Error('Failed to load task');
            }
            return res.json();
        })
        .then(task => {
            loadTaskIntoForm(task);
        })
        .catch(err => {
            console.error('Error loading task:', err);
            showNotification('Failed to load task for editing', 'error');
        });
}

function editSubtask(subtaskId) {
    const parentTaskId = localStorage.getItem('parentTaskId');
    if (!parentTaskId) {
        showNotification('No parent task found', 'error');
        return;
    }

    fetch(`${API_BASE_URL}/tasks/${parentTaskId}/subtasks/${subtaskId}`)
        .then(res => {
            if (!res.ok) {
                throw new Error('Failed to load subtask');
            }
            return res.json();
        })
        .then(subtask => {
            loadSubtaskIntoForm(subtask);
        })
        .catch(err => {
            console.error('Error loading subtask:', err);
            showNotification('Failed to load subtask for editing', 'error');
        });
}


function loadTaskIntoForm(task) {
   
    editTaskId = task._id;
    
    document.getElementById('description').value = task.description;
    document.getElementById('priority').value = task.priority;
    document.getElementById('startTime').value = task.startTime;
    document.getElementById('endTime').value = task.endTime;
    document.getElementById('team').value = task.team_id;

    isEditMode = true;
    const button = document.querySelector('button[onclick="addItem()"]');
    if (button) {
        button.innerText = "Save Update";
    }
}


function loadSubtaskIntoForm(subtask) {
    
    localStorage.setItem('subtaskId', subtask._id);
    localStorage.setItem('editMode', 'true');
    
   
    document.getElementById('description').value = subtask.description;
    document.getElementById('priority').value = subtask.priority;
    document.getElementById('startTime').value = subtask.startTime;
    document.getElementById('endTime').value = subtask.endTime;
    

    const typeRadio = document.querySelector(`input[name="type"][value="${subtask.type}"]`);
    if (typeRadio) {
        typeRadio.checked = true;
  
        typeRadio.dispatchEvent(new Event('change'));
    }

    if (subtask.type === 'Service' && subtask.service) {
        subtask.service.name = subtask.description;
    }

    const button = document.querySelector('button[onclick="addItem()"]');
    if (button) {
        button.innerText = "Save Update";
    }
}

function editItem(taskId) {
    if (window.location.pathname.includes('subtask.html')) {
        editSubtask(taskId);
    } else {
        editTask(taskId);
    }
}

function showDeleteTaskConfirmation(taskId, rowElement) {
    const popup = document.createElement('div');
    popup.className = 'delete-popup task-delete-popup';
    popup.innerHTML = `
        <div class="delete-popup-content">
            <div class="delete-popup-header">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Delete Task</h3>
            </div>
            <div class="delete-popup-body">
                <p>Are you sure you want to delete this task?</p>
                <p class="warning-text">This will also delete all associated subtasks and calendar events.</p>
            </div>
            <div class="delete-popup-buttons">
                <button class="cancel-btn" onclick="this.closest('.delete-popup').remove()">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button class="delete-btn" onclick="confirmDeleteTask('${taskId}', this.closest('.delete-popup'))">
                    <i class="fas fa-trash"></i> Delete Task
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
}

function confirmDeleteTask(taskId, popup) {
   
    fetch(`${API_BASE_URL}/tasks/${taskId}`)
        .then(res => {
            if (!res.ok) {
                throw new Error('Task not found');
            }
            return res.json();
        })
        .then(task => {
           
            if (task && task.googleEventId && accessToken) {
                return gapi.client.calendar.events.delete({
                    calendarId: 'primary',
                    eventId: task.googleEventId
                }).then(() => {
                    console.log("Deleted from Calendar");
                    return fetch(`${API_BASE_URL}/tasks/${taskId}`, { method: 'DELETE' });
                });
            }
            return fetch(`${API_BASE_URL}/tasks/${taskId}`, { method: 'DELETE' });
        })
        .then(res => {
            if (!res.ok) {
                throw new Error('Failed to delete task');
            }
            return res.json();
        })
        .then(() => {
            popup.remove();
           
            const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
            if (row) {
                row.remove();
            } else {
                window.location.reload();
            }
            showNotification('Task deleted successfully!');
        })
        .catch(err => {
            console.error('Error deleting task:', err);
            showNotification(err.message || 'Failed to delete task', 'error');
        });
}

function showDeleteSubtaskConfirmation(subtaskId, rowElement) {
    const popup = document.createElement('div');
    popup.className = 'delete-popup subtask-delete-popup';
    popup.innerHTML = `
        <div class="delete-popup-content">
            <div class="delete-popup-header">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Delete Subtask</h3>
            </div>
            <div class="delete-popup-body">
                <p>Are you sure you want to delete this subtask?</p>
                <p class="warning-text">This action cannot be undone.</p>
            </div>
            <div class="delete-popup-buttons">
                <button class="cancel-btn" onclick="this.closest('.delete-popup').remove()">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button class="delete-btn" onclick="confirmDeleteSubtask('${subtaskId}', this.closest('.delete-popup'))">
                    <i class="fas fa-trash"></i> Delete Subtask
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
}

function confirmDeleteSubtask(subtaskId, popup) {
    const parentTaskId = localStorage.getItem('parentTaskId');
    if (!parentTaskId) {
        showNotification('No parent task found', 'error');
        return;
    }

    fetch(`${API_BASE_URL}/tasks/${parentTaskId}/subtasks/${subtaskId}`, {
        method: 'DELETE'
    })
    .then(res => {
        if (!res.ok) {
            throw new Error('Failed to delete subtask');
        }
        return res.json();
    })
    .then(() => {
        popup.remove();
  
        const row = document.querySelector(`tr[data-subtask-id="${subtaskId}"]`);
        if (row) {
            row.remove();
        } else {
            window.location.reload();
        }
        showNotification('Subtask deleted successfully!');
    })
    .catch(err => {
        console.error('Error deleting subtask:', err);
        showNotification(err.message || 'Failed to delete subtask', 'error');
    });
}

function deleteTask(taskId, rowElement) {
    showDeleteTaskConfirmation(taskId, rowElement);
}

function deleteSubtask(subtaskId, rowElement) {
    showDeleteSubtaskConfirmation(subtaskId, rowElement);
}


const deletePopupStyles = document.createElement('style');
deletePopupStyles.textContent = `
    .delete-popup {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .delete-popup-content {
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        max-width: 450px;
        width: 90%;
    }

    .delete-popup-header {
        background: #fff5f5;
        padding: 20px;
        border-radius: 12px 12px 0 0;
        text-align: center;
        border-bottom: 1px solid #ffe3e3;
    }

    .delete-popup-header i {
        font-size: 32px;
        color: #dc3545;
        margin-bottom: 10px;
    }

    .delete-popup-header h3 {
        color: #dc3545;
        margin: 0;
        font-size: 20px;
    }

    .delete-popup-body {
        padding: 20px;
        text-align: center;
    }

    .delete-popup-body p {
        margin: 10px 0;
        color: #495057;
    }

    .warning-text {
        color: #dc3545;
        font-size: 14px;
        margin-top: 15px;
    }

    .delete-popup-buttons {
        padding: 15px 20px;
        background: #f8f9fa;
        border-radius: 0 0 12px 12px;
        display: flex;
        justify-content: center;
        gap: 15px;
    }

    .delete-popup-buttons button {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.3s ease;
    }

    .cancel-btn {
        background: #e9ecef;
        color: #495057;
    }

    .cancel-btn:hover {
        background: #dee2e6;
    }

    .delete-btn {
        background: #dc3545;
        color: white;
    }

    .delete-btn:hover {
        background: #c82333;
    }
`;
document.head.appendChild(deletePopupStyles);

const calendarPopupStyles = document.createElement('style');
calendarPopupStyles.textContent = `
    .calendar-popup {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 25px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        min-width: 300px;
        max-width: 400px;
        text-align: center;
        animation: popupFadeIn 0.3s ease;
    }

    .calendar-popup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
        animation: overlayFadeIn 0.3s ease;
    }

    .calendar-popup-icon {
        font-size: 48px;
        margin-bottom: 15px;
    }

    .calendar-popup-icon.success {
        color: #4CAF50;
    }

    .calendar-popup-icon.error {
        color: #dc3545;
    }

    .calendar-popup-title {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 10px;
        color: #333;
    }

    .calendar-popup-message {
        color: #666;
        margin-bottom: 20px;
        line-height: 1.5;
    }

    .calendar-popup-buttons {
        display: flex;
        justify-content: center;
        gap: 10px;
    }

    .calendar-popup-button {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.3s ease;
    }

    .calendar-popup-button.primary {
        background: #4CAF50;
        color: white;
    }

    .calendar-popup-button.primary:hover {
        background: #45a049;
    }

    .calendar-popup-button.secondary {
        background: #f8f9fa;
        color: #333;
    }

    .calendar-popup-button.secondary:hover {
        background: #e9ecef;
    }

    @keyframes popupFadeIn {
        from {
            opacity: 0;
            transform: translate(-50%, -60%);
        }
        to {
            opacity: 1;
            transform: translate(-50%, -50%);
        }
    }

    @keyframes overlayFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
`;
document.head.appendChild(calendarPopupStyles);

function showCalendarPopup(type, message) {
    
    const overlay = document.createElement('div');
    overlay.className = 'calendar-popup-overlay';

    const popup = document.createElement('div');
    popup.className = 'calendar-popup';
    
    const icon = type === 'success' ? 'fa-calendar-check' : 'fa-calendar-times';
    const iconColor = type === 'success' ? 'success' : 'error';
    const title = type === 'success' ? 'Event Added to Calendar' : 'Event Removed from Calendar';
    
    popup.innerHTML = `
        <div class="calendar-popup-icon ${iconColor}">
            <i class="fas ${icon}"></i>
        </div>
        <div class="calendar-popup-title">${title}</div>
        <div class="calendar-popup-message">${message}</div>
        <div class="calendar-popup-buttons">
            <button class="calendar-popup-button primary" onclick="this.closest('.calendar-popup-overlay').remove()">
                <i class="fas fa-check"></i> OK
            </button>
        </div>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

  
    setTimeout(() => {
        overlay.remove();
    }, 3000);
}

function addToCalendar(taskId) {
    if (!accessToken) {

        accessToken = localStorage.getItem('access_token');
        
  
        if ((!accessToken || !tokenClient) && typeof google !== 'undefined' && google.accounts) {
      
            if (!tokenClient) {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: GOOGLE_CONFIG.CLIENT_ID,
                    scope: GOOGLE_CONFIG.SCOPES,
                    callback: function(tokenResponse) {
                        if (tokenResponse.error) {
                            console.error('Token Error:', tokenResponse);
                            showCalendarPopup('error', 'Google authentication failed. Please try again.');
                            return;
                        }
                        accessToken = tokenResponse.access_token;
                        localStorage.setItem('access_token', accessToken);
                        console.log('Got access token:', accessToken);
                        
                        
                        addToCalendar(taskId);
                    }
                });
            }
            
            try {
             
                tokenClient.requestAccessToken({prompt: 'consent'});
            } catch (error) {
                console.error('Failed to request access token:', error);
                showCalendarPopup('error', 'Failed to authenticate with Google. Please refresh the page and try again.');
            }
            return;
        } else if (!accessToken) {
            showCalendarPopup('error', 'Please sign in to Google first.');
            return;
        }
    }


    fetch(`${API_BASE_URL}/tasks/${taskId}`)
        .then(res => res.json())
        .then(task => {
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

            
            fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(event)
            })
            .then(res => res.json())
            .then(response => {
                if (response.error) {
                    if (response.error.status === 'UNAUTHENTICATED') {
                    
                        tokenClient.requestAccessToken({prompt: 'consent'});
                        return;
                    }
                    throw new Error(response.error.message);
                }
                
                return fetch(`${API_BASE_URL}/tasks/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ googleEventId: response.id })
                });
            })
            .then(() => {
            
                const buttonContainer = document.querySelector(`tr[data-task-id="${taskId}"] td .calendar-buttons`);
                if (buttonContainer) {
                    buttonContainer.innerHTML = `
                        <button onclick="addToCalendar('${taskId}')" class="action-btn" title="Add to Calendar">
                            <i class="fas fa-calendar-plus"></i>
                        </button>
                        <button onclick="removeFromCalendar('${taskId}')" class="action-btn" title="Remove from Calendar">
                            <i class="fas fa-calendar-minus"></i>
                        </button>
                    `;
                }
                showCalendarPopup('success', 'The event has been successfully added to your Google Calendar.');
            })
            .catch(err => {
                console.error('Calendar Error:', err);
                showCalendarPopup('error', 'Failed to add event to Calendar: ' + err.message);
            });
        })
        .catch(err => {
            console.error('Error:', err);
            showCalendarPopup('error', 'Failed to get task data: ' + err.message);
        });
}

function removeFromCalendar(taskId) {
    if (!accessToken) {
 
        accessToken = localStorage.getItem('access_token');
      
        if ((!accessToken || !tokenClient) && typeof google !== 'undefined' && google.accounts) {
     
            if (!tokenClient) {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: GOOGLE_CONFIG.CLIENT_ID,
                    scope: GOOGLE_CONFIG.SCOPES,
                    callback: function(tokenResponse) {
                        if (tokenResponse.error) {
                            console.error('Token Error:', tokenResponse);
                            showCalendarPopup('error', 'Google authentication failed. Please try again.');
                            return;
                        }
                        accessToken = tokenResponse.access_token;
                        localStorage.setItem('access_token', accessToken);
                        console.log('Got access token:', accessToken);
                        
                     
                        removeFromCalendar(taskId);
                    }
                });
            }
            
            try {
               
                tokenClient.requestAccessToken({prompt: 'consent'});
            } catch (error) {
                console.error('Failed to request access token:', error);
                showCalendarPopup('error', 'Failed to authenticate with Google. Please refresh the page and try again.');
            }
            return;
        } else if (!accessToken) {
            showCalendarPopup('error', 'Please sign in to Google first.');
            return;
        }
    }

    console.log('Removing calendar event for task:', taskId);

    
    fetch(`${API_BASE_URL}/tasks/${taskId}`)
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
                return fetch(`${API_BASE_URL}/tasks/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ googleEventId: null })
                });
            })
            .then(() => {
                console.log('Successfully removed event ID from task');
                
                const buttonContainer = document.querySelector(`tr[data-task-id="${taskId}"] td .calendar-buttons`);
                if (buttonContainer) {
                    buttonContainer.innerHTML = `
                        <button onclick="addToCalendar('${taskId}')" class="action-btn" title="Add to Calendar">
                            <i class="fas fa-calendar-plus"></i>
                        </button>
                    `;
                }
                showCalendarPopup('success', 'The event has been successfully removed from your Google Calendar.');
            })
            .catch(err => {
                console.error('Calendar Error:', err);
                showCalendarPopup('error', 'Failed to remove event from Calendar: ' + err.message);
            });
        })
        .catch(err => {
            console.error('Error:', err);
            showCalendarPopup('error', 'Failed to get task data: ' + err.message);
        });
}


function toggleSubtasks(taskId, arrow) {
    const rows = document.querySelectorAll(`.subtask-row-${taskId}`);
    const isHidden = rows[0]?.style.display === 'none';

    rows.forEach(row => {
        row.style.display = isHidden ? 'table-row' : 'none';
    });

    arrow.innerHTML = isHidden ? '▼' : '▶';
}

function displayTasks(tasks) {
    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = '';

    tasks.forEach(task => {

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${task._id}</td>
            <td>${task.description}</td>
            <td>${task.priority}</td>
            <td class="status-${task.status.toLowerCase().replace(' ', '-')}">${task.status}</td>
            <td>${formatDate(task.startTime)}</td>
            <td>${formatDate(task.endTime)}</td>
            <td>${task.team_name || 'Unknown Team'}</td>
            <td>
                <button onclick="addToCalendar('${task._id}')" class="action-btn">
                    <i class="fas fa-calendar-plus"></i>
                </button>
            </td>
            <td>
                <button onclick="deleteItem('${task._id}')" class="action-btn">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
            <td>
                <button onclick="editItem('${task._id}')" class="action-btn">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
            <td>
                <button onclick="window.location.href='subtask.html?taskId=${task._id}'" class="subtask-btn">
                    <i class="fas fa-tasks"></i> Subtasks
                    <span class="subtask-count">${task.subtasks ? task.subtasks.length : 0}</span>
                </button>
            </td>
        `;
        tableBody.appendChild(row);

        if (task.subtasks && task.subtasks.length > 0) {
            task.subtasks.forEach(subtask => {
                const subtaskRow = document.createElement('tr');
                subtaskRow.className = 'subtask-row';
                subtaskRow.innerHTML = `
                    <td>${subtask._id}</td>
                    <td>${subtask.description}</td>
                    <td>${subtask.priority}</td>
                    <td>
                        <select onchange="updateSubtaskStatusDropdown('${task._id}', '${subtask._id}', this.value)">
                            <option value="In Progress" ${subtask.status === 'In Progress' || !subtask.completed ? 'selected' : ''}>In Progress</option>
                            <option value="Completed" ${subtask.status === 'Completed' || subtask.completed ? 'selected' : ''}>Completed</option>
                        </select>
                    </td>
                    <td>${formatDate(subtask.startTime)}</td>
                    <td>${formatDate(subtask.endTime)}</td>
                    <td>${task.team_name || 'Unknown Team'}</td>
                    <td>
                        <button onclick="addToCalendar('${subtask._id}')" class="action-btn" title="Add to Calendar">
                            <i class="fas fa-calendar-plus"></i>
                        </button>
                    </td>
                    <td>
                        <button onclick="deleteSubtask('${task._id}', '${subtask._id}')" class="action-btn">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                    <td>
                        <button onclick="editSubtask('${task._id}', '${subtask._id}')" class="action-btn">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                `;
                tableBody.appendChild(subtaskRow);
            });
        }
    });
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

function initializeSubtaskPage() {
    try {
        const parentTaskId = localStorage.getItem('parentTaskId');
        if (!parentTaskId) {
            throw new Error('No parent task selected');
        }

        window.subtasks = [];


        const applyFiltersBtn = document.getElementById('applyFilters');
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', applyFilters);
        }


        const statusFilter = document.getElementById('statusFilter');
        const priorityFilter = document.getElementById('priorityFilter');
        const startDateFilter = document.getElementById('startDate');
        const endDateFilter = document.getElementById('endDate');

        if (statusFilter) statusFilter.addEventListener('change', applyFilters);
        if (priorityFilter) priorityFilter.addEventListener('change', applyFilters);
        if (startDateFilter) startDateFilter.addEventListener('change', applyFilters);
        if (endDateFilter) endDateFilter.addEventListener('change', applyFilters);

        const addSubtaskBtn = document.getElementById('add-subtask-btn');
        if (addSubtaskBtn) {
            addSubtaskBtn.addEventListener('click', addSubtask);
        }

        const typeRadios = document.querySelectorAll('input[name="type"]');
        const serviceFields = document.getElementById('serviceFields');
        const goodFields = document.getElementById('goodFields');

        typeRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                if (this.value === 'Service') {
                    serviceFields.style.display = 'block';
                    goodFields.style.display = 'none';
                } else {
                    serviceFields.style.display = 'none';
                    goodFields.style.display = 'block';
                }
            });
        });

        const defaultType = document.querySelector('input[name="type"]:checked')?.value;
        if (defaultType === 'Service') {
            serviceFields.style.display = 'block';
            goodFields.style.display = 'none';
        } else {
            serviceFields.style.display = 'none';
            goodFields.style.display = 'block';
        }

        fetch(`${API_BASE_URL}/tasks/${parentTaskId}`)
            .then(res => {
                if (!res.ok) {
                    throw new Error('Failed to load task data');
                }
                return res.json();
            })
            .then(task => {
                if (!task) {
                    throw new Error('Task not found');
                }

                document.querySelector('.header h1').innerHTML += `: ${task.description}`;

                if (task.subtasks && Array.isArray(task.subtasks)) {
                    window.subtasks = task.subtasks;
                    task.subtasks.forEach(subtask => addSubtaskToTable(subtask));
                }

                const isEditMode = localStorage.getItem('editMode') === 'true';
                const subtaskId = localStorage.getItem('subtaskId');

                if (isEditMode && subtaskId) {
                 
                    const subtaskToEdit = task.subtasks?.find(sub => sub._id === subtaskId);
                    if (subtaskToEdit) {
                        document.getElementById('description').value = subtaskToEdit.description;
                        document.getElementById('priority').value = subtaskToEdit.priority;
                        document.getElementById('startTime').value = subtaskToEdit.startTime;
                        document.getElementById('endTime').value = subtaskToEdit.endTime;
                        document.querySelector('button[onclick="addItem()"]').innerText = "Save Update";
                    } else {
                        localStorage.removeItem('editMode');
                        localStorage.removeItem('subtaskId');
                    }
                }
            })
            .catch(err => {
                console.error('Error loading task:', err);
                alert(err.message || 'Failed to load task data');
            });
    } catch (err) {
        console.error('Initialization error:', err);
        alert(err.message || 'An error occurred');
    }
}


function addSubtaskToTable(subtask) {
    const tableBody = document.getElementById('table-body');
    const row = tableBody.insertRow();
    row.setAttribute('data-subtask-id', subtask._id);

    row.insertCell(0).innerText = subtask._id;
    row.insertCell(1).innerText = subtask.description;
    row.insertCell(2).innerText = subtask.priority;
    

    const statusCell = row.insertCell(3);
    const status = subtask.status || 'In Progress'; 
    statusCell.className = `status-${status.toLowerCase().replace(' ', '-')}`;
    

    const statusIcon = document.createElement('span');
    statusIcon.className = 'status-icon';
    statusIcon.innerHTML = getStatusIcon(status);
    statusCell.appendChild(statusIcon);
    

    const statusSelect = document.createElement('select');
    statusSelect.className = 'status-select';
    statusSelect.innerHTML = `
        <option value="In Progress" ${status === 'In Progress' ? 'selected' : ''}>In Progress</option>
        <option value="Completed" ${status === 'Completed' ? 'selected' : ''}>Completed</option>
        <option value="Frozen" ${status === 'Frozen' ? 'selected' : ''}>Frozen</option>
    `;
    statusSelect.onchange = function() {
        const parentTaskId = localStorage.getItem('parentTaskId');
        if (!parentTaskId) return;
        statusIcon.innerHTML = getStatusIcon(this.value);
        window.updateSubtaskStatusDropdown(parentTaskId, subtask._id, this.value);
    };
    statusCell.appendChild(statusSelect);
    
    row.insertCell(4).innerText = formatDate(subtask.startTime);
    row.insertCell(5).innerText = formatDate(subtask.endTime);
    row.insertCell(6).innerText = subtask.type;

    const editCell = row.insertCell(7);
    const editButton = document.createElement('button');
    editButton.className = 'action-btn';
    editButton.innerHTML = '<i class="fas fa-edit"></i>';
    editButton.onclick = () => editSubtask(subtask._id);
    editCell.appendChild(editButton);

    const deleteCell = row.insertCell(8);
    const deleteButton = document.createElement('button');
    deleteButton.className = 'action-btn';
    deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
    deleteButton.onclick = () => deleteSubtask(subtask._id, row);
    deleteCell.appendChild(deleteButton);
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

document.addEventListener('DOMContentLoaded', function() {
    if (project_id) {
        document.title = `Accord - Project ${project_id}`;
        const header = document.querySelector('.header h1');
        if (header) {
            header.innerHTML = `<i class="fas fa-tasks"></i> Accord -Project ${project_id}`;
        }
    }
});

function deleteProject(projectId) {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
        return;
    }


    fetch(`${API_BASE_URL}/tasks?project_id=${projectId}`, {
        method: 'GET'
    })
    
    .then(res => res.json())
    .then(tasks => {
 
        const deletePromises = tasks.map(task => 
            fetch(`${API_BASE_URL}/tasks/${task._id}`, {
                method: 'DELETE'
            })
        );
        return Promise.all(deletePromises);
    })
    .then(() => {
  
        return fetch(`/project/${projectId}/delete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }

        window.location.reload();
    })
    .catch(err => {
        console.error('Error deleting project:', err);
        alert('Error deleting project: ' + err.message);
    });
}

async function loadTeams() {
    try {
        const response = await fetch(`${API_BASE_URL}/tasks/project/${project_id}/teams`);
        if (!response.ok) throw new Error('Failed to load teams');
        const teams = await response.json();
        
        const teamSelect = document.getElementById('team');
        if (!teamSelect) {
            console.warn('No #team select found on this page, skipping loadTeams()');
            return;
        }
        teamSelect.innerHTML = '<option value="">Select a team...</option>';
        
        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.TeamID;
            option.textContent = team.TeamName;
            teamSelect.appendChild(option);
        });
    } catch (err) {
        console.error('Error loading teams:', err);
    }
}

if (!window.location.pathname.includes('subtask.html')) {
    loadTeams();
}

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


    fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
    })
    .then(res => {
        if (!res.ok) throw new Error('Status update failed');
        return res.json();
    })
    .then(updatedTask => {
        console.log('Status updated successfully');
    })
    .catch(err => {
        console.error('Status update error:', err);

        selectElement.value = previousStatus;
        statusIcon.innerHTML = getStatusIcon(previousStatus);

        if (previousStatus === 'Completed') {
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
    });
}

function viewSubtasks(taskId) {
    localStorage.setItem('parentTaskId', taskId);
    window.location.href = 'subtask.html';
}

function returnToMain() {
    window.history.back();
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 
                          type === 'warning' ? 'fa-exclamation-triangle' : 
                          type === 'error' ? 'fa-times-circle' : 
                          'fa-info-circle'}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="this.closest('.notification').remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    document.body.appendChild(notification);
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

document.addEventListener('DOMContentLoaded', function() {

    initializeApp();
    initializeFilters();
    loadTasksFromBackend();
});