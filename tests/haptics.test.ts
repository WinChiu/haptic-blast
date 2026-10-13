/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HAPTIC_SETTINGS,
  HAPTIC_LIMITS,
  HAPTIC_SHAPE,
  clampSettings,
  effectiveDeadband,
  exponentialIntensity,
  hapticStyleOf,
  pauseForDeviation,
  NEW_PULSE_CLOCK,
  planPulse,
  shapeFor,
  stepPulse,
  shouldConfirm,
} from '../util/haptics';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const { minIntensity, maxIntensity, maxDeviation } = HAPTIC_SHAPE;

test('defaults follow the guide: pulsed, 10 deg, 750 ms, 50 ms click', () => {
  assert.deepEqual(DEFAULT_HAPTIC_SETTINGS, { mode: 'pulsed', deadband: 15, pulseMs: 750, confirmMs: 50, minStrength: 50 });
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
  assert.equal(clampSettings({ mode: 'steady' }).mode, 'steady');
  assert.equal(clampSettings({ deadband: 7.6 }).deadband, 8); // whole degrees
});

test('hapticStyleOf: tap when the phone cannot buzz, otherwise the mode', () => {
  assert.equal(hapticStyleOf(false, 'pulsed'), 'tap');
  assert.equal(hapticStyleOf(true, 'pulsed'), 'pulse');
  assert.equal(hapticStyleOf(true, 'continuous'), 'continuous');
  assert.equal(hapticStyleOf(true, 'steady'), 'steady-pulse');
  assert.equal(hapticStyleOf(false, 'steady'), 'tap');
});

test('effectiveDeadband: never narrower than the chosen zone, widens with GPS error', () => {
  assert.equal(effectiveDeadband(15, null, false, 25), 15);
  assert.equal(effectiveDeadband(15, 3, false, 25), 15); // 3 m at 25 m = 7 deg
  assert.equal(effectiveDeadband(15, 12, false, 25), 25); // 26 deg, capped
  assert.equal(effectiveDeadband(15, 10, false, 25), 22); // 22 deg
});

test('effectiveDeadband: snapping to the path needs a narrower zone, and it is capped', () => {
  assert.ok(effectiveDeadband(10, 12, true, 25) < effectiveDeadband(10, 12, false, 25));
  assert.equal(effectiveDeadband(10, 500, false, 5), 25);
  assert.equal(effectiveDeadband(15, 10, false, 0), 15);
});

test('steady mode: same pulse and pause at every error, only the strength grows', () => {
  const steady = { ...DEFAULT_HAPTIC_SETTINGS, mode: 'steady' as const };
  const near = planPulse(25, steady)!;
  const mid = planPulse(50, steady)!;
  const far = planPulse(90, steady)!;
  assert.equal(near.pulseMs, steady.pulseMs);
  assert.equal(far.pulseMs, steady.pulseMs);
  assert.equal(near.pauseMs, HAPTIC_SHAPE.pauseSteadyMs);
  assert.equal(mid.pauseMs, HAPTIC_SHAPE.pauseSteadyMs);
  assert.equal(far.pauseMs, HAPTIC_SHAPE.pauseSteadyMs);
  assert.ok(near.amplitude < mid.amplitude && mid.amplitude < far.amplitude);
  assert.equal(planPulse(10, steady), null); // silent inside the zone
});

test('pulsed mode still shortens its pauses (unchanged)', () => {
  const a = planPulse(25, DEFAULT_HAPTIC_SETTINGS)!;
  const b = planPulse(90, DEFAULT_HAPTIC_SETTINGS)!;
  assert.ok(b.pauseMs < a.pauseMs);
});

// Run the 50 ms loop over a list of angle errors and return when pulses started
function pulseStarts(settings: any, errorAt: (t: number) => number, totalMs: number) {
  let clock = NEW_PULSE_CLOCK;
  const starts: number[] = [];
  for (let t = 1000; t < 1000 + totalMs; t += 50) {
    const step = stepPulse(clock, errorAt(t - 1000), t, settings);
    clock = step.clock;
    if (step.action.kind === 'pulse') starts.push(t - 1000);
  }
  return starts;
}

test('steady mode: a steady pace while the angle stays outside the zone', () => {
  const steady = { ...DEFAULT_HAPTIC_SETTINGS, mode: 'steady' as const };
  const starts = pulseStarts(steady, () => 60, 5000);
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  assert.ok(gaps.every((g) => g === 1150), `gaps ${gaps}`); // 750 pulse + 400 pause
});

test('steady mode: briefly touching the zone does not restart the rhythm', () => {
  const steady = { ...DEFAULT_HAPTIC_SETTINGS, mode: 'steady' as const };
  // outside, dips inside for 200 ms at 1000-1200 ms (during the first pulse), back outside
  const err = (t: number) => (t >= 1000 && t < 1200 ? 5 : 60);
  const starts = pulseStarts(steady, err, 6000);
  // first pulse at 0, the next may not come before 1150 ms even though we left the zone at 1200
  assert.equal(starts[0], 0);
  assert.ok(starts[1] >= 1150, `second pulse came at ${starts[1]}`);
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  assert.ok(gaps.every((g) => g >= 1150), `gaps ${gaps}`);
});

