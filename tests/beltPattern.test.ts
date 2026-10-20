/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { HAPTIC_SHAPE } from '../util/haptics';
import {
  IDLE_RESET_MS,
  NEW_BELT_CLOCK,
  PatternConfig,
  beltFrame,
  motorByte,
  stepBeltGate,
} from '../util/beltPattern';

const cfg = (pattern: PatternConfig['pattern']): PatternConfig => ({ pattern, pulseMs: 750, zoneDeg: 15 });

// Run the 50 ms loop; `activeAt(t)` and `angleAt(t)` describe the wearer
function run(pattern: PatternConfig['pattern'], totalMs: number, activeAt = (_t: number) => true, angleAt = (_t: number) => 60) {
  let clock = NEW_BELT_CLOCK;
  const gates: boolean[] = [];
  for (let t = 1000; t < 1000 + totalMs; t += 50) {
    const step = stepBeltGate(clock, t, activeAt(t - 1000), angleAt(t - 1000), cfg(pattern));
    clock = step.clock;
    gates.push(step.gate);
  }
  return gates;
}
// lengths of runs of true/false
const runs = (g: boolean[]) => {
  const out: { v: boolean; n: number }[] = [];
  for (const x of g) {
    if (out.length && out[out.length - 1].v === x) out[out.length - 1].n++;
    else out.push({ v: x, n: 1 });
  }
  return out;
};

test('continuous: on whenever the belt is active, off when it is not', () => {
  assert.ok(run('continuous', 2000).every((g) => g));
  assert.ok(run('continuous', 2000, () => false).every((g) => !g));
});

test('steady: 750 ms on, 400 ms off, the same every time', () => {
  const r = runs(run('steady', 6000));
  // 750 / 50 = 15 steps on, 400 / 50 = 8 steps off
  for (const x of r.slice(0, -1)) assert.equal(x.n, x.v ? 15 : 8, JSON.stringify(r));
  assert.equal(r[0].v, true); // starts with a pulse at once
});

test('pulsed: the pause shrinks as the angle error grows', () => {
  const pause = (angle: number) => runs(run('pulsed', 4000, () => true, () => angle)).find((x) => !x.v)!.n * 50;
  assert.ok(pause(80) < pause(25), `${pause(80)} vs ${pause(25)}`);
  assert.ok(pause(25) <= HAPTIC_SHAPE.pauseNearMs + 50);
  assert.ok(pause(90) >= HAPTIC_SHAPE.pauseFarMs - 50);
});

test('taps: inside each 750 ms pulse the motor goes on and off every 50 ms', () => {
  const g = run('taps', 750);
  // 15 steps in the pulse alternate on, off, on, off ... starting with on
  assert.deepEqual(g.slice(0, 6), [true, false, true, false, true, false]);
  assert.equal(g.filter(Boolean).length, 8);
});

test('the rhythm does not restart when the belt is silent for a moment', () => {
  // silent for 300 ms in the middle of a pause: the next pulse still waits for its slot
  const g = run('steady', 6000, (t) => !(t >= 800 && t < 1100));
  const starts = g.map((x, i) => (x && !g[i - 1] ? i * 50 : -1)).filter((x) => x >= 0);
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  assert.ok(gaps.every((x) => x >= 1150), `gaps ${gaps}`);
});

test('after a long silence the next buzz starts at once', () => {
  let clock = NEW_BELT_CLOCK;
  let t = 1000;
  // active, then silent for longer than the reset time
  for (; t < 1000 + 500; t += 50) clock = stepBeltGate(clock, t, true, 60, cfg('steady')).clock;
  for (; t < 1000 + 500 + IDLE_RESET_MS + 100; t += 50) clock = stepBeltGate(clock, t, false, 60, cfg('steady')).clock;
  const first = stepBeltGate(clock, t, true, 60, cfg('steady'));
  assert.equal(first.gate, true);
});

test('motorByte: 0 stays 0, anything above 0 starts at the floor, 1 is 255', () => {
  assert.equal(motorByte(0), 0);
  assert.equal(motorByte(-1), 0);
  assert.equal(motorByte(NaN), 0);
  assert.equal(motorByte(1), 255);
  assert.equal(motorByte(0.25), 124); // 80 + 0.25 * 175 = 123.75
  assert.equal(motorByte(0.01), 82);
  assert.equal(motorByte(2), 255);
  assert.equal(motorByte(0.5, 100), 178);
});

test('beltFrame: left, front, right bytes; all zero when the pattern is in a pause', () => {
  assert.deepEqual(beltFrame({ left: 0, main: 1, right: 0.25 }, true), [0, 255, 124]);
  assert.deepEqual(beltFrame({ left: 0, main: 1, right: 0.25 }, false), [0, 0, 0]);
  assert.deepEqual(beltFrame({ left: 0, main: 0, right: 0 }, true), [0, 0, 0]);
});
