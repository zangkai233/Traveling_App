from __future__ import annotations

import asyncio
import json
import os
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN")

if not DEEPSEEK_API_KEY:
    raise RuntimeError("DEEPSEEK_API_KEY is missing")

if not MAPBOX_TOKEN:
    raise RuntimeError("MAPBOX_TOKEN is missing")


app = FastAPI(
    title="EasyChina API",
    version="0.1.0",
)

# Development only.
# We are not using cookies/auth yet, so wildcard CORS is fine for local MVP.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# Models
# =========================================================


class PlanRequest(BaseModel):
    city: str = Field(min_length=2, max_length=80)
    days: int = Field(default=1, ge=1, le=3)
    interests: str = Field(
        default="food, architecture, local culture",
        max_length=300,
    )
    pace: Literal["relaxed", "balanced", "fast"] = "balanced"


# =========================================================
# Basic endpoints
# =========================================================


@app.get("/")
async def root():
    return {
        "app": "EasyChina API",
        "status": "running",
    }


@app.get("/health")
async def health():
    return {"ok": True}


# =========================================================
# DeepSeek
# =========================================================


async def generate_ai_itinerary(request: PlanRequest) -> dict:
    system_prompt = """
You are the itinerary intelligence engine for EasyChina, a premium AI travel
planning application.

Your job is to design geographically sensible sightseeing itineraries.

IMPORTANT RULES:

1. Use REAL, well-known, visitor-accessible places only.
2. Never invent restaurants, museums, landmarks or attractions.
3. Group each day geographically so users do not waste time crossing the city.
4. Prefer walking-friendly sequences.
5. Each day should contain exactly 4 stops.
6. Choose a logical visiting order.
7. Do NOT invent live opening hours or real-time availability.
8. "time" means a suggested visit start time, not verified opening hours.
9. search_query must be specific enough for a mapping/search API.
10. Output JSON only.

The JSON MUST follow this exact structure:

{
  "title": "A short premium trip title",
  "summary": "One short sentence describing the trip",
  "days": [
    {
      "day": 1,
      "theme": "Short theme",
      "stops": [
        {
          "name": "CN Tower",
          "search_query": "CN Tower, Toronto, Ontario, Canada",
          "time": "09:00",
          "duration_minutes": 90,
          "category": "landmark",
          "reason": "One concise reason this stop fits the itinerary"
        }
      ]
    }
  ]
}

The response MUST be valid JSON.
"""

    user_prompt = f"""
Create a {request.days}-day itinerary.

City: {request.city}
Interests: {request.interests}
Travel pace: {request.pace}

Focus on a coherent tourist experience.
Avoid unnecessarily long transfers.
Return valid JSON only.
"""

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ],
        "response_format": {
            "type": "json_object",
        },
        "temperature": 0.45,
        "max_tokens": 3500,
    }

    async with httpx.AsyncClient(timeout=90) as client:
        # JSON mode can occasionally return an empty answer,
        # so retry once.
        for attempt in range(2):
            response = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"DeepSeek API error: {response.text}",
                )

            data = response.json()

            try:
                content = data["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError):
                content = None

            if content and content.strip():
                try:
                    result = json.loads(content)
                    return result
                except json.JSONDecodeError:
                    if attempt == 1:
                        raise HTTPException(
                            status_code=502,
                            detail="DeepSeek returned invalid JSON.",
                        )

            await asyncio.sleep(0.5)

    raise HTTPException(
        status_code=502,
        detail="DeepSeek returned an empty response.",
    )


# =========================================================
# Mapbox Search
# =========================================================


async def geocode_place(
    client: httpx.AsyncClient,
    search_query: str,
    city: str,
) -> list[float] | None:

    params = {
        "q": search_query,
        "access_token": MAPBOX_TOKEN,
        "limit": 1,
        "language": "en",
        "near": city,
    }

    response = await client.get(
        "https://api.mapbox.com/search/searchbox/v1/forward",
        params=params,
    )

    if response.status_code != 200:
        print(
            "Mapbox search failed:",
            response.status_code,
            response.text,
        )
        return None

    data = response.json()
    features = data.get("features", [])

    if not features:
        return None

    geometry = features[0].get("geometry", {})
    coordinates = geometry.get("coordinates")

    if (
        not coordinates
        or len(coordinates) < 2
    ):
        return None

    return [
        float(coordinates[0]),
        float(coordinates[1]),
    ]


# =========================================================
# Mapbox Directions
# =========================================================


async def create_walking_route(
    client: httpx.AsyncClient,
    stops: list[dict],
) -> dict | None:

    if len(stops) < 2:
        return None

    coordinates_string = ";".join(
        f"{stop['coordinates'][0]},{stop['coordinates'][1]}"
        for stop in stops
    )

    url = (
        "https://api.mapbox.com/directions/v5/"
        f"mapbox/walking/{coordinates_string}"
    )

    response = await client.get(
        url,
        params={
            "access_token": MAPBOX_TOKEN,
            "geometries": "geojson",
            "overview": "full",
            "steps": "false",
        },
    )

    if response.status_code != 200:
        print(
            "Directions failed:",
            response.status_code,
            response.text,
        )
        return None

    data = response.json()
    routes = data.get("routes", [])

    if not routes:
        return None

    route = routes[0]

    return {
        "geometry": route["geometry"]["coordinates"],
        "distance_meters": route["distance"],
        "duration_seconds": route["duration"],
    }


# =========================================================
# Main Planner
# =========================================================


@app.post("/api/plan")
async def create_plan(request: PlanRequest):
    ai_plan = await generate_ai_itinerary(request)

    raw_days = ai_plan.get("days", [])

    if not raw_days:
        raise HTTPException(
            status_code=502,
            detail="AI did not return itinerary days.",
        )

    final_days = []

    async with httpx.AsyncClient(timeout=30) as client:

        for raw_day in raw_days[: request.days]:

            raw_stops = raw_day.get("stops", [])[:6]

            if not raw_stops:
                continue

            # Keep concurrency moderate.
            geocode_tasks = [
                geocode_place(
                    client,
                    stop.get(
                        "search_query",
                        f"{stop.get('name', '')}, {request.city}",
                    ),
                    request.city,
                )
                for stop in raw_stops
            ]

            geocoded_results = await asyncio.gather(
                *geocode_tasks
            )

            stops = []

            for index, (stop, coordinates) in enumerate(
                zip(raw_stops, geocoded_results)
            ):

                if coordinates is None:
                    continue

                stops.append(
                    {
                        "id": (
                            f"day-{raw_day.get('day', 1)}"
                            f"-stop-{index + 1}"
                        ),
                        "name": stop.get(
                            "name",
                            "Unknown place",
                        ),
                        "time": stop.get(
                            "time",
                            "09:00",
                        ),
                        "duration_minutes": stop.get(
                            "duration_minutes",
                            60,
                        ),
                        "category": stop.get(
                            "category",
                            "attraction",
                        ),
                        "reason": stop.get(
                            "reason",
                            "",
                        ),
                        "coordinates": coordinates,
                    }
                )

            if len(stops) < 2:
                continue

            route = await create_walking_route(
                client,
                stops,
            )

            final_days.append(
                {
                    "day": raw_day.get(
                        "day",
                        len(final_days) + 1,
                    ),
                    "theme": raw_day.get(
                        "theme",
                        f"Day {len(final_days) + 1}",
                    ),
                    "stops": stops,
                    "route": route,
                }
            )

    if not final_days:
        raise HTTPException(
            status_code=502,
            detail="Could not resolve enough real locations.",
        )

    return {
        "city": request.city,
        "title": ai_plan.get(
            "title",
            f"{request.city} itinerary",
        ),
        "summary": ai_plan.get(
            "summary",
            "Your AI-planned journey.",
        ),
        "days": final_days,
    }