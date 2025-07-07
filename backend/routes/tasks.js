const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const mysql = require('mysql2/promise');
require('dotenv').config();


router.get('/project/:projectId/teams', async (req, res) => {
    let connection;
    try {
        console.log('[Node] GET /tasks/project/:projectId/teams - Received request for project:', req.params.projectId);
        
        const projectId = parseInt(req.params.projectId);
        if (isNaN(projectId)) {
            console.error('[Node] GET /tasks/project/:projectId/teams - Invalid project ID:', req.params.projectId);
            return res.status(400).json({ error: 'Invalid project ID' });
        }
      
        console.log('[Node] GET /tasks/project/:projectId/teams - Creating MySQL connection');
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'budget',
            port: process.env.DB_PORT || 3306
        });

        console.log('[Node] GET /tasks/project/:projectId/teams - Executing query for project:', projectId);
        const [teams] = await connection.execute(`
            SELECT t.TeamID, t.TeamName, t.Cost as costPerPerson
            FROM teams t
            JOIN projects p ON FIND_IN_SET(t.TeamID, p.TeamIDs) > 0
            WHERE p.ProjectID = ?
        `, [projectId]);

        console.log('[Node] GET /tasks/project/:projectId/teams - Raw teams data:', teams);
        console.log('[Node] GET /tasks/project/:projectId/teams - Number of teams found:', teams.length);

        const validatedTeams = teams.map(team => {
            console.log('[Node] GET /tasks/project/:projectId/teams - Processing team:', {
                TeamID: team.TeamID,
                TeamName: team.TeamName,
                costPerPerson: team.costPerPerson,
                CostType: typeof team.costPerPerson
            });

            if (team.costPerPerson === null || team.costPerPerson === undefined) {
                console.error(`[Node] GET /tasks/project/:projectId/teams - Team ${team.TeamID} has no cost defined in database`);
                return null;
            }

            const costValue = parseFloat(team.costPerPerson);
            if (isNaN(costValue)) {
                console.error(`[Node] GET /tasks/project/:projectId/teams - Team ${team.TeamID} has invalid cost value:`, team.costPerPerson);
                return null;
            }

            return {
                TeamID: team.TeamID,
                TeamName: team.TeamName,
                costPerPerson: costValue
            };
        }).filter(team => team !== null);

        console.log('[Node] GET /tasks/project/:projectId/teams - Validated teams data:', validatedTeams);
        console.log('[Node] GET /tasks/project/:projectId/teams - Number of valid teams:', validatedTeams.length);

        if (validatedTeams.length === 0) {
            throw new Error('No teams found with valid cost values');
        }

        if (connection) {
            await connection.end();
        }

        res.json(validatedTeams);
    } catch (err) {
        console.error('[Node] GET /tasks/project/:projectId/teams - Error:', err);
        if (connection) {
            try {
                await connection.end();
            } catch (closeErr) {
                console.error('[Node] GET /tasks/project/:projectId/teams - Error closing connection:', closeErr);
            }
        }
        res.status(500).json({ error: err.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const project_id = req.query.project_id;
        const team_id = req.query.team_id;
        console.log('[Node] GET /tasks - Received request for project_id:', project_id, 'team_id:', team_id);
        
        if (!project_id) {
            console.error('[Node] GET /tasks - No project_id provided');
            return res.status(400).json({ error: 'Project ID is required' });
        }

    
        const projectId = parseInt(project_id);
        if (isNaN(projectId)) {
            console.error('[Node] GET /tasks - Invalid project_id:', project_id);
            return res.status(400).json({ error: 'Project ID must be a number' });
        }

        const query = { project_id: projectId };
        if (team_id) {
            const teamId = parseInt(team_id);
            if (isNaN(teamId)) {
                console.error('[Node] GET /tasks - Invalid team_id:', team_id);
                return res.status(400).json({ error: 'Team ID must be a number' });
            }
            query.team_id = teamId;
        }

        console.log('[Node] GET /tasks - Query:', query);
        
        const tasks = await Task.find(query).sort({ createdAt: -1 });
        console.log('[Node] GET /tasks - Found tasks:', tasks);
        console.log('[Node] GET /tasks - Number of tasks found:', tasks.length);
        
        res.json(tasks);
    }
    catch (err) { 
        console.error('[Node] GET /tasks - Error:', err);
        res.status(500).json({ error: err.message }); 
    }
});


