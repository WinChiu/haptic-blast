/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HAPTIC_SETTINGS,
  HAPTIC_LIMITS,
  HAPTIC_SHAPE,
  clampSettings,
  exponentialIntensity,
  hapticStyleOf,
  pauseForDeviation,
  planPulse,
  shouldConfirm,
} from '../util/haptics';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const { minIntensity, maxIntensity, maxDeviation } = HAPTIC_SHAPE;

test('defaults follow the guide: pulsed, 10 deg, 750 ms, 50 ms click', () => {
  assert.deepEqual(DEFAULT_HAPTIC_SETTINGS, { mode: 'pulsed', deadband: 10, pulseMs: 750, confirmMs: 50 });
});

test('exponentialIntensity: silent inside the dead zone', () => {
  assert.equal(exponentialIntensity(0, 10), 0);
  assert.equal(exponentialIntensity(10, 10), 0);
  assert.equal(exponentialIntensity(-9.9, 10), 0);
});

test('exponentialIntensity: weakest just outside the dead zone, strongest at the maximum deviation', () => {
  near(exponentialIntensity(10.0001, 10), minIntensity, 1e-3);
  near(exponentialIntensity(maxDeviation, 10), maxIntensity);
  near(exponentialIntensity(180, 10), maxIntensity); // beyond it stays at the maximum
});

test('exponentialIntensity: same for left and right, and strictly increasing', () => {
  assert.equal(exponentialIntensity(-40, 10), exponentialIntensity(40, 10));
  let last = 0;
  for (let e = 11; e <= 90; e += 1) {
    const i = exponentialIntensity(e, 10);
    assert.ok(i > last, `not increasing at ${e}`);
    last = i;
  }
});

test('exponentialIntensity: equal steps in angle multiply the intensity by the same factor', () => {
  const a = exponentialIntensity(30, 10), b = exponentialIntensity(40, 10), c = exponentialIntensity(50, 10);
  near(b / a, c / b, 1e-9);
  assert.ok(b / a > 1);
});

test('exponentialIntensity: the curve starts at the dead zone edge whatever the dead zone is', () => {
  for (const d of [5, 10, 15]) {
    near(exponentialIntensity(d + 0.0001, d), minIntensity, 1e-3);
    near(exponentialIntensity(maxDeviation, d), maxIntensity);
  }
});

test('pauseForDeviation: 600 ms just outside the dead zone, 200 ms at the maximum deviation', () => {
  assert.equal(pauseForDeviation(10, 10), 600);
  assert.equal(pauseForDeviation(maxDeviation, 10), 200);
  assert.equal(pauseForDeviation(150, 10), 200);
  assert.equal(pauseForDeviation(50, 10), 400); // halfway
});

test('pauseForDeviation: never outside 200 to 600 ms', () => {
  for (let e = 0; e <= 180; e += 3) {
    const p = pauseForDeviation(e, 10);
    assert.ok(p >= 200 && p <= 600, `${p} at ${e}`);
  }
});

test('planPulse: null on course, otherwise a pulse with the setting\'s length', () => {
  assert.equal(planPulse(7, DEFAULT_HAPTIC_SETTINGS), null);
  const plan = planPulse(45, DEFAULT_HAPTIC_SETTINGS)!;
  assert.equal(plan.pulseMs, 750);
  assert.ok(plan.amplitude > minIntensity && plan.amplitude < maxIntensity);
  assert.ok(plan.pauseMs > 200 && plan.pauseMs < 600);
  assert.equal(planPulse(45, { ...DEFAULT_HAPTIC_SETTINGS, pulseMs: 500 })!.pulseMs, 500);
});

test('planPulse: a wider dead zone stays silent for a larger error', () => {
  assert.equal(planPulse(14, { ...DEFAULT_HAPTIC_SETTINGS, deadband: 15 }), null);
  assert.notEqual(planPulse(14, { ...DEFAULT_HAPTIC_SETTINGS, deadband: 10 }), null);
});

test('shouldConfirm: only on entering the dead zone, and not more often than the gap', () => {
  assert.equal(shouldConfirm(true, 8, 10, 5000), true);
  assert.equal(shouldConfirm(false, 8, 10, 5000), false); // was already inside
  assert.equal(shouldConfirm(true, 20, 10, 5000), false); // still outside
  assert.equal(shouldConfirm(true, 8, 10, 500), false); // too soon after the last click
});

test('clampSettings: keeps every value inside the guide\'s ranges', () => {
  const s = clampSettings({ deadband: 99, pulseMs: 10, confirmMs: 5000 });
  assert.equal(s.deadband, HAPTIC_LIMITS.deadband.max);
  assert.equal(s.pulseMs, HAPTIC_LIMITS.pulseMs.min);
  assert.equal(s.confirmMs, HAPTIC_LIMITS.confirmMs.max);
  assert.equal(clampSettings({ deadband: 1 }).deadband, HAPTIC_LIMITS.deadband.min);
});

test('clampSettings: missing, wrong or corrupt saved data gives the defaults', () => {
  assert.deepEqual(clampSettings(null), DEFAULT_HAPTIC_SETTINGS);
  assert.deepEqual(clampSettings(undefined), DEFAULT_HAPTIC_SETTINGS);
  assert.deepEqual(clampSettings({ deadband: 'x' as any, pulseMs: NaN, mode: 'weird' as any }), DEFAULT_HAPTIC_SETTINGS);
  assert.equal(clampSettings({ mode: 'continuous' }).mode, 'continuous');
  assert.equal(clampSettings({ deadband: 7.6 }).deadband, 8); // whole degrees
});

test('hapticStyleOf: tap when the phone cannot buzz, otherwise the mode', () => {
  assert.equal(hapticStyleOf(false, 'pulsed'), 'tap');
  assert.equal(hapticStyleOf(true, 'pulsed'), 'pulse');
  assert.equal(hapticStyleOf(true, 'continuous'), 'continuous');
});
