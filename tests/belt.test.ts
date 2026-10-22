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

test('far from the junction the belt follows the route like version 1; within the distance it points at the turn', () => {
  let latch = NEW_JUNCTION_LATCH;
  // no route target and far from a junction: nothing to follow
  const none = beltGuidance({ facing: 0, junction: junction(80), speedMps: 3, zoneDeg: 15, latch });
  assert.equal(none.phase, 'none');
  assert.deepEqual(none.mix, { left: 0, main: 0, right: 0 });
  // far from the junction, facing 40 degrees left of the route direction: buzz like version 1
  const far = beltGuidance({ facing: 320, routeTarget: 0, junction: junction(80), speedMps: 3, zoneDeg: 10, latch });
  assert.equal(far.phase, 'route');
  assert.equal(far.relative, 40);
  assert.ok(far.mix.right > 0.85 && far.mix.main === 1 && far.mix.left === 0);
  // facing the route direction: silent
  const aligned = beltGuidance({ facing: 3, routeTarget: 0, junction: junction(80), speedMps: 3, zoneDeg: 10, latch: far.latch });
  assert.deepEqual(aligned.mix, { left: 0, main: 0, right: 0 });
  assert.equal(aligned.phase, 'route');
  // within 30 m the target becomes the turn
  const near = beltGuidance({ facing: 0, routeTarget: 0, junction: junction(29), speedMps: 3, zoneDeg: 15, latch: far.latch });
  assert.equal(near.phase, 'junction');
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
  assert.equal(g.phase, 'none'); // far from the new junction, no route target given
  g = beltGuidance({ facing: 0, routeTarget: 0, junction: junction(5, null, 9), speedMps: 3, zoneDeg: 15, latch: g.latch });
  assert.equal(g.phase, 'route'); // the last checkpoint has no next stretch: just follow the route
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
  assert.equal(DEFAULT_BELT_SETTINGS.silentZone, 10);
  assert.equal(clampBeltSettings({ silentZone: 0 }).silentZone, 1);
  assert.equal(clampBeltSettings({ silentZone: 99 }).silentZone, 20);
  assert.equal(clampBeltSettings({ pattern: 'zzz' as any }).pattern, 'continuous');
  assert.equal(DEFAULT_BELT_SETTINGS.pattern, 'continuous');
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

// ---- the simulator (subtle-vibration-simulator.html), copied as the reference ----
// Table rows [angle, main %, side %] with straight-line interpolation between them.
const SIM_POINTS = [[0, 100, 0], [11.25, 100, 25], [22.5, 100, 50], [33.75, 100, 75], [45, 100, 100], [56.25, 75, 100], [67.5, 50, 100], [80, 22, 100], [90, 0, 100]];
function simulator(a: number, s: number): [number, number, number] {
  const b = Math.abs(a);
  if (b <= s || b > 90) return [0, 0, 0];
  let i = 1;
  while (SIM_POINTS[i][0] < b) i++;
  const p = SIM_POINTS[i - 1], q = SIM_POINTS[i], f = (b - p[0]) / (q[0] - p[0]);
  const main = p[1] + f * (q[1] - p[1]), side = p[2] + f * (q[2] - p[2]);
  return a < 0 ? [side, main, 0] : [0, main, side];
}

test('beltMix gives the same strengths as the simulator at every angle and silent zone', () => {
  let worst = 0;
  for (let a = -180; a <= 180; a += 0.25) {
    for (let s = 1; s <= 10; s += 0.5) {
      const sim = simulator(a, s);
      const m = beltMix(a, s);
      const ours = [m.left * 100, m.main * 100, m.right * 100];
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(ours[k] - sim[k]));
    }
  }
  // the simulator's table rows round 22.2 % to 22 %, so allow a fraction of a percent
  assert.ok(worst < 0.3, `largest difference ${worst.toFixed(3)} percentage points`);
});
