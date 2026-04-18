const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/user/init - create or get user by name
router.post('/init', (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        let user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
        
        if (!user) {
            const info = db.prepare('INSERT INTO users (name) VALUES (?)').run(name);
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
        }

        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/user/:id - get user profile
router.get('/:id', (req, res) => {
    try {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