router.post('/', async (req, res) => {
    try {
        console.log('[Node] POST /tasks - Received request body:', req.body);
        console.log('[Node] POST /tasks - Project ID from request:', req.body.project_id);
        console.log('[Node] POST /tasks - Project ID type:', typeof req.body.project_id);
        
        if (!req.body.project_id) {
            console.error('[Node] POST /tasks - Project ID is missing from request');
            return res.status(400).json({ error: 'Project ID is required' });
        }

        if (!req.body.team_id) {
            console.error('[Node] POST /tasks - Team ID is missing from request');
            return res.status(400).json({ error: 'Team ID is required' });
        }

        const projectId = parseInt(req.body.project_id);
        const teamId = parseInt(req.body.team_id);
        if (isNaN(projectId)) {
            console.error('[Node] POST /tasks - Invalid project_id:', req.body.project_id);
            return res.status(400).json({ error: 'Project ID must be a number' });
        }
        if (isNaN(teamId)) {
            console.error('[Node] POST /tasks - Invalid team_id:', req.body.team_id);
            return res.status(400).json({ error: 'Team ID must be a number' });
        }

        const newTask = new Task({
            description: req.body.description,
            startTime: req.body.startTime,
            endTime: req.body.endTime,
            priority: req.body.priority,
            status: req.body.status || 'In Progress',
            project_id: projectId,
            team_id: teamId,
            subtasks: []
        });

        console.log('[Node] POST /tasks - New task object before save:', newTask);
        const savedTask = await newTask.save();
        console.log('[Node] POST /tasks - Task saved successfully:', savedTask);
        
        res.status(201).json(savedTask);
    } catch (err) {
        console.error('[Node] POST /tasks - Error saving task:', err);
        res.status(500).json({ error: err.message });
    }
});


router.get('/:id', async (req, res) => {
    try { 
        const task = await Task.findById(req.params.id); 
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.json(task); 
    }
    catch (err) { res.status(500).json({ error: err.message }); }
});


router.patch('/:id', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const updateData = { ...req.body };
        delete updateData.project_id;

        const updatedTask = await Task.findByIdAndUpdate(
            req.params.id, 
            updateData, 
            { new: true }
        );
        res.json(updatedTask);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.delete('/:id', async (req, res) => {
    try { 
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        await Task.findByIdAndDelete(req.params.id); 
        res.json({ message: 'Task deleted' }); 
    }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/subtasks', async (req, res) => {
    let connection;
    try {
        console.log('[Node] POST /tasks/:id/subtasks - Received request for task:', req.params.id);
        console.log('[Node] POST /tasks/:id/subtasks - Request body:', req.body);

        const task = await Task.findById(req.params.id);
        if (!task) {
            console.error('[Node] POST /tasks/:id/subtasks - Task not found:', req.params.id);
            return res.status(404).json({ error: 'Task not found' });
        }

        if (!req.body.type || !['Service', 'Good'].includes(req.body.type)) {
            return res.status(400).json({ error: 'Type must be either "Service" or "Good"' });
        }

        let subtask = {
            description: req.body.description,
            startTime: req.body.startTime,
            endTime: req.body.endTime,
            priority: req.body.priority || 'Non-Priority',
            type: req.body.type,
            completed: false,
            status: 'In Progress',
            service: undefined,
            goods: undefined
        };
        
        if (req.body.type === 'Service') {
            if (!req.body.service) {
                return res.status(400).json({ error: 'Service data is required for Service type subtasks' });
            }

            connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME || 'budget',
                decimalNumbers: true
            });

            const [teams] = await connection.execute(`
                SELECT t.Cost as costPerPerson
                FROM teams t
                WHERE t.TeamID = ?
            `, [task.team_id]);

            if (!teams || teams.length === 0) {
                throw new Error(`Team with ID ${task.team_id} not found in database`);
            }

            let rawCost = teams[0].costPerPerson;
            let costPerPerson;

            if (typeof rawCost === 'object' && rawCost !== null && typeof rawCost.toString === 'function') {
                costPerPerson = parseFloat(rawCost.toString());
            } else {
                costPerPerson = parseFloat(rawCost);
            }

            if (isNaN(costPerPerson)) {
                console.error('[Node] POST /tasks/:id/subtasks - Invalid cost value:', {
                    rawCost,
                    type: typeof rawCost,
                    teamId: task.team_id
                });
                throw new Error(`Invalid cost value for team ${task.team_id}`);
            }

            const estimatedHours = parseFloat(req.body.service.estimatedHours);
            const estimatedPeople = parseFloat(req.body.service.estimatedPeople);
            
            if (isNaN(estimatedHours) || isNaN(estimatedPeople)) {
                throw new Error('Invalid estimated hours or people count');
            }

            const estimatedCost = estimatedHours * estimatedPeople * costPerPerson;


            subtask.service = {
                estimatedHours: estimatedHours,
                estimatedPeople: estimatedPeople,
                costPerPerson: costPerPerson,
                estimatedCost: estimatedCost,
                actualHours: 0,
                actualPeople: 0,
                actualCost: 0
            };
            subtask.goods = undefined;
        } else if (req.body.type === 'Good') {
            if (!req.body.goods) {
                return res.status(400).json({ error: 'Goods data is required for Good type subtasks' });
            }

            if (!req.body.goods.estimatedQuantity || !req.body.goods.estimatedPricePerPiece || !req.body.goods.estimatedCost) {
                return res.status(400).json({ error: 'Missing required goods fields' });
            }

            subtask.goods = {
                name: req.body.description,
                estimatedQuantity: parseFloat(req.body.goods.estimatedQuantity),
                estimatedPricePerPiece: parseFloat(req.body.goods.estimatedPricePerPiece),
                estimatedCost: parseFloat(req.body.goods.estimatedCost),
                actualQuantity: 0,
                actualPricePerPiece: 0,
                actualCost: 0
            };
            subtask.service = undefined;
        }

        console.log('[Node] POST /tasks/:id/subtasks - Adding subtask:', subtask);
        task.subtasks.push(subtask);
        
        try {
            await task.save();
            console.log('[Node] POST /tasks/:id/subtasks - Task saved successfully');
            res.json(task);
        } catch (saveError) {
            console.error('[Node] POST /tasks/:id/subtasks - Save error:', saveError);
            if (saveError.name === 'ValidationError') {
                return res.status(400).json({ error: 'Validation error: ' + saveError.message });
            }
            throw saveError;
        }
    } catch (err) {
        console.error('[Node] POST /tasks/:id/subtasks - Error:', err);
        if (connection) {
            try {
                await connection.end();
            } catch (closeErr) {
                console.error('[Node] POST /tasks/:id/subtasks - Error closing connection:', closeErr);
            }
        }
        res.status(500).json({ error: err.message });
    }
});

