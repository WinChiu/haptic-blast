/// <reference types="node" />
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { editWaypoint, planWaypoints } from '../util/waypoints';
import { generateCheckpoints } from '../util/checkpoints';
import { checkpointStep } from '../util/progress';
import { RouteError } from '../util/routing';

const a = { latitude: 59, longitude: 18 };
const b = { latitude: 59.001, longitude: 18 };
const c = { latitude: 59.001, longitude: 18.002 };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const reply = (points: typeof a[]) => new Response(JSON.stringify({ paths: [{ points: {
  coordinates: points.map(p => [p.longitude, p.latitude]),
} }] }), { status: 200 });

test('tap adds in order, tapping any existing point deletes it and all later points', () => {
  const points = editWaypoint(editWaypoint(editWaypoint([], a), b), c);
  assert.deepEqual(points, [a, b, c]);
  assert.deepEqual(editWaypoint(points, b, 1), [a]);
  assert.deepEqual(editWaypoint(points, a, 0), []);
  assert.deepEqual(editWaypoint(points, c, 2), [a, b]);
  assert.deepEqual(points, [a, b, c]);
});

test('plans ordered legs through every selected point and exposes snapped stops', async () => {
  const snappedB = { ...b, latitude: b.latitude + 0.00001 };
  const urls: string[] = [];
  globalThis.fetch = (async (url: any) => {
    urls.push(String(url));
    return urls.length === 1 ? reply([a, snappedB]) : reply([snappedB, c]);
  }) as typeof fetch;
  const plan = await planWaypoints(a, [b, c]);
  assert.deepEqual(plan.stops, [snappedB, c]);
  assert.deepEqual(plan.route, [a, snappedB, c]);
  assert.deepEqual(new URL(urls[1]).searchParams.getAll('point'), [
    `${snappedB.latitude},${snappedB.longitude}`, `${c.latitude},${c.longitude}`,
  ]);
  // Existing skip logic only sees the current leg, never the next manual stop.
  const checkpoints = generateCheckpoints(plan.legs[0]);
  assert.equal(checkpointStep(c, checkpoints, checkpoints.length - 1), null);
  assert.equal(checkpointStep(snappedB, checkpoints, checkpoints.length - 1)?.reason, 'reached');
});

test('rerouting only requests remaining manual stops and preserves numbering on failure', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ message: 'Connection between locations not found' }), { status: 400 });
  }) as typeof fetch;
  await assert.rejects(planWaypoints(b, [c], 1), e =>
    e instanceof RouteError && e.kind === 'no-route' && /point 2/.test(e.message));
  assert.equal(calls, 1);
});

test('unreachable middle point fails the plan instead of silently skipping to the destination', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return reply([a, a]); }) as typeof fetch;
  await assert.rejects(planWaypoints(a, [b, c]), e =>
    e instanceof RouteError && e.kind === 'no-path' && /point 1/.test(e.message));
  assert.equal(calls, 1);
});

test('no points and malformed geometry cannot produce a navigation plan', async () => {
  await assert.rejects(planWaypoints(a, []), RouteError);
  globalThis.fetch = (async () => reply([a])) as typeof fetch;
  await assert.rejects(planWaypoints(a, [b]), e => e instanceof RouteError && e.kind === 'bad-response');
});
