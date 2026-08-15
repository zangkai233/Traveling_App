from __future__ import annotations

import asyncio
import itertools
import json
import math
import os
import time
from dataclasses import dataclass
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


load_dotenv()


DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_MODEL = os.getenv(
    "DEEPSEEK_MODEL",
    "deepseek-v4-flash",
)
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN")
NOMINATIM_BASE_URL = os.getenv(
    "NOMINATIM_BASE_URL",
    "https://nominatim.openstreetmap.org",
).rstrip("/")
NOMINATIM_USER_AGENT = os.getenv(
    "NOMINATIM_USER_AGENT",
    "EasyChina/0.2 travel-planner",
)


CITY_COUNTRY_HINTS = {
    "beijing": "cn",
    "北京": "cn",
    "shanghai": "cn",
    "上海": "cn",
    "guilin": "cn",
    "桂林": "cn",
    "toronto": "ca",
    "多伦多": "ca",
    "vancouver": "ca",
    "温哥华": "ca",
    "montreal": "ca",
    "蒙特利尔": "ca",
    "quebec city": "ca",
    "banff": "ca",
}

_NOMINATIM_CACHE: dict[
    str,
    list[dict],
] = {}
_NOMINATIM_LOCK = asyncio.Lock()
_NOMINATIM_LAST_REQUEST = 0.0


if not DEEPSEEK_API_KEY:
    raise RuntimeError(
        "DEEPSEEK_API_KEY is missing"
    )

if not MAPBOX_TOKEN:
    raise RuntimeError(
        "MAPBOX_TOKEN is missing"
    )


app = FastAPI(
    title="EasyChina API",
    version="0.2.0",
)


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
    city: str = Field(
        min_length=2,
        max_length=100,
    )

    days: int = Field(
        default=1,
        ge=1,
        le=3,
    )

    interests: str = Field(
        default="food, architecture, culture",
        max_length=500,
    )

    pace: Literal[
        "relaxed",
        "balanced",
        "fast",
    ] = "balanced"

    must_visit: list[str] = Field(
        default_factory=list
    )

    surprise_me: bool = False

    language: Literal[
        "English",
        "简体中文",
        "Français",
    ] = "English"


@dataclass(frozen=True)
class CityLocation:
    coordinates: list[float]
    country_code: str | None


# =========================================================
# Routes
# =========================================================


@app.get("/")
async def root():
    return {
        "app": "EasyChina API",
        "version": "0.2.0",
        "status": "running",
    }


@app.get("/health")
async def health():
    return {
        "ok": True,
    }