router.patch('/:id/subtasks/:subtaskId', async (req, res) => {
    let connection;
    try {
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Received request');
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Task ID:', req.params.id);
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Subtask ID:', req.params.subtaskId);
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Request body:', req.body);

        const { id, subtaskId } = req.params;
        const { completed, status } = req.body;

        if (typeof completed !== 'boolean') {
            console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Invalid completed value:', completed);
            return res.status(400).json({ error: 'Completed status must be a boolean' });
        }

        if (status && !['In Progress', 'Completed', 'Frozen'].includes(status)) {
            console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Invalid status value:', status);
            return res.status(400).json({ error: 'Status must be one of: In Progress, Completed, Frozen' });
        }

        const task = await Task.findById(id);
        if (!task) {
            console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Task not found:', id);
            return res.status(404).json({ error: 'Task not found' });
        }

        const subtask = task.subtasks.id(subtaskId);
        if (!subtask) {
            console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Subtask not found:', subtaskId);
            return res.status(404).json({ error: 'Subtask not found' });
        }

        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Current subtask:', subtask);
        subtask.completed = completed;
        if (status) {
            subtask.status = status;
        }
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Updated subtask:', subtask);

        await task.save({ validateBeforeSave: false });
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Task saved successfully');

        let projectName = null;
        let notificationSent = false;

        const anySubtaskFrozen = task.subtasks.some(s => s.status === 'Frozen');
        if (anySubtaskFrozen) {
            task.status = 'Frozen';
            await task.save({ validateBeforeSave: false });
            console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Parent task marked as frozen');

            if (status === 'Frozen') {
                try {
                    connection = await mysql.createConnection({
                        host: process.env.DB_HOST || 'localhost',
                        user: process.env.DB_USER || 'root',
                        password: process.env.DB_PASSWORD,
                        database: process.env.DB_NAME || 'budget'
                    });

                    const [projects] = await connection.execute(
                        'SELECT ProjectName FROM projects WHERE ProjectID = ?',
                        [task.project_id]
                    );

                    if (projects && projects.length > 0) {
                        projectName = projects[0].ProjectName;
                        notificationSent = true;
                    }
                } catch (err) {
                    console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Error fetching project name:', err);
                }
            }
        }
  
        else if (task.subtasks.length > 0 && task.subtasks.every(s => s.completed) && task.status !== 'Completed') {
            task.status = 'Completed';
            await task.save({ validateBeforeSave: false });
            console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Parent task marked as completed');
        }
   
        else if (!anySubtaskFrozen && !task.subtasks.every(s => s.completed)) {
            task.status = 'In Progress';
            await task.save({ validateBeforeSave: false });
            console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Parent task marked as in progress');
        }    
        const updatedTask = await Task.findById(id);
        
    
        const response = {
            task: updatedTask,
            notification: notificationSent ? {
                type: 'frozen',
                message: `Frozen subtask for project "${projectName}". Please review the project.`
            } : null
        };

        res.json(response);
    } catch (err) {
        console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch (closeErr) {
                console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId - Error closing connection:', closeErr);
            }
        }
    }
});

