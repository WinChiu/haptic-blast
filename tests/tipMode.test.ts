/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTipMode } from '../util/tipMode';

test('adaptive: full tip until enough journeys are finished, then compact', () => {
  assert.equal(chooseTipMode('adaptive', 0, 2), 'full');
  assert.equal(chooseTipMode('adaptive', 1, 2), 'full');
  assert.equal(chooseTipMode('adaptive', 2, 2), 'compact');
  assert.equal(chooseTipMode('adaptive', 50, 2), 'compact');
});

test('always: the full tip every time, however experienced', () => {
  assert.equal(chooseTipMode('always', 0, 2), 'full');
  assert.equal(chooseTipMode('always', 50, 2), 'full');
});

test('off: no reminder, even for a first-time user', () => {
  assert.equal(chooseTipMode('off', 0, 2), 'none');
  assert.equal(chooseTipMode('off', 50, 2), 'none');
});

test('adaptive uses the configured default threshold', () => {
  assert.equal(chooseTipMode('adaptive', 0), 'full');
  assert.equal(chooseTipMode('adaptive', 1000), 'compact');
});