@app.post("/api/plan")
async def create_plan(
    request: PlanRequest,
):
    request.city = request.city.strip()

    if len(request.city) < 2:
        raise HTTPException(
            status_code=422,
            detail=(
                "City must contain at least "
                "2 characters."
            ),
        )

    ai_plan = await generate_ai_itinerary(
        request
    )

    raw_days = ai_plan.get(
        "days",
        [],
    )

    if not raw_days:
        raise HTTPException(
            status_code=502,
            detail=(
                "AI did not return itinerary days."
            ),
        )

    final_days = []

    async with httpx.AsyncClient(
        timeout=30
    ) as client:

        city_location = await geocode_city(
            client,
            request.city,
        )

        if city_location is None:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Could not locate the requested "
                    f"city: {request.city}."
                ),
            )

        for raw_day in raw_days[
            : request.days
        ]:

            raw_stops = raw_day.get(
                "stops",
                [],
            )[:8]

            if not raw_stops:
                continue

            if (
                city_location.country_code
                == "cn"
            ):
                geocoded_results = []

                for stop in raw_stops:
                    coordinates = await geocode_place(
                        client=client,
                        search_query=stop_query(
                            stop,
                            request.city,
                        ),
                        city=request.city,
                        city_location=city_location,
                    )

                    geocoded_results.append(
                        coordinates
                    )

            else:
                geocoded_results = (
                    await asyncio.gather(
                        *(
                            geocode_place(
                                client=client,
                                search_query=stop_query(
                                    stop,
                                    request.city,
                                ),
                                city=request.city,
                                city_location=city_location,
                            )
                            for stop in raw_stops
                        )
                    )
                )

            stops = []

            for index, (
                stop,
                coordinates,
            ) in enumerate(
                zip(
                    raw_stops,
                    geocoded_results,
                )
            ):

                if coordinates is None:
                    continue

                if any(
                    distance_km(
                        existing["coordinates"],
                        coordinates,
                    ) < 0.04
                    for existing in stops
                ):
                    continue

                stops.append(
                    {
                        "id": (
                            f"day-"
                            f"{raw_day.get('day', 1)}"
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
                        "duration_minutes":
                            stop.get(
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
                        "coordinates":
                            coordinates,
                        "travel_to_next_meters":
                            None,
                        "travel_to_next_seconds":
                            None,
                    }
                )

            if len(stops) < 2:
                continue

            walking_matrix = (
                await create_walking_matrix(
                    client,
                    stops,
                )
            )

            stops = optimize_stop_order(
                stops,
                walking_matrix,
            )

            route = (
                await create_walking_route(
                    client,
                    stops,
                )
            )

            if route:
                legs = route.get(
                    "legs",
                    [],
                )

                for index, leg in enumerate(
                    legs
                ):
                    if index >= len(stops):
                        break

                    stops[index][
                        "travel_to_next_meters"
                    ] = leg.get(
                        "distance"
                    )

                    stops[index][
                        "travel_to_next_seconds"
                    ] = leg.get(
                        "duration"
                    )

            reschedule_stops(stops)

            final_days.append(
                {
                    "day": raw_day.get(
                        "day",
                        len(final_days) + 1,
                    ),
                    "theme": raw_day.get(
                        "theme",
                        (
                            f"Day "
                            f"{len(final_days) + 1}"
                        ),
                    ),
                    "stops": stops,
                    "route": (
                        {
                            "geometry":
                                route[
                                    "geometry"
                                ],
                            "distance_meters":
                                route[
                                    "distance_meters"
                                ],
                            "duration_seconds":
                                route[
                                    "duration_seconds"
                                ],
                        }
                        if route
                        else None
                    ),
                }
            )

    if not final_days:
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not resolve enough "
                "real locations."
            ),
        )

    return {
        "city": request.city,
        "title": ai_plan.get(
            "title",
            f"{request.city} adventure",
        ),
        "summary": ai_plan.get(
            "summary",
            "Your AI-planned journey.",
        ),
        "days": final_days,
    }


# =========================================================
# DeepSeek
# =========================================================


