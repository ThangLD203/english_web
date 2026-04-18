require('dotenv').config();
const express = require('express');
const cors = require('cors');

const speakingRoutes = require('./routes/speaking');
const vocabularyRoutes = require('./routes/vocabulary');
const dashboardRoutes = require('./routes/dashboard');
const userRoutes = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/user', userRoutes);
app.use('/api/speaking', speakingRoutes);
app.use('/api/vocab', vocabularyRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Backend is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
