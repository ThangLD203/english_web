const express = require('express');
const router = express.Router();
const db = require('../db');
const { GoogleGenerativeAI } = require('@google/generative-ai');



// POST /api/speaking/analyze
router.post('/analyze', async (req, res) => {
    try {
        const { transcript, session_id } = req.body;
        
        if (!transcript) {
            return res.status(400).json({ success: false, error: 'Transcript is required' });
        }

        const apiKey = req.headers['x-gemini-api-key'] || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, error: 'Gemini API key is not configured' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `
You are an expert English speaking coach for Vietnamese learners.
Analyze the transcript and return ONLY valid JSON (no markdown):
{
  "corrected": "string",
  "mistakes": [{"original": "string", "correction": "string", "explanation": "string"}],
  "betterAlternatives": ["string", "string"],
  "grammarScore": number (0-100),
  "pronunciationScore": number (0-100),
  "naturalness": number (0-100),
  "overallScore": number (0-100),
  "roleplayReply": "string",
  "encouragement": "string"
}

Transcript: "${transcript}"
`;

        const result = await model.generateContent(prompt);
        let textResult = result.response.text();
        
        // Clean up markdown payload if model returns it
        if (textResult.startsWith('\`\`\`json')) {
            textResult = textResult.replace(/\`\`\`json\n?/, '').replace(/\`\`\`/, '');
        } else if (textResult.startsWith('\`\`\`')) {
            textResult = textResult.replace(/\`\`\`\n?/, '').replace(/\`\`\`/, '');
        }

        const analysis = JSON.parse(textResult.trim());

        if (session_id) {
            db.prepare(`
                INSERT INTO speaking_turns 
                (session_id, transcript, corrected, grammar_score, pronunciation_score, naturalness_score, overall_score, mistakes_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                session_id, transcript, analysis.corrected, 
                analysis.grammarScore, analysis.pronunciationScore, analysis.naturalness, analysis.overallScore,
                JSON.stringify(analysis.mistakes)
            );
        }

        res.json({ success: true, data: analysis });
    } catch (error) {
        console.error('Error analyzing speaking:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/speaking/session
router.post('/session', (req, res) => {
    try {
        const { user_id, situation } = req.body;
        const info = db.prepare('INSERT INTO speaking_sessions (user_id, situation) VALUES (?, ?)')
            .run(user_id, situation);
        res.json({ success: true, data: { session_id: info.lastInsertRowid } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/speaking/session/:id/end
router.put('/session/:id/end', (req, res) => {
    try {
        const sessionId = req.params.id;
        
        // Calculate average score
        const turns = db.prepare('SELECT overall_score FROM speaking_turns WHERE session_id = ?').all(sessionId);
        let avgScore = 0;
        if (turns.length > 0) {
            const sum = turns.reduce((acc, turn) => acc + turn.overall_score, 0);
            avgScore = Math.round(sum / turns.length);
        }

        db.prepare('UPDATE speaking_sessions SET ended_at = CURRENT_TIMESTAMP, avg_score = ? WHERE id = ?')
            .run(avgScore, sessionId);
            
        res.json({ success: true, data: { avg_score: avgScore, total_turns: turns.length } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/speaking/history/:user_id
router.get('/history/:user_id', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT s.*, count(t.id) as turns_count 
            FROM speaking_sessions s
            LEFT JOIN speaking_turns t ON s.id = t.session_id
            WHERE s.user_id = ? 
            GROUP BY s.id
            ORDER BY s.started_at DESC
        `).all(req.params.user_id);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/speaking/session/:id
router.get('/session/:id', (req, res) => {
    try {
        const session = db.prepare('SELECT * FROM speaking_sessions WHERE id = ?').get(req.params.id);
        const turns = db.prepare('SELECT * FROM speaking_turns WHERE session_id = ? ORDER BY created_at ASC').all(req.params.id);
        
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
        
        res.json({ success: true, data: { ...session, turns } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/speaking/mistakes/:user_id
router.get('/mistakes/:user_id', (req, res) => {
    try {
        const turns = db.prepare(`
            SELECT t.mistakes_json 
            FROM speaking_turns t 
            JOIN speaking_sessions s ON t.session_id = s.id 
            WHERE s.user_id = ?
        `).all(req.params.user_id);
        
        let allMistakes = [];
        turns.forEach(turn => {
            if (turn.mistakes_json) {
                try {
                    const parsed = JSON.parse(turn.mistakes_json);
                    if (Array.isArray(parsed)) allMistakes.push(...parsed);
                } catch (e) {}
            }
        });
        
        // Count frequencies of typical mistake categories - simplification: returning last 10 unique mistakes
        const uniqueMistakes = {};
        for(const m of allMistakes) {
            if(m && m.original && m.correction) {
                const key = `${m.original} -> ${m.correction}`;
                if(!uniqueMistakes[key]) {
                    uniqueMistakes[key] = { count: 0, detail: m };
                }
                uniqueMistakes[key].count++;
            }
        }
        
        const sorted = Object.values(uniqueMistakes)
            .sort((a,b) => b.count - a.count)
            .slice(0, 5)
            .map(x => x.detail);

        res.json({ success: true, data: sorted });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
