import type {
  PlanRequest,
  TripPlan,
} from "../types/trip";

function getApiBase() {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }

  /*
    Important:

    Mac:
    localhost:5173
      ->
    localhost:8000

    iPhone:
    192.168.x.x:5173
      ->
    192.168.x.x:8000
  */

  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

const API_BASE = getApiBase();

export async function generateTrip(
  request: PlanRequest,
): Promise<TripPlan> {
  const response = await fetch(
    `${API_BASE}/api/plan`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    let message = "Unable to generate trip.";

    try {
      const error = await response.json();

      if (error.detail) {
        message = error.detail;
      }
    } catch {
      // Ignore malformed error responses.
    }

    throw new Error(message);
  }

  return response.json();
}