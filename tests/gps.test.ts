/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { accuracyOk, isFixGoodToStart, isFixUsable, pickHeading } from '../util/gps';
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

test('pickHeading: true north when available, otherwise magnetic', () => {
  assert.equal(pickHeading(100, 92), 100);
  assert.equal(pickHeading(0, 350), 0); // 0 is a valid true heading
  assert.equal(pickHeading(-1, 92), 92); // -1 means unavailable
  assert.equal(pickHeading(null, 92), 92);
  assert.equal(pickHeading(undefined, 92), 92);
});
