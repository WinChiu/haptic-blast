/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCheckpoints } from '../util/checkpoints';
import { distanceMeters } from '../util/geo';
import { GlobalStore } from '../util/globals';
import {
  aimPoint,
  distanceToRoute,
  findSkipTarget,
  isCheckpointReached,
} from '../util/progress';
import { loadStockholmRoute, offset } from './helpers';

const route = loadStockholmRoute();
const cps = generateCheckpoints(route);
const last = cps.length - 1;
const A = { latitude: 59.35, longitude: 18.07 };
const B = offset(A, 50, 0); // the next checkpoint, 50 m north of A

// --- isCheckpointReached -------------------------------------------------
// P is the previous checkpoint, 50 m south of A, so the user walks north into A

const P = offset(A, -50, 0);

test('reached: on the checkpoint and inside the threshold', () => {
  assert.equal(isCheckpointReached(A, A, P), true);
  assert.equal(isCheckpointReached(offset(A, 2, 2), A, P), true);
});

test('not reached: still approaching, even close by', () => {
  assert.equal(isCheckpointReached(offset(A, -8, 0), A, P), false);
  assert.equal(isCheckpointReached(offset(A, -8, 6), A, P), false);
  assert.equal(isCheckpointReached(offset(A, -11, 4), A, P), false);
});

test('reached: drifted past it (beyond it along the way walked), within the pass radius', () => {
  assert.equal(isCheckpointReached(offset(A, 3, 6), A, P), true);
  assert.equal(isCheckpointReached(offset(A, 8, 5), A, P), true);
});

test('not reached: beyond the pass radius, or alongside far away', () => {
  assert.equal(isCheckpointReached(offset(A, 30, 0), A, P), false);
  assert.equal(isCheckpointReached(offset(A, 1, 20), A, P), false);
});

test('the first checkpoint (no previous one) only counts inside the threshold', () => {
  assert.equal(isCheckpointReached(offset(A, 3, 0), A), true);
  assert.equal(isCheckpointReached(offset(A, 8, 5), A), false);
});

test('the walked-past rule ignores the leg that comes next (the corner bug)', () => {
  // the route turns east at A; someone 10 m before the corner with 6 m of GPS
  // wobble towards the east is NOT past it, however the next leg points
  assert.equal(isCheckpointReached(offset(A, -10, 6), A, P), false);
  assert.equal(isCheckpointReached(offset(A, -10, -6), A, P), false);
});

// --- findSkipTarget ------------------------------------------------------

test('skip: no jump when standing on, or just before, the current checkpoint', () => {
  assert.equal(findSkipTarget(cps[2], cps, 2), null);
  assert.equal(findSkipTarget(offset(cps[2], 2, 0), cps, 2), null);
});

test('skip: jumps to a later checkpoint the user is standing near', () => {
  assert.equal(findSkipTarget(cps[4], cps, 2), 4);
  assert.equal(findSkipTarget(offset(cps[5], 5, 6), cps, 2), 5);
});

test('skip: no jump when too far from every later checkpoint', () => {
  assert.equal(findSkipTarget(offset(cps[5], 0, 20), cps, 2), null);
});

test('skip: the destination always counts, however many were skipped', () => {
  assert.equal(findSkipTarget(cps[last], cps, 3), last);
});

test('skip: nothing to skip to when already on the last checkpoint', () => {
  assert.equal(findSkipTarget(cps[last], cps, last), null);
});

// --- distanceToRoute -----------------------------------------------------

test('off route: close to the line is small, far from it is large', () => {
  assert.ok(distanceToRoute(route[10], route) < 0.5);
  assert.ok(distanceToRoute(offset(route[10], 0, 10), route) < 12);
  assert.ok(distanceToRoute(offset(route[10], 0, 80), route) > GlobalStore.OFF_ROUTE.distance);
});

test('off route: empty and one-point routes', () => {
  assert.equal(distanceToRoute(A, []), Infinity);
  assert.ok(Math.abs(distanceToRoute(offset(A, 10, 0), [A]) - 10) < 0.2);
});

// --- aimPoint ------------------------------------------------------------

test('aim: lookahead 0 is the current checkpoint itself', () => {
  assert.deepEqual(aimPoint(A, cps, 3, 0), cps[3]);
});

test('aim: the point is `lookahead` metres ahead along the path', () => {
  // straight path of 100 m: user at the start, aiming 15 m ahead
  const path = [offset(A, 50, 0), offset(A, 100, 0)];
  const aim = aimPoint(A, path, 0, 15);
  assert.ok(Math.abs(distanceMeters(A, aim) - 15) < 0.3);
});

test('aim: carries on past a close checkpoint onto the next leg on a gentle bend', () => {
  // checkpoint 5 m ahead, then a leg bending 25 degrees east: aiming 15 m ahead
  // lands 10 m along that leg
  const bend = offset(A, 5, 0);
  const next = offset(bend, 100 * Math.cos((25 * Math.PI) / 180), 100 * Math.sin((25 * Math.PI) / 180));
  const aim = aimPoint(A, [bend, next], 0, 15);
  assert.ok(Math.abs(distanceMeters(bend, aim) - 10) < 0.3);
});

test('aim: stops at a sharp corner instead of turning early', () => {
  // checkpoint 5 m ahead, then a 90 degree turn east: keep pointing at the corner
  const corner = offset(A, 5, 0);
  const path = [corner, offset(corner, 0, 100)];
  assert.deepEqual(aimPoint(A, path, 0, 15), corner);
});

test('aim: never overshoots the final checkpoint', () => {
  const path = [offset(A, 5, 0)];
  assert.deepEqual(aimPoint(A, path, 0, 15), path[0]);
  assert.deepEqual(aimPoint(A, cps, last, 15), cps[last]);
});
