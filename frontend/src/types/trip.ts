export type Coordinates = [number, number];

export interface TripStop {
  id: string;
  name: string;
  time: string;
  duration_minutes: number;
  category: string;
  reason: string;
  coordinates: Coordinates;
}

export interface TripRoute {
  geometry: Coordinates[];
  distance_meters: number;
  duration_seconds: number;
}

export interface TripDay {
  day: number;
  theme: string;
  stops: TripStop[];
  route: TripRoute | null;
}

export interface TripPlan {
  city: string;
  title: string;
  summary: string;
  days: TripDay[];
}

export interface PlanRequest {
  city: string;
  days: number;
  interests: string;
  pace: "relaxed" | "balanced" | "fast";
}