test('turning in and out of the zone every second never gives a pulse earlier than its slot', () => {
  const steady = { ...DEFAULT_HAPTIC_SETTINGS, mode: 'steady' as const };
  const err = (t: number) => (Math.floor(t / 500) % 2 === 0 ? 40 : 5);
  const starts = pulseStarts(steady, err, 10000);
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  assert.ok(gaps.every((g) => g >= 1150), `gaps ${gaps}`);
});

// Same loop, but returns every action so strength changes during a pulse can be seen
function actions(settings: any, errorAt: (t: number) => number, totalMs: number) {
  let clock = NEW_PULSE_CLOCK;
  const out: { t: number; kind: string; amplitude?: number }[] = [];
  for (let t = 1000; t < 1000 + totalMs; t += 50) {
    const step = stepPulse(clock, errorAt(t - 1000), t, settings);
    clock = step.clock;
    const a: any = step.action;
    if (a.kind !== 'none') out.push({ t: t - 1000, kind: a.kind, amplitude: a.amplitude });
  }
  return out;
}

test('steady mode: strength follows the angle during a pulse, the rhythm does not change', () => {
  const steady = { ...DEFAULT_HAPTIC_SETTINGS, mode: 'steady' as const };
  // 80 degrees off, then turning steadily towards 25 degrees over the first pulse
  const err = (t: number) => Math.max(25, 80 - t * 0.07);
  const a = actions(steady, err, 1100);
  const start = a.find((x) => x.kind === 'pulse')!;
  const levels = a.filter((x) => x.kind === 'level').map((x) => x.amplitude!);
  assert.ok(levels.length >= 3, 'strength was updated during the pulse');
  assert.ok(levels[levels.length - 1] < start.amplitude! - 0.1, 'it got weaker as the angle shrank');
  assert.ok(levels.every((v, i) => i === 0 || v <= levels[i - 1] + 1e-9), 'steadily weaker');
  const starts = pulseStarts(steady, err, 5000);
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  assert.ok(gaps.every((g) => g === 1150), `rhythm unchanged, gaps ${gaps}`);
});

test('steady mode: no strength change when the angle holds steady, none in pulsed mode', () => {
  const steady = { ...DEFAULT_HAPTIC_SETTINGS, mode: 'steady' as const };
  assert.equal(actions(steady, () => 60, 3000).filter((x) => x.kind === 'level').length, 0);
  const err = (t: number) => Math.max(25, 80 - t * 0.07);
  assert.equal(actions(DEFAULT_HAPTIC_SETTINGS, err, 3000).filter((x) => x.kind === 'level').length, 0);
});

test('steady mode: no strength updates in the silence between pulses', () => {
  const steady = { ...DEFAULT_HAPTIC_SETTINGS, mode: 'steady' as const };
  const err = (t: number) => (t < 800 ? 80 : 30);
  const a = actions(steady, err, 1150).filter((x) => x.kind === 'level');
  assert.ok(a.every((x) => x.t < 750), 'only while the pulse is running');
});

test('minimum strength: the weakest buzz just outside the zone follows the setting', () => {
  const weak = { ...DEFAULT_HAPTIC_SETTINGS, minStrength: 20 };
  const strong = { ...DEFAULT_HAPTIC_SETTINGS, minStrength: 50 };
  const justOutside = DEFAULT_HAPTIC_SETTINGS.deadband + 1;
  const a = planPulse(justOutside, weak)!.amplitude;
  const b = planPulse(justOutside, strong)!.amplitude;
  assert.ok(Math.abs(a - 0.2) < 0.03, `weak ${a}`);
  assert.ok(Math.abs(b - 0.5) < 0.03, `strong ${b}`);
  // still the full strength far off, still rising with the angle
  assert.ok(Math.abs(planPulse(90, strong)!.amplitude - 1) < 1e-9);
  assert.ok(planPulse(40, strong)!.amplitude < planPulse(70, strong)!.amplitude);
});

test('minimum strength is clamped and has a default of 50%', () => {
  assert.equal(DEFAULT_HAPTIC_SETTINGS.minStrength, 50);
  assert.equal(clampSettings({ minStrength: 5 }).minStrength, HAPTIC_LIMITS.minStrength.min);
  assert.equal(clampSettings({ minStrength: 150 }).minStrength, HAPTIC_LIMITS.minStrength.max);
  assert.equal(shapeFor({ minStrength: 30 }).minIntensity, 0.3);
});

test('weakest buzz at 100%: every buzz is full strength, nothing breaks', () => {
  const full = { ...DEFAULT_HAPTIC_SETTINGS, minStrength: 100 };
  for (const e of [16, 25, 45, 70, 90, 170]) {
    assert.equal(planPulse(e, full)!.amplitude, 1);
  }
  assert.equal(planPulse(10, full), null); // still silent inside the zone
});
