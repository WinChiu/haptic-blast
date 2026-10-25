/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BELT_TIMING,
  NEW_JUNCTION_LATCH,
  beltGuidance,
  beltMix,
  relativeBearing,
  triggerDistance,
} from '../util/belt';

const pct = (x: number) => Math.round(x * 100);
const mixPct = (rel: number, zone = 5) => {
  const m = beltMix(rel, zone);
  return [pct(m.left), pct(m.main), pct(m.right)];
};

test('relativeBearing: positive to the right, wraps around north', () => {
  assert.equal(relativeBearing(90, 0), 90);
  assert.equal(relativeBearing(270, 0), -90);
  assert.equal(relativeBearing(10, 350), 20);
  assert.equal(relativeBearing(350, 10), -20);
  assert.equal(relativeBearing(0, 0), 0);
  assert.equal(relativeBearing(180, 0), -180);
});

test('belt strengths reach configured endpoints on both sides of the silent zone', () => {
  for (const zone of [1, 10, 20]) {
    for (const sign of [-1, 1]) {
      const strengths = { minStrength: 25, maxStrength: 80 };
      const edge = beltMix(sign * (zone + 0.00001), zone, strengths);
      const side = sign < 0 ? edge.left : edge.right;
      assert.ok(Math.abs(side - 0.25) < 0.00001);
      assert.equal(edge.main, 0.8);
      const mid = beltMix(sign * 45, zone, strengths);
      assert.equal(mid.main, 0.8);
      assert.equal(sign < 0 ? mid.left : mid.right, 0.8);
      const far = beltMix(sign * 90, zone, strengths);
      assert.equal(far.main, 0);
      assert.equal(sign < 0 ? far.left : far.right, 0.8);
      assert.deepEqual(beltMix(sign * zone, zone, strengths), { left: 0, main: 0, right: 0 });
    }
  }
});

test('beltMix mirrors for negative angles (left and right swap, main stays)', () => {
  for (const a of [90, 80, 67.5, 56.25, 45, 33.75, 22.5, 11.25]) {
    const r = beltMix(a, 5);
    const l = beltMix(-a, 5);
    assert.equal(l.left, r.right);
    assert.equal(l.right, 0);
    assert.equal(l.main, r.main);
  }
});

test('beltMix: silent inside the zone, silent behind, at most two motors at once', () => {
  assert.deepEqual(mixPct(10, 15), [0, 0, 0]);
  assert.deepEqual(mixPct(-15, 15), [0, 0, 0]); // the zone edge is still silent
  assert.deepEqual(mixPct(91), [0, 0, 0]);
  assert.deepEqual(mixPct(-135), [0, 0, 0]);
  for (let a = -180; a <= 180; a += 0.5) {
    const m = beltMix(a, 15);
    const on = [m.left, m.main, m.right].filter((x) => x > 0).length;
    assert.ok(on <= 2, `${on} motors at ${a}`);
  }
});

test('just outside a 15 degree zone: front at full strength, side partly', () => {
  const m = beltMix(16, 15);
  assert.equal(m.main, 1);
  assert.ok(m.right > 0.32 && m.right < 0.35);
  assert.equal(m.left, 0);
});

// ---- when the belt starts ----
const junction = (distanceM: number, legBearing: number | null = 90, index = 4) => ({ index, distanceM, legBearing, approachBearing: 30 });

test('outside the fixed distance points at A, inside points along A to B', () => {
  let latch = NEW_JUNCTION_LATCH;
  const far = beltGuidance({ facing: 0, junction: junction(80), speedMps: 3, zoneDeg: 15, latch });
  assert.equal(far.active, true);
  assert.equal(far.relative, 30);
  latch = far.latch;
  const near = beltGuidance({ facing: 0, junction: junction(29), speedMps: 3, zoneDeg: 15, latch });
  assert.equal(near.active, true);
  assert.equal(near.relative, 90); // the route turns right
  assert.equal(near.mix.right, 1);
});

test('speed mode restores approach direction when the preview distance shrinks', () => {
  const timing = { ...DEFAULT_BELT_TIMING, trigger: 'speed' as const };
  // running at 3 m/s: 24 m is inside the 24 m trigger, so it starts
  let g = beltGuidance({ facing: 0, junction: junction(20), speedMps: 3, zoneDeg: 15, latch: NEW_JUNCTION_LATCH, timing });
  assert.equal(g.active, true);
  // slows to a crawl: the trigger shrinks to its 15 m floor, but 20 m > 15 m
  g = beltGuidance({ facing: 0, junction: junction(20), speedMps: 0.3, zoneDeg: 15, latch: g.latch, timing });
  assert.equal(g.active, true);
  assert.equal(g.relative, 30);
  // standing still
  g = beltGuidance({ facing: 0, junction: junction(20), speedMps: 0, zoneDeg: 15, latch: g.latch, timing });
  assert.equal(g.active, true);
});

test('speed mode: never closer than the floor, so a slow walker is still warned', () => {
  const t = { ...DEFAULT_BELT_TIMING, trigger: 'speed' as const };
  assert.equal(triggerDistance(t, 0), 15);
  assert.equal(triggerDistance(t, null), 15);
  assert.equal(triggerDistance(t, 0.5), 15);
  assert.equal(triggerDistance(t, 3), 24);
  assert.equal(triggerDistance(t, 20), 60); // capped
  assert.equal(triggerDistance(DEFAULT_BELT_TIMING, 3), 30);
});

test('a stopped wearer inside the floor distance is warned (speed mode)', () => {
  const timing = { ...DEFAULT_BELT_TIMING, trigger: 'speed' as const };
  const g = beltGuidance({ facing: 0, junction: junction(12), speedMps: 0, zoneDeg: 15, latch: NEW_JUNCTION_LATCH, timing });
  assert.equal(g.active, true);
});

