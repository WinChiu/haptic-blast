import { Coord, distanceMeters } from './geo';
import { fetchRoute, RouteError } from './routing';

export type WaypointPlan = { legs: Coord[][]; stops: Coord[]; route: Coord[] };

export function editWaypoint(points: Coord[], coordinate: Coord, index?: number): Coord[] {
  return index === undefined ? [...points, coordinate] : points.slice(0, index);
}

// Route each leg separately so its end remains a mandatory navigation barrier.
// Subsequent legs start at the preceding snapped endpoint, avoiding gaps.
export async function planWaypoints(from: Coord, points: Coord[], offset = 0): Promise<WaypointPlan> {
  if (!points.length) throw new RouteError('no-route', 'Add a route point first.');
  const legs: Coord[][] = [];
  let start = from;
  for (let i = 0; i < points.length; i++) {
    try {
      const leg = await fetchRoute(start, points[i]);
      if (leg.length < 2 || leg.some(p => !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude))) {
        throw new RouteError('bad-response', 'The server returned an incomplete route.');
      }
      if (distanceMeters(start, leg[0]) > 20 || distanceMeters(points[i], leg[leg.length - 1]) > 20) {
        throw new RouteError('no-path', 'Choose a point closer to a walkable road.');
      }
      legs.push(leg);
      start = leg[leg.length - 1];
    } catch (e) {
      if (e instanceof RouteError) throw new RouteError(e.kind, `Could not route to point ${offset + i + 1}. ${e.message}`);
      throw e;
    }
  }
  return { legs, stops: legs.map(leg => leg[leg.length - 1]), route: legs.flatMap((leg, i) => i ? leg.slice(1) : leg) };
}
