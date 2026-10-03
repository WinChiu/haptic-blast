import { API_ENDPOINTS } from './config';

export type Coord = { latitude: number; longitude: number };

const TIMEOUT_MS = 10_000;

// Ask the routing server for a walking route between two points.
// The server answers with GraphHopper JSON; with points_encoded=false the
// path comes back as [lng, lat] pairs, which we flip into {latitude, longitude}.
export async function fetchRoute(from: Coord, to: Coord): Promise<Coord[]> {
  const url =
    `${API_ENDPOINTS.ROUTING}` +
    `?point=${from.latitude},${from.longitude}` +
    `&point=${to.latitude},${to.longitude}` +
    `&profile=foot&ch.disable=true&points_encoded=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // ngrok's free plan can answer with a warning page instead of the data
      headers: { 'ngrok-skip-browser-warning': '1' },
    });
    if (!res.ok) {
      throw new Error(`Routing server returned ${res.status}`);
    }

    const json = await res.json();
    const coordinates: [number, number][] | undefined =
      json?.paths?.[0]?.points?.coordinates;

    if (!coordinates || coordinates.length === 0) {
      throw new Error('No route found between these points');
    }

    return coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('Routing server took too long to respond');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
