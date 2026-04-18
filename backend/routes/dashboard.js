const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/dashboard/:user_id
router.get('/:user_id', (req, res) => {
    try {
        const userId = req.params.user_id;
        
        // Total sessions
        const totalSessionsRow = db.prepare('SELECT count(*) as count FROM speaking_sessions WHERE user_id = ?').get(userId);
        
        // Average speaking score
        const avgScoreRow = db.prepare('SELECT AVG(avg_score) as avgScore FROM speaking_sessions WHERE user_id = ? AND avg_score IS NOT NULL').get(userId);
        
        // Words mastered
        const wordsMasteredRow = db.prepare('SELECT count(*) as count FROM vocabulary_words WHERE user_id = ? AND status = "mastered"').get(userId);
        
        // Recent Score History (last 14 sessions or 14 days)
        const recentSessions = db.prepare(`
            SELECT id, situation, date(started_at) as date, avg_score, 
            (strftime('%s', ended_at) - strftime('%s', started_at)) as duration_sec
            FROM speaking_sessions 
            WHERE user_id = ? AND ended_at IS NOT NULL
            ORDER BY started_at DESC 
            LIMIT 14
        `).all(userId).reverse(); // Oldest first for chart
        
        // Current Streak
        const streakData = db.prepare('SELECT date FROM practice_streaks WHERE user_id = ? ORDER BY date DESC').all(userId);
        let currentStreak = 0;
        
        if (streakData.length > 0) {
            let today = new Date();
            let checkDate = new Date(today);
            let index = 0;
            
            while (true) {
                const dateStr = checkDate.toISOString().split('T')[0];
                const found = streakData.findIndex(s => s.date === dateStr);
                
                // Allow skipping today if they haven't practiced yet today but did yesterday
                if (found !== -1) {
                    currentStreak++;
                } else if (index === 0) {
                    // It's ok if they haven't practiced today yet if they practiced yesterday
                } else {
                    break;
                }
                
                checkDate.setDate(checkDate.getDate() - 1);
                index++;
                
                if (index > streakData.length + 2) break; // sanity loop escape
            }
        }
        
        // Heatmap data (last 90 days)
        const heatmapData = db.prepare(`
            SELECT date, speaking_minutes + vocab_count as score 
            FROM practice_streaks 
            WHERE user_id = ? 
            ORDER BY date DESC LIMIT 90
        `).all(userId);

        res.json({
            success: true,
            data: {
                totalSessions: totalSessionsRow.count,
                avgScore: Math.round(avgScoreRow.avgScore || 0),
                wordsMastered: wordsMasteredRow.count,
                currentStreak,
                recentSessions,
                heatmapData
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/dashboard/streak
router.post('/streak', (req, res) => {
    try {
        const { user_id, date, speaking_minutes, vocab_inc } = req.body;
        // date format: YYYY-MM-DD
        
        const existing = db.prepare('SELECT * FROM practice_streaks WHERE user_id = ? AND date = ?').get(user_id, date);
        
        if (existing) {
            db.prepare(`
                UPDATE practice_streaks 
                SET speaking_minutes = speaking_minutes + ?, vocab_count = vocab_count + ? 
                WHERE id = ?
            `).run(speaking_minutes || 0, vocab_inc || 0, existing.id);
        } else {
            db.prepare(`
                INSERT INTO practice_streaks (user_id, date, speaking_minutes, vocab_count) 
                VALUES (?, ?, ?, ?)
            `).run(user_id, date, speaking_minutes || 0, vocab_inc || 0);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
