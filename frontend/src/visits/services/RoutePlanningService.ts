export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
}

export interface PlannedDrivingRoute {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  legs: RouteLeg[];
}

interface OsrmResponse {
  code?: string;
  message?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: [number, number][] };
    legs?: Array<{ distance?: number; duration?: number }>;
  }>;
}

const ROUTING_API_URL = (
  import.meta.env.VITE_ROUTING_API_URL || 'https://router.project-osrm.org'
).replace(/\/$/, '');

/**
 * Calculates a road route through the supplied points in their scheduled order.
 * OSRM expects longitude first; Leaflet expects latitude first, so the response
 * is converted here and the UI never has to guess which coordinate order it has.
 */
export async function getDrivingRoute(
  points: RoutePoint[],
  signal?: AbortSignal,
): Promise<PlannedDrivingRoute | null> {
  if (points.length < 2) return null;

  const coordinates = points
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(';');
  const response = await fetch(
    `${ROUTING_API_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(`Routing service returned ${response.status}`);
  }

  const body = await response.json() as OsrmResponse;
  const route = body.routes?.[0];
  if (body.code !== 'Ok' || !route?.geometry?.coordinates) {
    throw new Error(body.message || 'No driving route was found');
  }

  return {
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]),
    distanceMeters: route.distance ?? 0,
    durationSeconds: route.duration ?? 0,
    legs: (route.legs ?? []).map((leg) => ({
      distanceMeters: leg.distance ?? 0,
      durationSeconds: leg.duration ?? 0,
    })),
  };
}