async def generate_ai_itinerary(
    request: PlanRequest,
) -> dict:

    stops_per_day = {
        "relaxed": 4,
        "balanced": 5,
        "fast": 6,
    }[request.pace]

    must_visit_text = (
        ", ".join(request.must_visit)
        if request.must_visit
        else "None"
    )

    surprise_instruction = (
        """
The user selected Surprise Me.
Choose a more distinctive and memorable
combination of places while still keeping
the route realistic and geographically
coherent.
"""
        if request.surprise_me
        else ""
    )

    system_prompt = f"""
You are EasyChina's premium AI travel
planning engine.

Create realistic, geographically coherent
city itineraries.

IMPORTANT RULES:

1. Use only real visitor-accessible places.
2. Never invent attractions.
3. Each day should contain approximately
   {stops_per_day} stops.
4. Group nearby places together.
5. Use a practical visiting order.
6. Minimize unnecessary backtracking.
7. Include every requested must-visit place
   when reasonably possible.
8. Suggested visit times are planning
   suggestions, NOT verified live opening
   hours.
9. search_query must be precise enough for
   a mapping search API.
10. Keep reasons short and useful.
11. Every stop and search_query must be in
    the exact city requested by the user.
    Never substitute a different city.
12. Write titles, themes, summaries, and
    reasons in {request.language}. Keep place
    names in their recognizable official form.
13. Output valid JSON only.

{surprise_instruction}

Return this exact JSON structure:

{{
  "title": "Short attractive itinerary title",
  "summary": "One concise sentence",
  "days": [
    {{
      "day": 1,
      "theme": "Short day theme",
      "stops": [
        {{
          "name": "Place name",
          "search_query":
            "Place name, City, Province, Country",
          "time": "09:00",
          "duration_minutes": 90,
          "category": "landmark",
          "reason":
            "Short reason why this stop fits"
        }}
      ]
    }}
  ]
}}
"""

    user_prompt = f"""
Create a {request.days}-day itinerary.

City:
{request.city}

Interests:
{request.interests}

Travel pace:
{request.pace}

Must-visit places:
{must_visit_text}

Surprise mode:
{request.surprise_me}

Output language:
{request.language}

Return JSON only.
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
        "thinking": {
            "type": "disabled",
        },
        "response_format": {
            "type": "json_object",
        },
        "temperature": 0.65,
        "max_tokens": 4000,
    }

    async with httpx.AsyncClient(
        timeout=90
    ) as client:

        for attempt in range(2):

            response = await client.post(
                (
                    "https://api.deepseek.com/"
                    "chat/completions"
                ),
                headers={
                    "Authorization": (
                        f"Bearer "
                        f"{DEEPSEEK_API_KEY}"
                    ),
                    "Content-Type":
                        "application/json",
                },
                json=payload,
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=(
                        "DeepSeek API error: "
                        f"{response.text}"
                    ),
                )

            data = response.json()

            try:
                content = (
                    data["choices"][0]
                    ["message"]["content"]
                )
            except (
                KeyError,
                IndexError,
                TypeError,
            ):
                content = None

            if content and content.strip():
                try:
                    return json.loads(content)
                except json.JSONDecodeError:
                    if attempt == 1:
                        raise HTTPException(
                            status_code=502,
                            detail=(
                                "DeepSeek returned "
                                "invalid JSON."
                            ),
                        )

            await asyncio.sleep(0.4)

    raise HTTPException(
        status_code=502,
        detail=(
            "DeepSeek returned "
            "an empty response."
        ),
    )


# =========================================================
# Mapbox search
# =========================================================


async def nominatim_search(
    client: httpx.AsyncClient,
    params: dict,
) -> list[dict] | None:

    global _NOMINATIM_LAST_REQUEST

    cache_key = json.dumps(
        params,
        ensure_ascii=False,
        sort_keys=True,
    )

    cached = _NOMINATIM_CACHE.get(
        cache_key
    )

    if cached is not None:
        return cached

    async with _NOMINATIM_LOCK:
        cached = _NOMINATIM_CACHE.get(
            cache_key
        )

        if cached is not None:
            return cached

        wait_seconds = (
            1.05
            - (
                time.monotonic()
                - _NOMINATIM_LAST_REQUEST
            )
        )

        if wait_seconds > 0:
            await asyncio.sleep(
                wait_seconds
            )

        response = await client.get(
            f"{NOMINATIM_BASE_URL}/search",
            params=params,
            headers={
                "User-Agent": (
                    NOMINATIM_USER_AGENT
                ),
            },
        )

        _NOMINATIM_LAST_REQUEST = (
            time.monotonic()
        )

        if response.status_code != 200:
            print(
                "Nominatim search failed:",
                response.status_code,
                response.text,
            )
            return None

        results = response.json()

        if not isinstance(results, list):
            return None

        _NOMINATIM_CACHE[
            cache_key
        ] = results

        return results


async def geocode_city(
    client: httpx.AsyncClient,
    city: str,
) -> CityLocation | None:

    country_hint = CITY_COUNTRY_HINTS.get(
        city.casefold()
    )

    params = {
        "q": city,
        "format": "jsonv2",
        "limit": 5,
        "addressdetails": 1,
        "accept-language": "zh,en,fr",
    }

    if country_hint:
        params["countrycodes"] = country_hint

    results = await nominatim_search(
        client,
        params,
    )

    if results is None:
        return None

    if not results:
        return None

    coordinates = nominatim_coordinates(
        results[0]
    )

    if coordinates is None:
        return None

    address = results[0].get(
        "address",
        {},
    )

    return CityLocation(
        coordinates=coordinates,
        country_code=(
            str(address.get("country_code"))
            .lower()
            if address.get("country_code")
            else country_hint
        ),
    )


async def geocode_place(
    client: httpx.AsyncClient,
    search_query: str,
    city: str,
    city_location: CityLocation,
) -> list[float] | None:

    if city_location.country_code == "cn":
        return await geocode_place_nominatim(
            client,
            search_query,
            city_location,
        )

    response = await client.get(
        (
            "https://api.mapbox.com/"
            "search/searchbox/v1/forward"
        ),
        params={
            "q": search_query,
            "access_token": MAPBOX_TOKEN,
            "limit": 5,
            "proximity": (
                f"{city_location.coordinates[0]},"
                f"{city_location.coordinates[1]}"
            ),
            "types": "poi,address",
            **(
                {
                    "country": (
                        city_location
                        .country_code
                        .upper()
                    )
                }
                if city_location.country_code
                else {}
            ),
        },
    )

    if response.status_code != 200:
        print(
            "Mapbox search failed:",
            response.status_code,
            response.text,
        )
        return None

    data = response.json()

    features = data.get(
        "features",
        [],
    )

    if not features:
        return None

    for feature in features:
        coordinates = feature_coordinates(
            feature
        )

        if (
            coordinates is not None
            and distance_km(
                city_location.coordinates,
                coordinates,
            ) <= 120
        ):
            return coordinates

    return None


async def geocode_place_nominatim(
    client: httpx.AsyncClient,
    search_query: str,
    city_location: CityLocation,
) -> list[float] | None:

    longitude, latitude = (
        city_location.coordinates
    )

    results = await nominatim_search(
        client,
        {
            "q": search_query,
            "format": "jsonv2",
            "limit": 5,
            "addressdetails": 1,
            "accept-language": "zh,en",
            "countrycodes": "cn",
            "viewbox": (
                f"{longitude - 1.6},"
                f"{latitude + 1.2},"
                f"{longitude + 1.6},"
                f"{latitude - 1.2}"
            ),
            "bounded": 1,
        },
    )

    if results is None:
        return None

    for result in results:
        if is_administrative_result(result):
            continue

        coordinates = nominatim_coordinates(
            result
        )

        if (
            coordinates is not None
            and distance_km(
                city_location.coordinates,
                coordinates,
            ) <= 120
        ):
            return coordinates

    return None


def stop_query(
    stop: dict,
    city: str,
) -> str:

    name = str(
        stop.get("name")
        or stop.get("search_query", "")
    ).strip()

    return f"{name}, {city}"


def nominatim_coordinates(
    result: dict,
) -> list[float] | None:

    try:
        longitude = float(result["lon"])
        latitude = float(result["lat"])
    except (KeyError, TypeError, ValueError):
        return None

    if not (
        -180 <= longitude <= 180
        and -90 <= latitude <= 90
    ):
        return None

    return [longitude, latitude]


def is_administrative_result(
    result: dict,
) -> bool:

    return (
        result.get("category")
        == "boundary"
        or result.get("addresstype")
        in {
            "city",
            "state",
            "country",
            "municipality",
            "province",
        }
    )


def feature_coordinates(
    feature: dict,
) -> list[float] | None:

    coordinates = (
        feature
        .get("geometry", {})
        .get("coordinates")
    )

    if (
        not coordinates
        or len(coordinates) < 2
    ):
        return None

    try:
        longitude = float(coordinates[0])
        latitude = float(coordinates[1])
    except (TypeError, ValueError):
        return None

    if not (
        -180 <= longitude <= 180
        and -90 <= latitude <= 90
    ):
        return None

    return [longitude, latitude]


def distance_km(
    start: list[float],
    end: list[float],
) -> float:

    start_lng, start_lat = map(
        math.radians,
        start,
    )
    end_lng, end_lat = map(
        math.radians,
        end,
    )

    latitude_delta = end_lat - start_lat
    longitude_delta = end_lng - start_lng

    haversine = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(start_lat)
        * math.cos(end_lat)
        * math.sin(longitude_delta / 2) ** 2
    )

    return 6371 * 2 * math.asin(
        math.sqrt(haversine)
    )


# =========================================================
# Mapbox Directions
# =========================================================


async def create_walking_matrix(
    client: httpx.AsyncClient,
    stops: list[dict],
) -> list[list[float | None]] | None:

    if len(stops) < 2:
        return None

    coordinates_string = ";".join(
        (
            f"{stop['coordinates'][0]},"
            f"{stop['coordinates'][1]}"
        )
        for stop in stops
    )

    response = await client.get(
        (
            "https://api.mapbox.com/"
            "directions-matrix/v1/"
            "mapbox/walking/"
            f"{coordinates_string}"
        ),
        params={
            "access_token": MAPBOX_TOKEN,
            "annotations": "duration",
        },
    )

    if response.status_code != 200:
        return None

    durations = response.json().get(
        "durations"
    )

    if (
        not isinstance(durations, list)
        or len(durations) != len(stops)
    ):
        return None

    return durations


def optimize_stop_order(
    stops: list[dict],
    durations: (
        list[list[float | None]]
        | None
    ),
) -> list[dict]:

    if len(stops) < 3:
        return stops

    indices = range(len(stops))

    def leg_cost(
        start_index: int,
        end_index: int,
    ) -> float:
        if durations:
            try:
                duration = durations[
                    start_index
                ][end_index]
            except (IndexError, TypeError):
                duration = None

            if duration is not None:
                return float(duration)

        return distance_km(
            stops[start_index]["coordinates"],
            stops[end_index]["coordinates"],
        ) * 720

    best_order = tuple(indices)
    best_cost = math.inf

    for order in itertools.permutations(indices):
        cost = sum(
            leg_cost(start, end)
            for start, end in zip(
                order,
                order[1:],
            )
        )

        if cost < best_cost:
            best_cost = cost
            best_order = order

    return [
        stops[index]
        for index in best_order
    ]


def reschedule_stops(
    stops: list[dict],
) -> None:

    valid_times = [
        parsed
        for stop in stops
        if (
            parsed := parse_clock_time(
                stop.get("time")
            )
        ) is not None
    ]

    current_minutes = (
        min(valid_times)
        if valid_times
        else 9 * 60
    )

    for stop in stops:
        stop["time"] = (
            f"{current_minutes // 60:02d}:"
            f"{current_minutes % 60:02d}"
        )

        current_minutes += int(
            stop.get("duration_minutes", 60)
        )

        travel_seconds = stop.get(
            "travel_to_next_seconds"
        )

        if travel_seconds:
            current_minutes += math.ceil(
                float(travel_seconds) / 60
            )


def parse_clock_time(
    value: object,
) -> int | None:

    try:
        hours_text, minutes_text = (
            str(value).split(":", 1)
        )
        hours = int(hours_text)
        minutes = int(minutes_text)
    except (TypeError, ValueError):
        return None

    if (
        not 0 <= hours <= 23
        or not 0 <= minutes <= 59
    ):
        return None

    return hours * 60 + minutes


async def create_walking_route(
    client: httpx.AsyncClient,
    stops: list[dict],
) -> dict | None:

    if len(stops) < 2:
        return None

    coordinates_string = ";".join(
        (
            f"{stop['coordinates'][0]},"
            f"{stop['coordinates'][1]}"
        )
        for stop in stops
    )

    url = (
        "https://api.mapbox.com/"
        "directions/v5/mapbox/walking/"
        f"{coordinates_string}"
    )

    response = await client.get(
        url,
        params={
            "access_token":
                MAPBOX_TOKEN,
            "geometries":
                "geojson",
            "overview":
                "full",
            "steps":
                "false",
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

    routes = data.get(
        "routes",
        [],
    )

    if not routes:
        return None

    route = routes[0]

    return {
        "geometry":
            route["geometry"]["coordinates"],
        "distance_meters":
            route["distance"],
        "duration_seconds":
            route["duration"],
        "legs":
            route.get("legs", []),
    }
