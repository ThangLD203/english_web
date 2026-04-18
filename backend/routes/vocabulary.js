const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');


// POST /api/vocab/import
router.post('/import', (req, res) => {
    try {
        const { user_id, topic, words_data } = req.body;
        // words_data expected as: "word | meaning | example \n word2 | meaning2 | example2"
        
        const lines = words_data.split('\n');
        
        const insert = db.prepare('INSERT INTO vocabulary_words (user_id, word, meaning, example, topic) VALUES (?, ?, ?, ?, ?)');
        const insertMany = db.transaction((linesList) => {
            let count = 0;
            for (const line of linesList) {
                const parts = line.split('|').map(s => s.trim());
                if (parts.length >= 2) {
                    const word = parts[0];
                    const meaning = parts[1];
                    const example = parts[2] || '';
                    if (word && meaning) {
                        insert.run(user_id, word, meaning, example, topic || 'Custom');
                        count++;
                    }
                }
            }
            return count;
        });
        
        const count = insertMany(lines);
        res.json({ success: true, data: { imported: count } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/vocab/import-format
router.post('/import-format', (req, res) => {
    try {
        const { user_id, content } = req.body;
        if (!content) {
            return res.status(400).json({ success: false, error: 'Không có dữ liệu văn bản' });
        }
        
        const lines = content.split(/\r?\n/);
        
        const insert = db.prepare('INSERT INTO vocabulary_words (user_id, word, meaning, example, topic) VALUES (?, ?, ?, ?, ?)');
        const checkExist = db.prepare('SELECT id FROM vocabulary_words WHERE user_id = ? AND word = ?');
        
        const insertMany = db.transaction((linesList) => {
            let count = 0;
            let currentTopic = 'Custom';
            
            for (let line of linesList) {
                line = line.trim();
                if (!line || line.startsWith('-----')) continue;
                
                if (line.startsWith('CHỦ ĐỀ:')) {
                    currentTopic = line.replace('CHỦ ĐỀ:', '').trim();
                    continue;
                }
                
                const parts = line.split('/');
                if (parts.length >= 2) {
                    const word = parts[0].trim();
                    const meaning = parts[1].trim();
                    
                    if (word && meaning) {
                        const exists = checkExist.get(user_id, word);
                        if (!exists) {
                            insert.run(user_id, word, meaning, '', currentTopic);
                            count++;
                        }
                    }
                }
            }
            return count;
        });
        
        const count = insertMany(lines);
        res.json({ success: true, data: { imported: count } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/vocab/:user_id
router.get('/:user_id', (req, res) => {
    try {
        const words = db.prepare('SELECT * FROM vocabulary_words WHERE user_id = ? ORDER BY id DESC').all(req.params.user_id);
        res.json({ success: true, data: words });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/vocab/:word_id
router.put('/:word_id', (req, res) => {
    try {
        const { status } = req.body;
        db.prepare('UPDATE vocabulary_words SET status = ? WHERE id = ?').run(status, req.params.word_id);
        res.json({ success: true, data: { status } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/vocab/result
router.post('/result', (req, res) => {
    try {
        const { user_id, word_id, mode, is_correct } = req.body;
        db.prepare('INSERT INTO vocabulary_results (user_id, word_id, mode, is_correct) VALUES (?, ?, ?, ?)').run(
            user_id, word_id, mode, is_correct ? 1 : 0
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/vocab/stats/:user_id
router.get('/stats/:user_id', (req, res) => {
    try {
        const statusCounts = db.prepare('SELECT status, count(*) as count FROM vocabulary_words WHERE user_id = ? GROUP BY status').all(req.params.user_id);
        const topicCounts = db.prepare('SELECT topic, count(*) as count FROM vocabulary_words WHERE user_id = ? GROUP BY topic').all(req.params.user_id);
        
        const formattedStatus = { new: 0, learning: 0, mastered: 0 };
        statusCounts.forEach(s => formattedStatus[s.status] = s.count);
        
        res.json({ success: true, data: { status: formattedStatus, topics: topicCounts } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/vocab/generate-quiz
router.post('/generate-quiz', async (req, res) => {
    try {
        const { word, meaning, example } = req.body;

        const apiKey = req.headers['x-gemini-api-key'] || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, error: 'Gemini API key is not configured' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `
Given this English word: "${word}", its meaning: "${meaning}", and example sentence: "${example}"
Generate 3 fill-in-the-blank sentences to test the user's understanding of that word.
The word should be missing in the sentence, maybe slightly changed based on grammar context (so the user needs to guess the word, you can return the exact expected morphology in the answer).
Return ONLY valid JSON:
{
  "sentences": [
    {
      "sentence_with_blank": "string with ___ representing the blank", 
      "answer": "string (the exact word or variation of the word to fill)", 
      "hint": "string (a helpful hint, often the first letter or definition context)"
    }
  ]
}
`;

        const result = await model.generateContent(prompt);
        let textResult = result.response.text();
        
        if (textResult.startsWith('\`\`\`json')) {
            textResult = textResult.replace(/\`\`\`json\n?/, '').replace(/\`\`\`/, '');
        } else if (textResult.startsWith('\`\`\`')) {
            textResult = textResult.replace(/\`\`\`\n?/, '').replace(/\`\`\`/, '');
        }

        const quizData = JSON.parse(textResult.trim());
        res.json({ success: true, data: quizData });
    } catch (error) {
        console.error('Error generating quiz:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
