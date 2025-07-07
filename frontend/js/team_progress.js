
function getProjectId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('projectId') || getCookie('project_id');
}

function getTeamId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('teamId') || getCookie('team_id');
}

const taskSelector = document.getElementById('taskSelector');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const subtasksList = document.getElementById('subtasksList');
const teamNameElement = document.getElementById('teamName');
const projectNameElement = document.getElementById('projectName');


async function loadTeamAndProjectInfo() {
    try {
        const projectId = getProjectId();
        const teamId = getTeamId();

        if (!projectId || !teamId) {
            throw new Error('Missing project ID or team ID');
        }

        const teamResponse = await fetch(`/api/tasks/project/${projectId}/teams`);
        if (!teamResponse.ok) {
            throw new Error('Failed to fetch team information');
        }
        const teams = await teamResponse.json();
        const team = teams.find(t => t.TeamID === parseInt(teamId));
        if (team) {
            teamNameElement.textContent = `Team: ${team.TeamName}`;
        }

        const projectResponse = await fetch(`/api/projects/${projectId}`);
        if (!projectResponse.ok) {
            throw new Error('Failed to fetch project information');
        }
        const project = await projectResponse.json();
        if (project) {
            projectNameElement.textContent = `Project: ${project.ProjectName}`;
        }
    } catch (error) {
        console.error('Error loading team/project info:', error);
        showNotification('Error loading team/project information', 'error');
    }
}

async function loadTeamTasks() {
    try {
        const projectId = getProjectId();
        const teamId = getTeamId();

        if (!projectId || !teamId) {
            throw new Error('Missing project ID or team ID');
        }

        const response = await fetch(`/api/tasks/team/${teamId}/project/${projectId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch tasks');
        }
        const tasks = await response.json();
        console.log('Loaded tasks:', tasks); 
        
        taskSelector.innerHTML = '<option value="">Select a task</option>';
        tasks.forEach(task => {
            const option = document.createElement('option');
            option.value = task._id;
            option.textContent = task.description || 'Untitled Task';
            taskSelector.appendChild(option);
        });

       
        const totalSubtasks = tasks.reduce((sum, task) => sum + (task.subtasks?.length || 0), 0);
        const completedSubtasks = tasks.reduce((sum, task) => 
            sum + (task.subtasks?.filter(st => st.completed).length || 0), 0);
        const progress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
        updateProgressUI(progress);

        taskSelector.addEventListener('change', async (e) => {
            const selectedTaskId = e.target.value;
            console.log('Selected task ID:', selectedTaskId); 
            
            const progressContainer = document.querySelector('.progress-container');
            const subtasksSection = document.querySelector('.subtasks-section');
            
            if (!selectedTaskId) {
                subtasksList.innerHTML = '';
                progressContainer.style.display = 'none';
                subtasksSection.style.display = 'none';
                return;
            }

            progressContainer.style.display = 'block';
            subtasksSection.style.display = 'block';

            const selectedTask = tasks.find(t => t._id === selectedTaskId);
            console.log('Selected task:', selectedTask); 
            
            if (selectedTask) {
       
                const subtasks = selectedTask.subtasks || [];
                subtasksList.innerHTML = subtasks.length > 0 ? subtasks.map(subtask => `
                    <div class="subtask-item">
                        <div class="subtask-info">
                            <span class="subtask-description">${subtask.description || 'Untitled Subtask'}</span>
                            <span class="subtask-status ${subtask.completed ? 'completed' : 'pending'}">
                                ${subtask.completed ? 'Completed' : 'Pending'}
                            </span>
                        </div>
                        <div class="subtask-dates">
                            <span>Start: ${new Date(subtask.startTime).toLocaleDateString()}</span>
                            <span>End: ${new Date(subtask.endTime).toLocaleDateString()}</span>
                        </div>
                    </div>
                `).join('') : '<p>No subtasks found</p>';

             
                const taskProgress = subtasks.length > 0 
                    ? Math.round((subtasks.filter(st => st.completed).length / subtasks.length) * 100)
                    : 0;
                console.log('Task progress:', taskProgress); 
                updateProgressUI(taskProgress);
            }
        });
    } catch (error) {
        console.error('Error loading tasks:', error);
        showNotification('Error loading tasks', 'error');
    }
}

function updateProgressUI(progress) {
    console.log('Updating progress UI:', progress); 
    const progressBar = document.getElementById('progressBar');
    const progressLabel = document.getElementById('progressLabel');
    
    if (progressBar && progressLabel) {
        progressBar.style.width = `${progress}%`;
        progressLabel.textContent = `${progress}%`;
    } else {
        console.error('Progress elements not found:', { progressBar, progressLabel });
    }
}


function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    const projectId = getProjectId();
    const teamId = getTeamId();

    if (!projectId || !teamId) {
        showNotification('Missing project or team ID', 'error');
        return;
    }

    loadTeamAndProjectInfo();
    loadTeamTasks();
}); 