test('a new junction and the final checkpoint use their approach direction', () => {
  let g = beltGuidance({ facing: 0, junction: junction(10, 90, 4), speedMps: 3, zoneDeg: 15, latch: NEW_JUNCTION_LATCH });
  assert.equal(g.active, true);
  g = beltGuidance({ facing: 0, junction: junction(70, 180, 5), speedMps: 3, zoneDeg: 15, latch: g.latch });
  assert.equal(g.active, true);
  assert.equal(g.relative, 30);
  g = beltGuidance({ facing: 0, junction: junction(5, null, 9), speedMps: 3, zoneDeg: 15, latch: g.latch });
  assert.equal(g.active, true);
  assert.equal(g.relative, 30);
  assert.equal(g.latch.started, false);
});

test('once the wearer faces the next stretch the belt goes silent, and returns if they drift', () => {
  const base = { junction: junction(10, 90), speedMps: 3, zoneDeg: 15 };
  let g = beltGuidance({ ...base, facing: 0, latch: NEW_JUNCTION_LATCH });
  assert.ok(g.mix.right > 0);
  g = beltGuidance({ ...base, facing: 85, latch: g.latch });
  assert.deepEqual(g.mix, { left: 0, main: 0, right: 0 });
  assert.equal(g.active, true);
  g = beltGuidance({ ...base, facing: 40, latch: g.latch });
  assert.ok(g.mix.right > 0);
});

test('a straight junction (next stretch where the wearer already faces) stays silent', () => {
  const g = beltGuidance({ facing: 5, junction: junction(10, 8), speedMps: 3, zoneDeg: 15, latch: NEW_JUNCTION_LATCH });
  assert.deepEqual(g.mix, { left: 0, main: 0, right: 0 });
});

import { DEFAULT_BELT_SETTINGS, clampBeltSettings, junctionAt, timingOf } from '../util/belt';

test('belt settings: defaults, clamping and bad input', () => {
  assert.deepEqual(clampBeltSettings(null), DEFAULT_BELT_SETTINGS);
  assert.equal(DEFAULT_BELT_SETTINGS.enabled, true); // the belt is the main product
  assert.equal(clampBeltSettings({ enabled: false }).enabled, false); // the phone option is kept
  assert.equal(clampBeltSettings({ enabled: 'x' as any }).enabled, true);
  assert.equal(clampBeltSettings({ lookAheadM: 1 }).lookAheadM, 10);
  assert.equal(clampBeltSettings({ lookAheadM: 500 }).lookAheadM, 80);
  assert.equal(clampBeltSettings({ secondsAhead: 99 }).secondsAhead, 15);
  assert.equal(clampBeltSettings({ trigger: 'x' as any }).trigger, 'fixed');
  assert.equal(clampBeltSettings({ pattern: 'taps' }).pattern, 'taps');
  assert.equal(clampBeltSettings({ minStrength: 90, maxStrength: 60 }).minStrength, 60);
  assert.equal(clampBeltSettings({ minStrength: 0 }).minStrength, 1);
  assert.equal(clampBeltSettings({ maxStrength: 150 }).maxStrength, 100);
  assert.equal(clampBeltSettings({ pattern: 'zzz' as any }).pattern, 'steady');
  assert.equal(timingOf({ ...DEFAULT_BELT_SETTINGS, trigger: 'speed', secondsAhead: 6 }).secondsAhead, 6);
});

test('junctionAt: distance to the checkpoint and the direction of the leg leaving it', () => {
  const o = { latitude: 59.35, longitude: 18.07 };
  const north = (m: number) => ({ latitude: o.latitude + m / 111320, longitude: o.longitude });
  const east = (p: typeof o, m: number) => ({ latitude: p.latitude, longitude: p.longitude + m / (111320 * Math.cos((p.latitude * Math.PI) / 180)) });
  const corner = north(100);
  const cps = [corner, east(corner, 100)]; // the route turns right at the corner
  const j = junctionAt(o, cps, 0)!;
  assert.ok(Math.abs(j.distanceM - 100) < 1);
  assert.ok(Math.abs(j.legBearing! - 90) < 1);
  assert.equal(junctionAt(o, cps, 1)!.legBearing, null); // last checkpoint
  assert.equal(junctionAt(o, cps, 5), null);
});

test('retreat outside the fixed boundary restores A without a latched preview', () => {
  const base = { facing: 0, speedMps: null, zoneDeg: 10 };
  let g = beltGuidance({ ...base, junction: junction(30), latch: NEW_JUNCTION_LATCH });
  assert.equal(g.relative, 90);
  g = beltGuidance({ ...base, junction: junction(30.01), latch: g.latch });
  assert.equal(g.relative, 30);
  assert.equal(g.latch.started, false);
  g = beltGuidance({ ...base, junction: junction(29), latch: g.latch });
  assert.equal(g.relative, 90);
});

test('side strength increases monotonically from each chosen silent zone to 45 degrees', () => {
  for (const zone of [1, 10, 20]) {
    let previous = 0;
    for (let a = zone + 0.01; a <= 45; a += 0.25) {
      const m = beltMix(a, zone, { minStrength: 20, maxStrength: 70 });
      assert.equal(m.main, 0.7);
      assert.ok(m.right >= previous && m.right <= 0.7);
      previous = m.right;
    }
  }
});

test('the common zone changes whether an otherwise identical belt target vibrates', () => {
  assert.ok(beltMix(12, 10).right > 0);
  assert.deepEqual(beltMix(12, 15), { left: 0, main: 0, right: 0 });
});
