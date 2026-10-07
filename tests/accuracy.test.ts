/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCheckpoints } from '../util/checkpoints';
import { aimPoint, checkpointStep, snapToRoute } from '../util/progress';
import { bearingDegrees, bearingDifference, closestPointOnSegment, distanceMeters, interpolate, Coord } from '../util/geo';
import { GlobalStore } from '../util/globals';
import { loadStockholmRoute, offset } from './helpers';

const O: Coord = { latitude: 59.35, longitude: 18.07 };
const at = (north: number, east: number) => offset(O, north, east);

// ---------- closest point and snapping ----------
test('closestPointOnSegment: beside, before and beyond a segment', () => {
  const a = at(0, 0), b = at(100, 0);
  assert.ok(distanceMeters(closestPointOnSegment(at(50, 10), a, b), at(50, 0)) < 0.3);
  assert.ok(distanceMeters(closestPointOnSegment(at(-20, 5), a, b), a) < 0.3);
  assert.ok(distanceMeters(closestPointOnSegment(at(130, 0), a, b), b) < 0.3);
});

test('snapToRoute: a position near the path is pulled onto it', () => {
  const route = [at(0, 0), at(100, 0), at(100, 100)];
  const snap = snapToRoute(at(40, 8), route, 20, 0)!;
  assert.ok(Math.abs(snap.distance - 8) < 0.3);
  assert.ok(distanceMeters(snap.point, at(40, 0)) < 0.3);
  assert.equal(snap.segment, 0);
});

test('snapToRoute: too far from the path means no snap (the real position is kept)', () => {
  const route = [at(0, 0), at(100, 0)];
  assert.equal(snapToRoute(at(50, 35), route, 20, 0), null);
  assert.equal(snapToRoute(at(50, 5), [at(0, 0)], 20, 0), null); // no line at all
});

test('snapToRoute: follows the user along the route using the hint', () => {
  const route = [at(0, 0), at(100, 0), at(100, 100), at(0, 100)];
  const snap = snapToRoute(at(100, 60), route, 20, 1)!;
  assert.equal(snap.segment, 1);
  assert.ok(distanceMeters(snap.point, at(100, 60)) < 0.3);
});

test('snapToRoute: a route that comes back close to itself does not pull the position to the far part', () => {
  // out 400 m (a point every 10 m), then back along a line 8 m to the east
  const out = Array.from({ length: 41 }, (_, i) => at(i * 10, 0));
  const back = Array.from({ length: 41 }, (_, i) => at(400 - i * 10, 8));
  const route = [...out, ...back];
  // the user is near the start, the return leg is ~80 segments away: the window never reaches it
  const snap = snapToRoute(at(20, 4), route, 20, 2)!;
  assert.ok(snap.segment < 10);
});

// ---------- the claim: snapping reduces the error caused by GPS drift ----------
// A perfect walker (phone pointing exactly along the path) on the real 3.1 km route,
// with GPS error that wanders slowly (about 10 s correlation), like the real thing.
function directionErrors(accuracy: number, snap: boolean, seed: number): number[] {
  const route = loadStockholmRoute();
  const walk: { p: Coord; heading: number }[] = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const n = Math.max(1, Math.round(distanceMeters(a, b)));
    for (let k = 0; k < n; k++) walk.push({ p: interpolate(a, b, k / n), heading: bearingDegrees(a, b) });
  }
  let state = seed;
  const rnd = () => (state = (state * 48271) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const sigma = accuracy / 1.52; // iOS reports a 68% radius; for a 2-D Gaussian that is ~1.5 sigma
  const rho = 0.9;
  const cps = generateCheckpoints(route);
  let ex = 0, ey = 0, index = 0, hint = 0;
  const errors: number[] = [];
  for (const { p, heading } of walk) {
    ex = rho * ex + Math.sqrt(1 - rho * rho) * sigma * gauss();
    ey = rho * ey + Math.sqrt(1 - rho * rho) * sigma * gauss();
    let here = offset(p, ey, ex);
    if (snap) {
      const s = snapToRoute(here, route, GlobalStore.GPS.snapLimit, hint);
      if (s) { here = s.point; hint = s.segment; }
    }
    for (let g = 0; g < 3; g++) { const st = checkpointStep(here, cps, index); if (st) index = st.index; else break; }
    if (index >= cps.length) break;
    errors.push(bearingDifference(bearingDegrees(here, aimPoint(here, cps, index)), heading));
  }
  return errors.sort((a, b) => a - b);
}
const median = (e: number[]) => e[Math.floor(e.length / 2)];
const within = (e: number[], deg: number) => e.filter((x) => x <= deg).length / e.length;

test('at the real median GPS accuracy (6.7 m), snapping cuts the direction error', () => {
  const plain = directionErrors(6.7, false, 12345);
  const snapped = directionErrors(6.7, true, 12345);
  assert.ok(median(snapped) < median(plain) - 2, `median ${median(snapped)} vs ${median(plain)}`);
  assert.ok(within(snapped, 25) > within(plain, 25) + 0.05, 'more of the time within 25 degrees');
  assert.ok(within(snapped, 25) > 0.85);
});

test('at poor GPS accuracy (12 m), snapping keeps the guidance usable', () => {
  const plain = directionErrors(12, false, 777);
  const snapped = directionErrors(12, true, 777);
  assert.ok(within(snapped, 25) > 0.85, `only ${(100 * within(snapped, 25)).toFixed(0)}% within 25 degrees`);
  assert.ok(median(snapped) < median(plain) - 4);
});

test('with a good fix (3 m), snapping does no harm', () => {
  const plain = directionErrors(3, false, 4242);
  const snapped = directionErrors(3, true, 4242);
  assert.ok(median(snapped) <= median(plain) + 1);
});
