# English Learning Web App

A full-stack English learning web app designed for Vietnamese learners. Includes Speaking and Vocabulary learning with AI-assisted feedback from Gemini 2.0 Flash.

## Quick Start
1. `cp .env.example .env`
2. Add your Gemini API Key directly inside `.env`.
3. `docker-compose up -d --build`
4. Access the web interface at `http://localhost`.

## Database Backups
All data is stored inside a Docker Volume called `sqlite_data`.

## Architecture
- Frontend: Vanilla HTML/CSS/JS with Chart.js
- Backend: Express API + better-sqlite3
- AI Integration: @google/generative-ai
