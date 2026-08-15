import type {
  PlanRequest,
  TripPlan,
} from "../types/trip";


function getApiBase() {
  const custom =
    import.meta.env.VITE_API_BASE;

  if (custom) {
    return custom;
  }

  return (
    `${window.location.protocol}//` +
    `${window.location.hostname}:8000`
  );
}


const API_BASE =
  getApiBase();


export async function generateTrip(
  request: PlanRequest,
  signal?: AbortSignal,
): Promise<TripPlan> {

  const response = await fetch(
    `${API_BASE}/api/plan`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify(request),

      signal,
    },
  );


  if (!response.ok) {
    let message =
      "Unable to generate trip.";

    try {
      const data =
        await response.json();

      if (data.detail) {
        message =
          String(data.detail);
      }
    } catch {
      // Ignore malformed errors.
    }

    throw new Error(
      message,
    );
  }


  return response.json();
}
