/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCheckpoints } from '../util/checkpoints';
import { GlobalStore } from '../util/globals';
import { distanceMeters } from '../util/geo';
import { distanceToRoute } from '../util/progress';
import { loadStockholmRoute, offset } from './helpers';

const route = loadStockholmRoute();
const { maxSpacing, simplifyTolerance } = GlobalStore.CHECKPOINTS;

test('keeps the first and last point of the route', () => {
  const cps = generateCheckpoints(route);
  assert.deepEqual(cps[0], route[0]);
  assert.deepEqual(cps[cps.length - 1], route[route.length - 1]);
});

test('no gap between checkpoints is longer than maxSpacing', () => {
  const cps = generateCheckpoints(route);
  for (let i = 1; i < cps.length; i++) {
    const gap = distanceMeters(cps[i - 1], cps[i]);
    assert.ok(gap <= maxSpacing + 0.5, `gap ${i} is ${gap.toFixed(1)} m`);
  }
});

test('checkpoints stay within the simplify tolerance of the real route', () => {
  for (const cp of generateCheckpoints(route)) {
    assert.ok(distanceToRoute(cp, route) <= simplifyTolerance + 0.5);
  }
});

test('a 3.1 km route gives a sensible number of checkpoints (62 to 100)', () => {
  const n = generateCheckpoints(route).length;
  assert.ok(n >= 62 && n <= 100, `got ${n}`);
});

test('a larger maxSpacing gives fewer checkpoints', () => {
  const tight = generateCheckpoints(route, { maxSpacing: 25 }).length;
  const loose = generateCheckpoints(route, { maxSpacing: 100 }).length;
  assert.ok(loose < tight);
});

test('a long straight line is filled with evenly spaced points', () => {
  const start = { latitude: 59.35, longitude: 18.07 };
  const end = offset(start, 200, 0);
  const cps = generateCheckpoints([start, end]);
  assert.equal(cps.length, 5); // 200 m / 50 m = 4 gaps
  for (let i = 1; i < cps.length; i++) {
    assert.ok(Math.abs(distanceMeters(cps[i - 1], cps[i]) - 50) < 0.5);
  }
});

test('a real turn is kept as a checkpoint', () => {
  const start = { latitude: 59.35, longitude: 18.07 };
  const corner = offset(start, 100, 0);
  const end = offset(corner, 0, 100);
  const cps = generateCheckpoints([start, offset(start, 50, 0), corner, offset(corner, 0, 50), end]);
  assert.ok(cps.some((c) => distanceMeters(c, corner) < 1), 'corner missing');
});

test('edge cases: empty, one point, two points', () => {
  assert.deepEqual(generateCheckpoints([]), []);
  const one = [{ latitude: 59.35, longitude: 18.07 }];
  assert.deepEqual(generateCheckpoints(one), one);
  const two = [one[0], offset(one[0], 10, 0)];
  assert.deepEqual(generateCheckpoints(two), two);
});
