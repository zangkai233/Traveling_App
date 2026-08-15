# Travel App

An AI-powered travel planning web app built with React, TypeScript, FastAPI, DeepSeek, and Mapbox.

The current MVP focuses on generating personalized multi-stop city itineraries and visualizing them as interactive routes on a map.

## Features

- AI-generated travel itineraries
- Multi-day trip planning
- Destination, trip length, interests, and must-visit preferences
- Surprise Me trip generation
- Interactive Mapbox map
- Animated route visualization
- Sequential stop-marker animation
- Real walking routes between attractions
- Mobile-first responsive UI
- Expandable itinerary bottom sheet
- Home, Guide, Map, and Settings navigation
- Mock local-guide marketplace
- Local trip caching with `sessionStorage`
- User preferences stored with `localStorage`

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- React Router
- Mapbox GL JS
- Lucide React
- CSS

### Backend

- Python
- FastAPI
- Uvicorn
- DeepSeek API
- Mapbox Search API
- Mapbox Directions API
- HTTPX

## Architecture

```text
Browser / PWA
     |
     v
React + TypeScript
     |
     | HTTP / JSON
     v
FastAPI
     |
     +----> DeepSeek API
     |       Generates itinerary structure
     |
     +----> Mapbox Search
     |       Resolves real places to coordinates
     |
     +----> Mapbox Directions
             Builds real walking routes
```

DeepSeek decides what places to visit, in what order, and why.

Mapbox resolves real geographic locations and calculates the route between them.

## Project Structure

```text
travel-app/
|
|-- backend/
|   |-- main.py
|   |-- requirements.txt
|   |-- .env
|   `-- .venv/
|
|-- frontend/
|   |-- public/
|   |-- src/
|   |   |-- components/
|   |   |   |-- BottomNav.tsx
|   |   |   `-- BottomNav.css
|   |   |
|   |   |-- pages/
|   |   |   |-- HomePage.tsx
|   |   |   |-- HomePage.css
|   |   |   |-- GuidePage.tsx
|   |   |   |-- GuidePage.css
|   |   |   |-- PlannerMapPage.tsx
|   |   |   |-- PlannerMapPage.css
|   |   |   |-- SettingsPage.tsx
|   |   |   `-- SettingsPage.css
|   |   |
|   |   |-- services/
|   |   |   `-- api.ts
|   |   |
|   |   |-- types/
|   |   |   `-- trip.ts
|   |   |
|   |   |-- App.tsx
|   |   |-- main.tsx
|   |   `-- index.css
|   |
|   |-- .env.local
|   |-- package.json
|   |-- package-lock.json
|   `-- vite.config.ts
|
`-- .gitignore
```

## Requirements

Install:

- Node.js
- npm
- Python 3.10+
- A Mapbox account and public access token
- A DeepSeek API key

## Frontend Setup

Go to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

If needed, install the main packages manually:

```bash
npm install mapbox-gl react-router-dom lucide-react
npm install -D @types/geojson
```

Create:

```text
frontend/.env.local
```

Add:

```env
VITE_MAPBOX_TOKEN=pk.YOUR_MAPBOX_PUBLIC_TOKEN
```

Do not put a DeepSeek secret key in the frontend.

Run the frontend:

```bash
npm run dev -- --host
```

Vite will show addresses similar to:

```text
Local:   http://localhost:5173/
Network: http://192.168.x.x:5173/
```

The Network address can be opened from another device on the same local network.

## Backend Setup

Go to the backend directory:

```bash
cd backend
```

Create a virtual environment:

```bash
python3 -m venv .venv
```

Activate it on macOS/Linux:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Example `requirements.txt`:

```text
fastapi
uvicorn[standard]
httpx
python-dotenv
pydantic
```

Create:

```text
backend/.env
```

Add:

```env
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY
DEEPSEEK_MODEL=deepseek-v4-flash
MAPBOX_TOKEN=pk.YOUR_MAPBOX_PUBLIC_TOKEN
```

Start FastAPI:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Test:

```text
http://localhost:8000/health
```

Expected response:

```json
{
  "ok": true
}
```

## Local Development

Run the backend in one terminal:

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Run the frontend in another terminal:

```bash
cd frontend
npm run dev -- --host
```

Open:

```text
http://localhost:5173
```

## AI Planning Flow

```text
User chooses destination
        |
        v
React sends POST /api/plan
        |
        v
FastAPI
        |
        v
DeepSeek generates itinerary
        |
        v
Mapbox Search resolves POIs
        |
        v
Mapbox Directions calculates route
        |
        v
React renders stop-by-stop animation
        |
        v
Route is drawn on the map
```

## Main API Endpoint

### `POST /api/plan`

Example request:

```json
{
  "city": "Toronto",
  "days": 1,
  "interests": "food, architecture, culture",
  "pace": "balanced",
  "must_visit": ["CN Tower"],
  "surprise_me": false
}
```

The backend returns:

- Trip title
- Trip summary
- Days
- Stops
- Suggested times
- Visit durations
- Reasons
- Coordinates
- Route geometry
- Route distance
- Route duration

## Security

Never commit API secrets.

The following files should remain ignored:

```gitignore
backend/.env
backend/.venv/
backend/__pycache__/

frontend/.env.local
frontend/node_modules/
frontend/dist/

.DS_Store
```

Only Mapbox public `pk.` tokens should be used in the browser.

Secret API keys must remain on the FastAPI backend.

If an API key is accidentally posted publicly or committed to Git, revoke it and generate a new key.

## Current Pages

### Home

- Featured destination
- AI trip planner
- Destination input
- Trip length
- Interest selection
- Must-visit places
- Surprise Me
- Destination discovery cards

### Guide

Prototype local-guide marketplace.

Current guide profiles are mock data.

### Map

- Full-screen Mapbox map
- AI itinerary
- Animated stop markers
- Animated route
- Day switching
- Route replay
- Expandable itinerary sheet
- Replan functionality

### Settings

- Travel pace
- Language
- Distance units
- Animation preferences

Preferences are currently stored locally in the browser.

## Current Status

This project is currently an MVP / prototype.

The database and production authentication system have intentionally not been added yet.

Current focus:

1. Product UI and mobile experience
2. AI itinerary generation
3. Map visualization
4. Route quality
5. Guide marketplace prototype

## Planned Improvements

- PostgreSQL database
- Authentication
- Saved trips
- User profiles
- Real guide accounts
- Guide booking
- Payments
- Hotel integration
- Restaurant recommendations
- Better attraction imagery
- Add/remove/reorder itinerary stops
- PWA installation
- Offline trip access
- Additional POI/search providers
- Production deployment
- Real-time itinerary editing

## Development Philosophy

The app separates AI reasoning from geographic routing:

```text
AI:
What should the traveler do?

Map Search:
Where exactly is each place?

Routing Engine:
How should the traveler move between them?

React:
How should the experience be presented?
```

This keeps itinerary generation flexible while ensuring that routes and locations are based on real geographic data.

## License

Private project. All rights reserved.
