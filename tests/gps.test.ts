/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { GPS_START_LIMITS, accuracyOk, clampStartAccuracy, isFixGoodToStart, isFixUsable, pickHeading, usableAccuracyFor } from '../util/gps';
import { GlobalStore } from '../util/globals';

const { maxUsableAccuracy, maxStartAccuracy } = GlobalStore.GPS;

test('accuracyOk: at or under the limit passes, over fails', () => {
  assert.equal(accuracyOk(5, 10), true);
  assert.equal(accuracyOk(10, 10), true);
  assert.equal(accuracyOk(10.1, 10), false);
});

test('accuracyOk: an unknown accuracy (mock location) passes', () => {
  assert.equal(accuracyOk(null, 10), true);
  assert.equal(accuracyOk(undefined, 10), true);
});

test('start needs a better fix than route progress does', () => {
  assert.ok(maxStartAccuracy < maxUsableAccuracy);
  const between = (maxStartAccuracy + maxUsableAccuracy) / 2;
  assert.equal(isFixUsable(between), true); // still moves the route on
  assert.equal(isFixGoodToStart(between), false); // but not good enough to start from
});

test('the poor fixes seen at the start of the real walks are rejected', () => {
  // 21 to 29 m accuracy in the first seconds of the Lappis walks
  for (const a of [21.4, 23.7, 28.3, 29.3]) assert.equal(isFixUsable(a), false);
  // the typical walking accuracy is accepted
  for (const a of [5.4, 6.7, 8.2]) assert.equal(isFixUsable(a), true);
});

test('custom planning threshold unlocks usable fixes without admitting fixes navigation rejects', () => {
  assert.equal(isFixGoodToStart(15, 10), false);
  assert.equal(isFixGoodToStart(15, 15), true);
  assert.equal(isFixGoodToStart(20, 20), true);
  assert.equal(isFixGoodToStart(20.1, 20), false);
  assert.equal(isFixGoodToStart(25, 50), true); // the start limit can now be raised to 50 m
});

test('planning threshold handles saved invalid values and clamps to five metre steps', () => {
  for (const value of [null, undefined, '20', NaN, Infinity]) {
    assert.equal(clampStartAccuracy(value), maxStartAccuracy);
  }
  assert.equal(clampStartAccuracy(-1), 5);
  assert.equal(clampStartAccuracy(99), 50); // the cap is 50 m now (it was the 20 m usable limit)
  assert.equal(clampStartAccuracy(13), 15);
});

test('pickHeading: true north when available, otherwise magnetic', () => {
  assert.equal(pickHeading(100, 92), 100);
  assert.equal(pickHeading(0, 350), 0); // 0 is a valid true heading
  assert.equal(pickHeading(-1, 92), 92); // -1 means unavailable
  assert.equal(pickHeading(null, 92), 92);
  assert.equal(pickHeading(undefined, 92), 92);
});

test('the start limit can be raised to 50 m, and never below 5 m', () => {
  assert.equal(GPS_START_LIMITS.max, 50);
  assert.equal(clampStartAccuracy(100), 50);
  assert.equal(clampStartAccuracy(1), 5);
  assert.equal(clampStartAccuracy(undefined), GlobalStore.GPS.maxStartAccuracy);
  assert.equal(GlobalStore.GPS.maxStartAccuracy, 10); // the default is unchanged
});

test('route progress ignores fixes worse than 20 m, unless the user allowed more', () => {
  // default: exactly as before
  assert.equal(isFixUsable(20), true);
  assert.equal(isFixUsable(20.1), false);
  assert.equal(usableAccuracyFor(10), 20);
  assert.equal(usableAccuracyFor(20), 20);
  // raised: a fix that is allowed to start is also allowed to keep guiding
  assert.equal(usableAccuracyFor(40), 40);
  assert.equal(isFixUsable(35, 40), true);
  assert.equal(isFixUsable(45, 40), false);
  assert.equal(isFixUsable(30, 10), false); // a lower start limit does not widen it
  assert.equal(usableAccuracyFor(500), 50); // never beyond the 50 m cap
  // anything that may start must not be ignored once running
  for (const limit of [5, 10, 20, 30, 40, 50]) assert.equal(isFixUsable(limit, limit), true);
});
