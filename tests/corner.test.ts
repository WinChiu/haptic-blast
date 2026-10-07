/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { aimPoint, checkpointStep } from '../util/progress';
import { bearingDegrees, bearingDifference, distanceMeters, Coord } from '../util/geo';
import { GlobalStore } from '../util/globals';
import { offset } from './helpers';

// The teammate's sketch: walk along a wall towards a corner (checkpoint), then
// the route turns 90 degrees along the building. The checkpoint must not be
// counted, and the guidance must not turn, before the corner is reached.

const O: Coord = { latitude: 59.35, longitude: 18.07 };
const at = (north: number, east: number) => offset(O, north, east);
const WALL = 60; // metres from the start to the corner
const threshold = GlobalStore.CHECKPOINT_THRESHOLD;

// start, corner, end (a right-angle turn east)
const corner90 = [at(0, 0), at(WALL, 0), at(WALL, 60)];

// Walk up the wall one metre at a time and report, in true metres still to go
// to the corner, when the corner checkpoint is counted as reached.
// `wobbleSide` and `wobbleAlong` are GPS error amplitudes in metres.
function metresBeforeCornerWhenReached(
  cps: Coord[],
  wobbleSide: number,
  wobbleAlong = 0
): number | null {
  let index = 1; // the start is already reached
  for (let step = 0; step <= WALL + 12; step += 0.5) {
    const user = at(step + wobbleAlong * Math.sin(step * 2.3), wobbleSide * Math.sin(step * 1.7));
    const result = checkpointStep(user, cps, index);
    if (result && index === 1) return WALL - step; // negative = walked past it
  }
  return null;
}

test('sketch: with no GPS error the corner counts as reached at the threshold, not before', () => {
  const left = metresBeforeCornerWhenReached(corner90, 0)!;
  assert.ok(left <= threshold + 0.5 && left >= threshold - 1, `reached ${left} m before the corner`);
});

test('sketch: sideways GPS wobble (3 m and 6 m) does not make the corner count early', () => {
  for (const wobble of [3, 6]) {
    const left = metresBeforeCornerWhenReached(corner90, wobble)!;
    assert.ok(left <= threshold + 0.5, `${wobble} m wobble: reached ${left} m before the corner`);
  }
});

test('sketch: GPS error along the wall can only move it by about that error', () => {
  const left = metresBeforeCornerWhenReached(corner90, 3, 3)!;
  assert.ok(left <= threshold + 3 + 0.5, `reached ${left} m before the corner`);
});

test('sketch: guidance keeps pointing straight at the corner until it is reached', () => {
  for (let step = 0; step <= WALL - threshold - 1; step += 1) {
    const user = at(step, 0);
    const aim = aimPoint(user, corner90, 1);
    assert.ok(
      bearingDifference(bearingDegrees(user, aim), 0) < 1,
      `${WALL - step} m before the corner the guidance points ${bearingDegrees(user, aim).toFixed(0)} deg`
    );
  }
});

test('a U-turn checkpoint is not counted early either', () => {
  const uTurn = [at(0, 0), at(WALL, 0), at(0, 30)]; // out along the wall and back along another way
  const left = metresBeforeCornerWhenReached(uTurn, 3)!;
  assert.ok(left <= threshold + 0.5, `reached ${left} m before the turn`);
});

test('a walker who really goes past the corner is still counted as past it', () => {
  // 8 m beyond the corner along the wall, 4 m off to the side: inside the pass radius
  const result = checkpointStep(at(WALL + 8, 4), corner90, 1);
  assert.equal(result?.reason, 'reached');
});

test('a gentle bend still smooths the guidance (aim turns before the bend)', () => {
  const bendAngle = (25 * Math.PI) / 180;
  const bend = [at(0, 0), at(WALL, 0), offset(at(WALL, 0), 60 * Math.cos(bendAngle), 60 * Math.sin(bendAngle))];
  const user = at(WALL - 8, 0);
  const aim = aimPoint(user, bend, 1);
  assert.ok(bearingDifference(bearingDegrees(user, aim), 0) > 3, 'a gentle bend should start turning early');
});

test('turning exactly at the setting counts as gentle, just over as sharp', () => {
  const make = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [at(0, 0), at(WALL, 0), offset(at(WALL, 0), 60 * Math.cos(a), 60 * Math.sin(a))];
  };
  const user = at(WALL - 8, 0);
  const sharp = aimPoint(user, make(GlobalStore.AIM_MAX_TURN + 5), 1);
  assert.ok(distanceMeters(sharp, at(WALL, 0)) < 0.5, 'beyond the limit: aim at the corner itself');
  const gentle = aimPoint(user, make(GlobalStore.AIM_MAX_TURN - 5), 1);
  assert.ok(distanceMeters(gentle, at(WALL, 0)) > 1, 'under the limit: aim carries on past the checkpoint');
});