router.patch('/:id/subtasks/:subtaskId/edit', async (req, res) => {
    try {
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId/edit - Received request');
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId/edit - Task ID:', req.params.id);
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId/edit - Subtask ID:', req.params.subtaskId);
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId/edit - Request body:', req.body);

        const task = await Task.findById(req.params.id);
        if (!task) {
            console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId/edit - Task not found');
            return res.status(404).json({ error: 'Task not found' });
        }

        const subtask = task.subtasks.id(req.params.subtaskId);
        if (!subtask) {
            console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId/edit - Subtask not found');
            return res.status(404).json({ error: 'Subtask not found' });
        }

       
        subtask.description = req.body.description || subtask.description;
        subtask.startTime = req.body.startTime || subtask.startTime;
        subtask.endTime = req.body.endTime || subtask.endTime;
        subtask.priority = req.body.priority || subtask.priority;
        subtask.type = req.body.type || subtask.type;

        if (req.body.type === 'Service' && req.body.service) {
            subtask.service = {
                name: subtask.description,
                estimatedHours: req.body.service.estimatedHours,
                estimatedPeople: req.body.service.estimatedPeople,
                costPerPerson: req.body.service.costPerPerson,
                estimatedCost: req.body.service.estimatedHours * req.body.service.estimatedPeople * req.body.service.costPerPerson
            };
    
            subtask.goods = undefined;
        } else if (req.body.type === 'Good' && req.body.goods) {
            subtask.goods = {
                estimatedQuantity: req.body.goods.estimatedQuantity,
                estimatedPricePerPiece: req.body.goods.estimatedPricePerPiece,
                estimatedCost: req.body.goods.estimatedCost
            };
  
            subtask.service = undefined;
        }

        await task.save();
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId/edit - Task saved successfully');
        res.json(task);
    } catch (err) {
        console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId/edit - Error:', err);
        res.status(500).json({ error: err.message });
    }
});


router.delete('/:id/subtasks/:subtaskId', async (req, res) => {
    try {
        console.log('[Node] DELETE /tasks/:id/subtasks/:subtaskId - Received request');
        console.log('[Node] DELETE /tasks/:id/subtasks/:subtaskId - Task ID:', req.params.id);
        console.log('[Node] DELETE /tasks/:id/subtasks/:subtaskId - Subtask ID:', req.params.subtaskId);

        const task = await Task.findById(req.params.id);
        if (!task) {
            console.error('[Node] DELETE /tasks/:id/subtasks/:subtaskId - Task not found');
            return res.status(404).json({ error: 'Task not found' });
        }

        const subtask = task.subtasks.id(req.params.subtaskId);
        if (!subtask) {
            console.error('[Node] DELETE /tasks/:id/subtasks/:subtaskId - Subtask not found');
            return res.status(404).json({ error: 'Subtask not found' });
        }

        task.subtasks.pull(subtask._id);
        await task.save();
        console.log('[Node] DELETE /tasks/:id/subtasks/:subtaskId - Subtask deleted successfully');
        res.json({ message: 'Subtask deleted' });
    } catch (err) {
        console.error('[Node] DELETE /tasks/:id/subtasks/:subtaskId - Error:', err);
        res.status(500).json({ error: err.message });
    }
});


