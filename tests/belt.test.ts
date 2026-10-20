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

// The table from the specification (silent zone small enough not to hide the 11.25 row)
test('beltMix reproduces every row of the specification table', () => {
  assert.deepEqual(mixPct(90), [0, 0, 100]);
  assert.deepEqual(mixPct(80), [0, 22, 100]);
  assert.deepEqual(mixPct(67.5), [0, 50, 100]);
  assert.deepEqual(mixPct(56.25), [0, 75, 100]);
  assert.deepEqual(mixPct(45), [0, 100, 100]);
  assert.deepEqual(mixPct(33.75), [0, 100, 75]);
  assert.deepEqual(mixPct(22.5), [0, 100, 50]);
  assert.deepEqual(mixPct(11.25), [0, 100, 25]);
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
  assert.ok(m.right > 0.3 && m.right < 0.4);
  assert.equal(m.left, 0);
});

// ---- when the belt starts ----
const junction = (distanceM: number, legBearing: number | null = 90, index = 4) => ({ index, distanceM, legBearing });

test('silent far from the junction, starts within the fixed distance, then points at the next stretch', () => {
  let latch = NEW_JUNCTION_LATCH;
  const far = beltGuidance({ facing: 0, junction: junction(80), speedMps: 3, zoneDeg: 15, latch });
  assert.equal(far.active, false);
  assert.deepEqual(far.mix, { left: 0, main: 0, right: 0 });
  latch = far.latch;
  const near = beltGuidance({ facing: 0, junction: junction(29), speedMps: 3, zoneDeg: 15, latch });
  assert.equal(near.active, true);
  assert.equal(near.relative, 90); // the route turns right
  assert.equal(near.mix.right, 1);
});

test('the belt stays on after it has started, even if the distance rule would now say no', () => {
  const timing = { ...DEFAULT_BELT_TIMING, trigger: 'speed' as const };
  // running at 3 m/s: 24 m is inside the 24 m trigger, so it starts
  let g = beltGuidance({ facing: 0, junction: junction(20), speedMps: 3, zoneDeg: 15, latch: NEW_JUNCTION_LATCH, timing });
  assert.equal(g.active, true);
  // slows to a crawl: the trigger shrinks to its 15 m floor, but 20 m > 15 m
  g = beltGuidance({ facing: 0, junction: junction(20), speedMps: 0.3, zoneDeg: 15, latch: g.latch, timing });
  assert.equal(g.active, true, 'slowing down must not switch it off');
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

test('a new junction starts afresh; the last checkpoint (no next stretch) is silent', () => {
  let g = beltGuidance({ facing: 0, junction: junction(10, 90, 4), speedMps: 3, zoneDeg: 15, latch: NEW_JUNCTION_LATCH });
  assert.equal(g.active, true);
  g = beltGuidance({ facing: 0, junction: junction(70, 180, 5), speedMps: 3, zoneDeg: 15, latch: g.latch });
  assert.equal(g.active, false);
  g = beltGuidance({ facing: 0, junction: junction(5, null, 9), speedMps: 3, zoneDeg: 15, latch: g.latch });
  assert.equal(g.active, false);
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
