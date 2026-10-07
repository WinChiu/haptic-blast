import { API_ENDPOINTS } from './config';
import { Coord } from './geo';

export type { Coord };

const TIMEOUT_MS = 10_000;

// Why a route request failed. The UI uses `kind` to pick the message and to
// decide whether offering "Retry" makes sense.
export type RouteErrorKind =
  | 'out-of-area' // a point is outside the map the server knows
  | 'no-path' // the points are in the map but not on or near a walkable path
  | 'no-route' // both points are fine but no walkable connection exists
  | 'server-unreachable' // network down, tunnel offline or server not running
  | 'timeout'
  | 'rate-limited' // the route service has reached its limit (or is being asked too fast)
  | 'too-far' // the destination is further than one route may be
  | 'bad-response';

export class RouteError extends Error {
  kind: RouteErrorKind;
  retryable: boolean;

  constructor(kind: RouteErrorKind, message: string) {
    super(message);
    this.name = 'RouteError';
    this.kind = kind;
    // Trying again can only help if the problem could be temporary
    this.retryable =
      kind === 'server-unreachable' || kind === 'timeout' || kind === 'bad-response';
  }
}

// Turn a GraphHopper error message into one of our error kinds.
function fromServerMessage(message: string): RouteError {
  if (/too long|too far|distance limit/i.test(message)) {
    return new RouteError(
      'too-far',
      'That destination is too far for one route. Choose a closer spot.'
    );
  }
  if (/daily limit|limit reached|too many route requests/i.test(message)) {
    return new RouteError(
      'rate-limited',
      'The route service has reached its limit for now. Try again later.'
    );
  }
  if (/out of bounds/i.test(message)) {
    return new RouteError(
      'out-of-area',
      'That place is outside the area our routing server covers. Choose a spot closer to the map area.'
    );
  }
  if (/cannot find point/i.test(message)) {
    return new RouteError(
      'no-path',
      'There is no walkable path near one of the points (for example it is in water or a building). Try a spot closer to a path or street.'
    );
  }
  if (/connection between locations not found/i.test(message)) {
    return new RouteError(
      'no-route',
      'There is no walkable route between these two places.'
    );
  }
  return new RouteError('bad-response', `The routing server said: ${message}`);
}

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

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      // ngrok's free plan can answer with a warning page instead of the data
      headers: { 'ngrok-skip-browser-warning': '1' },
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new RouteError(
        'timeout',
        'The routing server took too long to respond.'
      );
    }
    // fetch itself failed: no internet, DNS, or connection refused
    throw new RouteError(
      'server-unreachable',
      'Could not reach the routing server. Check your internet connection and that the server is running.'
    );
  } finally {
    clearTimeout(timer);
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // Not JSON, for example ngrok's "tunnel offline" page
  }

  if (!res.ok) {
    if (typeof json?.message === 'string') throw fromServerMessage(json.message);
    if (res.status === 429) throw fromServerMessage('limit reached');
    if (res.status === 404 || res.status >= 502) {
      throw new RouteError(
        'server-unreachable',
        'The routing server is offline (or its tunnel address has changed).'
      );
    }
    throw new RouteError('bad-response', `Routing server returned ${res.status}.`);
  }

  const coordinates: [number, number][] | undefined =
    json?.paths?.[0]?.points?.coordinates;
  if (!coordinates || coordinates.length === 0) {
    throw new RouteError('no-route', 'No route found between these points.');
  }

  return coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}
