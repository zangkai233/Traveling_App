# EasyTravel

AI-assisted city trip planning with interactive walking routes. The application combines a React map interface, a Spring Boot API for persistence and request control, and a FastAPI planner for AI and geospatial work.

> **Project status:** local development prototype. The guide marketplace is mock content, and the API has no authentication or user-level data isolation. It is not deployed as a public service.

## What it does

- Generates one- to three-day itineraries from a destination, interests, pace, language, and must-visit places.
- Resolves attractions to coordinates and draws walking routes on an interactive Mapbox map.
- Animates stops and routes, supports day switching and replanning, and stores UI preferences in the browser.
- Saves generated plans in MySQL and caches repeat requests in Redis for 10 minutes.
- Coalesces simultaneous identical requests so one planner result can serve all waiting clients.

## Architecture

```text
React + TypeScript + Mapbox GL JS (Vite, :5173)
              | POST /api/plan
              v
Spring Boot (Java 21, :8080)
  |           |             |
  |           |             +--> MySQL: generated plans
  |           +----------------> Redis: cache + per-request lock
  +--> FastAPI (Python, :8000)
         +--> DeepSeek: itinerary generation
         +--> Mapbox / OpenStreetMap Nominatim: place resolution
         +--> Mapbox Directions: walking routes
```

The browser calls Spring Boot; Spring Boot delegates new plans to FastAPI. The frontend also keeps a tab-scoped copy of a generated itinerary in session storage.

### Concurrent request behavior

- A request with the same parameters checks Redis first. On a miss, one request acquires a Redis lock; other matching requests wait for its cached result.
- **Surprise Me** bypasses this cache so each click generates a new plan.
- Each Spring Boot instance allows up to **8 simultaneous Python planner calls**. Requests wait up to **5 seconds** for a slot, then receive HTTP **429**. Virtual threads are enabled for requests waiting on I/O.
- The semaphore is **per Spring instance**, not a global queue. This design protects the planner from bursts; it does not guarantee that every distinct request in a large burst completes.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Mapbox GL JS |
| API and persistence | Java 21, Spring Boot 4.1.1, Spring Data JPA, MySQL |
| Cache and duplicate-request control | Redis, Spring Data Redis |
| Planner | Python, FastAPI, HTTPX, DeepSeek API, Mapbox APIs, Nominatim |

## Run locally

Requirements: Java 21, Maven, Node.js with npm, Python 3.10+, MySQL, and Redis. You also need a DeepSeek API key and a Mapbox token. Keep MySQL, Redis, FastAPI, and Spring Boot running while using the frontend.

1. Create the database and start Redis. The default connection settings are MySQL at `127.0.0.1:3306` and Redis at `127.0.0.1:6379`.

   ```sql
   CREATE DATABASE IF NOT EXISTS easychina
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

   Verify Redis with `redis-cli ping`; it should return `PONG`.

2. Create `backend/.env` with your own credentials:

   ```dotenv
   DEEPSEEK_API_KEY=your_key
   MAPBOX_TOKEN=pk.your_public_mapbox_token
   ```

   Start the Python planner in terminal 1:

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   python -m uvicorn main:app --reload --port 8000
   ```

   Check `http://127.0.0.1:8000/health` for `{"ok":true}`.

3. Start Spring Boot in terminal 2. Set your local MySQL credentials; an empty password is valid only if your local account is configured that way.

   ```bash
   cd backend-spring
   export MYSQL_USER=your_mysql_user
   export MYSQL_PASSWORD=your_mysql_password
   mvn spring-boot:run
   ```

   Spring Boot creates the `trip_plans` table on startup. Check `http://127.0.0.1:8080/api/plans` for `[]` or existing records. If Python runs on a different port, set `PYTHON_API_URL` before starting Spring, for example `export PYTHON_API_URL=http://127.0.0.1:8001`.

4. Create `frontend/.env.local`:

   ```dotenv
   VITE_MAPBOX_TOKEN=pk.your_public_mapbox_token
   VITE_API_BASE=http://127.0.0.1:8080
   ```

   Start the frontend in terminal 3:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Open the local URL printed by Vite, normally `http://localhost:5173`.

Never place the DeepSeek secret in the frontend. The local `.env` files, build outputs, and Redis dump files are ignored by Git.

## API

### `POST /api/plan`

```json
{
  "city": "Toronto",
  "days": 1,
  "interests": "food, architecture, culture",
  "pace": "balanced",
  "must_visit": ["CN Tower"],
  "surprise_me": false,
  "language": "English"
}
```

The response contains a trip title, summary, days, geocoded stops, and walking-route geometry. `GET /api/plans` lists the 20 most recent saved plans; `GET /api/plans/{id}` retrieves one; `DELETE /api/plans/{id}` deletes one. These history endpoints currently have **no authentication** and should not be exposed publicly as-is.

## Load tests

From `backend-spring/`, with the local services running:

```bash
python3 tests/load_test.py --mode cache --requests 50 --concurrency 10
python3 tests/load_test.py --mode singleflight --requests 50 --concurrency 50
```

The first test warms one route then measures cached responses. The second sends 50 identical, previously uncached requests at once. Either can make one real AI/map request.

To test 1,000 **distinct** requests without API charges:

```bash
python3 tests/distinct_load_test.py --users 1000 --concurrency 1000
```

This script starts an isolated Spring instance and a mock planner, uses a temporary MySQL database, then cleans them up. It cycles through 20 cities and varies request preferences to avoid Redis cache hits. MySQL and Redis must already be running, and the configured MySQL user needs permission to create and drop the temporary database. The frontend and real FastAPI planner are not used for this test.

| Local test | Observed result | What it demonstrates |
| --- | --- | --- |
| 50 simultaneous identical fresh requests | 50 HTTP 200 in about 2.9 seconds; one new MySQL row | Redis duplicate-request coalescing |
| 1,000 simultaneous distinct requests, mock planner taking 8 seconds | 8 HTTP 200, 992 HTTP 429; maximum 8 Python calls active | Bounded downstream concurrency and explicit overload response |

These are local development observations, not production capacity claims. The 1,000-request test does **not** mean 1,000 distinct trips were generated. Supporting every request in such a burst would require a durable job queue and a client flow for checking job status.

## Repository layout

```text
backend/                 FastAPI itinerary and geospatial pipeline
backend-spring/          Spring Boot API, Redis control, MySQL persistence
backend-spring/tests/    Cache and concurrency load tests
frontend/                React interface and Mapbox visualization
```

## Current limitations

- No accounts, authentication, or user isolation for saved plans.
- The guide marketplace uses mock profiles.
- Route generation depends on external AI, map, and geocoding services.
- Concurrency limits are per Spring instance; distinct requests beyond available capacity can receive HTTP 429.
- Local development setup only; production deployment and monitoring are future work.
