const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5555;

app.use(cors({
    origin: ['http://localhost:5000', 'http://127.0.0.1:5000'],
    credentials: true
}));
app.use(express.json());

app.use('/frontend', express.static(path.join(__dirname, '../frontend')));

console.log('Connecting to MongoDB URI:', process.env.MONGODB_URI);
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

const taskRoutes = require('./routes/tasks');
app.use('/api/tasks', taskRoutes);

app.post('/api/notify-team-leader', async (req, res) => {
    try {
        const { projectId, message } = req.body;
        
    
        res.json({
            success: true,
            message: 'Team Leader has been notified successfully'
        });
    } catch (error) {
        console.error('Error notifying team leader:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to notify team leader'
        });
    }
});


const server = app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));


process.on('SIGINT', () => {
    console.log('Received SIGINT. Closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});


process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    server.close(() => {
        process.exit(1);
    });
});