router.get('/:id/subtasks/:subtaskId', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        const subtask = task.subtasks.id(req.params.subtaskId);
        if (!subtask) return res.status(404).json({ error: 'Subtask not found' });

        res.json(subtask);
    } catch (err) {
        console.error('Subtask fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.patch('/:id/subtasks/:subtaskId/actual', async (req, res) => {
    try {
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId/actual - Received request');
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId/actual - Task ID:', req.params.id);
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId/actual - Subtask ID:', req.params.subtaskId);
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId/actual - Request body:', req.body);

        const task = await Task.findById(req.params.id);
        if (!task) {
            console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId/actual - Task not found');
            return res.status(404).json({ error: 'Task not found' });
        }

        const subtask = task.subtasks.id(req.params.subtaskId);
        if (!subtask) {
            console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId/actual - Subtask not found');
            return res.status(404).json({ error: 'Subtask not found' });
        }

        let subtaskFrozen = false;

      
        if (subtask.type === 'Service' && req.body.service) {
            subtask.service.actualHours = parseFloat(req.body.service.actualHours);
            subtask.service.actualPeople = parseInt(req.body.service.actualPeople);
            subtask.service.actualCost = parseFloat(req.body.service.actualCost);
            
         
            if (subtask.service.actualCost > subtask.service.estimatedCost) {
                subtask.status = 'Frozen';
                subtaskFrozen = true;
            }
        }
 
        else if (subtask.type === 'Good' && req.body.goods) {
            subtask.goods.actualQuantity = parseFloat(req.body.goods.actualQuantity);
            subtask.goods.actualPricePerPiece = parseFloat(req.body.goods.actualPricePerPiece);
            subtask.goods.actualCost = parseFloat(req.body.goods.actualCost);
      
            if (subtask.goods.actualCost > subtask.goods.estimatedCost) {
                subtask.status = 'Frozen';
                subtaskFrozen = true;
            }
        }

        if (subtaskFrozen) {
            task.status = 'Frozen';
        }

        await task.save();
        console.log('[Node] PATCH /tasks/:id/subtasks/:subtaskId/actual - Task saved successfully');
        res.json(task);
    } catch (err) {
        console.error('[Node] PATCH /tasks/:id/subtasks/:subtaskId/actual - Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.patch('/:id/subtasks/bulk_update_actuals', async (req, res) => {
    try {
        const { id } = req.params;
        const { subtasks } = req.body;
        if (!Array.isArray(subtasks)) {
            return res.status(400).json({ error: 'subtasks must be an array' });
        }
        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        let anySubtaskFrozen = false;

        subtasks.forEach(updateSub => {
            const subtask = task.subtasks.id(updateSub._id);
            if (!subtask) return;

            if (subtask.type === 'Service' && subtask.service && updateSub.service) {
                if (updateSub.service.actualHours !== undefined) subtask.service.actualHours = updateSub.service.actualHours;
                if (updateSub.service.actualPeople !== undefined) subtask.service.actualPeople = updateSub.service.actualPeople;
       
                if (subtask.service.costPerPerson !== undefined && subtask.service.actualHours !== undefined && subtask.service.actualPeople !== undefined) {
                    subtask.service.actualCost = subtask.service.actualHours * subtask.service.actualPeople * subtask.service.costPerPerson;
          
                    if (subtask.service.actualCost > subtask.service.estimatedCost) {
                        subtask.status = 'Frozen';
                        anySubtaskFrozen = true;
                    }
                }
            } else if (subtask.type === 'Good' && subtask.goods && updateSub.goods) {
                if (updateSub.goods.actualQuantity !== undefined) subtask.goods.actualQuantity = updateSub.goods.actualQuantity;
                if (updateSub.goods.actualPricePerPiece !== undefined) subtask.goods.actualPricePerPiece = updateSub.goods.actualPricePerPiece;
      
                if (subtask.goods.actualQuantity !== undefined && subtask.goods.actualPricePerPiece !== undefined) {
                    subtask.goods.actualCost = subtask.goods.actualQuantity * subtask.goods.actualPricePerPiece;
          
                    if (subtask.goods.actualCost > subtask.goods.estimatedCost) {
                        subtask.status = 'Frozen';
                        anySubtaskFrozen = true;
                    }
                }
            }
        });

        if (anySubtaskFrozen) {
            task.status = 'Frozen';
        }

        await task.save();
        res.json(task);
    } catch (err) {
        console.error('[Node] PATCH /tasks/:id/subtasks/bulk_update_actuals - Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
