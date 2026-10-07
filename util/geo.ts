export type Coord = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6371000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

// Straight-line distance between two points on the globe, in metres.
export function distanceMeters(a: Coord, b: Coord): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Compass bearing from a to b, in degrees clockwise from north [0, 360).
export function bearingDegrees(a: Coord, b: Coord): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Shortest distance from point p to the segment a-b, in metres.
// Works in a local flat projection, which is accurate over short distances.
export function distanceToSegmentMeters(p: Coord, a: Coord, b: Coord): number {
  const cosLat = Math.cos(toRad(a.latitude));
  const toXY = (c: Coord) => ({
    x: toRad(c.longitude) * cosLat * EARTH_RADIUS_M,
    y: toRad(c.latitude) * EARTH_RADIUS_M,
  });
  const P = toXY(p);
  const A = toXY(a);
  const B = toXY(b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / lenSq));
  return Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy));
}

// How far p is along the direction a -> b, measured from a, in metres.
// Negative means p is still behind a; positive means p has gone past a
// towards b. Used to tell whether someone has walked past a checkpoint.
export function alongTrackMeters(p: Coord, a: Coord, b: Coord): number {
  const cosLat = Math.cos(toRad(a.latitude));
  const dx = toRad(b.longitude - a.longitude) * cosLat * EARTH_RADIUS_M;
  const dy = toRad(b.latitude - a.latitude) * EARTH_RADIUS_M;
  const px = toRad(p.longitude - a.longitude) * cosLat * EARTH_RADIUS_M;
  const py = toRad(p.latitude - a.latitude) * EARTH_RADIUS_M;
  const len = Math.hypot(dx, dy);
  return len === 0 ? 0 : (px * dx + py * dy) / len;
}

// The point a fraction t (0..1) of the way from a to b.
export function interpolate(a: Coord, b: Coord, t: number): Coord {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

// How different two bearings are, in degrees from 0 (same direction) to 180
// (opposite), whichever way round the circle is shorter.
export function bearingDifference(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// The point on the segment a-b closest to p (same flat local projection as
// distanceToSegmentMeters, accurate over short distances).
export function closestPointOnSegment(p: Coord, a: Coord, b: Coord): Coord {
  const cosLat = Math.cos(toRad(a.latitude));
  const ax = a.longitude * cosLat;
  const ay = a.latitude;
  const dx = b.longitude * cosLat - ax;
  const dy = b.latitude - ay;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.longitude * cosLat - ax) * dx + (p.latitude - ay) * dy) / len2)
        );
  return interpolate(a, b, t);
}
