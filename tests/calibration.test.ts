/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import type { DeviceAxes } from '../hooks/useCompass';
import {
  CalibrationState,
  finishCalibrationByHand,
  axisHeading,
  calibratedHeading,
  pickAxis,
  startCalibration,
  stepCalibration,
} from '../util/calibration';

const rad = (deg: number) => (deg * Math.PI) / 180;
const dir = (deg: number) => ({ e: Math.sin(rad(deg)), n: Math.cos(rad(deg)) });

// Lying flat, screen up, top edge pointing at `heading`
function flat(heading: number): DeviceAxes {
  const d = dir(heading);
  return { topE: d.e, topN: d.n, topU: 0, normalE: 0, normalN: 0, normalU: 1 };
}

// Standing upright, back camera pointing at `heading`; top edge up, or down
// (upside down in a trouser pocket)
function upright(heading: number, topDown = false): DeviceAxes {
  const d = dir(heading);
  return {
    topE: 0,
    topN: 0,
    topU: topDown ? -1 : 1,
    normalE: -d.e,
    normalN: -d.n,
    normalU: 0,
  };
}

// The same pose after the person turns `deg` clockwise
function turn(a: DeviceAxes, deg: number): DeviceAxes {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return {
    topE: a.topE * c + a.topN * s,
    topN: -a.topE * s + a.topN * c,
    topU: a.topU,
    normalE: a.normalE * c + a.normalN * s,
    normalN: -a.normalE * s + a.normalN * c,
    normalU: a.normalU,
  };
}

const near = (a: number, b: number, tol = 0.5) =>
  Math.abs(((a - b + 540) % 360) - 180) <= tol;

// Feed poses every 20 ms; `pose(t)` gives the phone's axes at time t (ms)
function run(pose: (t: number) => DeviceAxes, untilMs = 15000): CalibrationState {
  let state = startCalibration({ t: 0, axes: pose(0) });
  for (let t = 20; t <= untilMs; t += 20) {
    state = stepCalibration(state, { t, axes: pose(t) });
    if (state.phase === 'done' || state.phase === 'failed') break;
  }
  return state;
}

// Held forward for 0.6 s, moved into the pocket over 0.8 s, then still
const pocketWalk =
  (forward: DeviceAxes, pocket: DeviceAxes) => (t: number) =>
    t < 600 ? forward : t < 1400 ? turn(pocket, (1400 - t) * 0.2) : pocket;

test('axisHeading and pickAxis: flat uses the top edge, upright the back camera', () => {
  assert.equal(pickAxis(flat(30)), 'top');
  assert.ok(near(axisHeading(flat(30), 'top').deg, 30));
  assert.equal(pickAxis(upright(30)), 'back');
  assert.ok(near(axisHeading(upright(30), 'back').deg, 30));
  assert.equal(pickAxis(upright(30, true)), 'back');
});

test('calibration: the pocket heading becomes the forward heading, and follows body turns', () => {
  // Facing 10°, phone upside down in a pocket with its back camera at 200°
  const state = run(pocketWalk(flat(10), upright(200, true)));
  assert.equal(state.phase, 'done');
  if (state.phase !== 'done') return;
  const cal = state.calibration;
  assert.equal(cal.axis, 'back');
  assert.ok(near(calibratedHeading(upright(200, true), cal)!, 10));
  // The person turns 90° right: phone and body turn together
  assert.ok(near(calibratedHeading(turn(upright(200, true), 90), cal)!, 100));
});

test('calibration: works across north (350° forward, pocket axis at 10°)', () => {
  const state = run(pocketWalk(flat(350), flat(10)));
  assert.equal(state.phase, 'done');
  if (state.phase !== 'done') return;
  assert.ok(near(state.calibration.offset, -20));
  assert.ok(near(calibratedHeading(flat(10), state.calibration)!, 350));
});

test('calibration: held upright, the back camera gives the forward heading', () => {
  const state = run(pocketWalk(upright(45), flat(120)));
  assert.equal(state.phase, 'done');
  if (state.phase !== 'done') return;
  assert.ok(near(calibratedHeading(flat(120), state.calibration)!, 45));
});

test('calibration fails if the phone moves while measuring forward', () => {
  const state = run((t) => (t < 600 ? flat(t % 40 < 20 ? 0 : 40) : flat(0)));
  assert.deepEqual(state, { phase: 'failed', reason: 'moving' });
});

test('calibration fails if the phone never settles', () => {
  const state = run((t) => (t < 500 ? flat(0) : flat(t * 0.1)));
  assert.deepEqual(state, { phase: 'failed', reason: 'not-still' });
});

test('calibration waits the minimum placing time even if the phone is still at once', () => {
  let state = startCalibration({ t: 0, axes: flat(0) });
  let doneAt: number | null = null;
  for (let t = 20; t <= 5000 && doneAt === null; t += 20) {
    state = stepCalibration(state, { t, axes: flat(0) });
    if (state.phase === 'done') doneAt = t;
  }
  // Placing starts at 500 ms, so not done before 2500 ms
  assert.ok(doneAt !== null && doneAt >= 2500, `done at ${doneAt}`);
});

test('calibratedHeading is null when the locked axis points nearly straight up', () => {
  const cal = { axis: 'top' as const, offset: 0 };
  assert.equal(calibratedHeading(upright(0), cal), null);
});

// Run until `untilMs` without stopping at done/failed (the person has not tapped)
function runTo(pose: (t: number) => DeviceAxes, untilMs: number): CalibrationState {
  let state = startCalibration({ t: 0, axes: pose(0) });
  for (let t = 20; t <= untilMs; t += 20) state = stepCalibration(state, { t, axes: pose(t) });
  return state;
}

test('tap Done: finishes early with the same answer the timer would give', () => {
  const pose = pocketWalk(flat(40), upright(100, true));
  const auto = run(pose);
  assert.equal(auto.phase, 'done');
  // 0.6 s forward, 0.8 s to put it away, tap at 2.8 s: still for 1.4 s by then
  // (1.1 s once the 0.3 s before the tap is left out)
  const placing = runTo(pose, 2800);
  assert.equal(placing.phase, 'placing');
  const byHand = finishCalibrationByHand(placing, 2800);
  assert.ok(byHand && byHand.phase === 'done');
  if (auto.phase === 'done' && byHand && byHand.phase === 'done') {
    assert.equal(byHand.calibration.axis, auto.calibration.axis);
    assert.ok(near(byHand.calibration.offset, auto.calibration.offset, 1));
  }
});

test('tap Done too early: not accepted, hold still and tap again', () => {
  const pose = pocketWalk(flat(40), upright(100, true));
  const placing = runTo(pose, 1800); // only 0.4 s since it came to rest
  assert.equal(finishCalibrationByHand(placing, 1800), null);
});

test('tap Done: the jolt of the tap itself does not spoil the answer', () => {
  const base = pocketWalk(flat(40), upright(100, true));
  // at 3.0 s the finger presses and the phone is knocked 25 degrees off
  const pose = (t: number) => (t >= 3000 ? turn(base(t), 25) : base(t));
  const placing = runTo(pose, 3100);
  const byHand = finishCalibrationByHand(placing, 3100);
  assert.ok(byHand && byHand.phase === 'done');
  const clean = finishCalibrationByHand(runTo(base, 2900), 2900);
  assert.ok(clean && clean.phase === 'done');
  if (byHand && byHand.phase === 'done' && clean && clean.phase === 'done') {
    assert.ok(near(byHand.calibration.offset, clean.calibration.offset, 1));
  }
});

test('tap Done does nothing outside the placing step', () => {
  const capturing = startCalibration({ t: 0, axes: flat(10) });
  assert.equal(finishCalibrationByHand(capturing, 100), null);
});

test('the phone worn upright on a belt, screen facing out, calibrates the same way', () => {
  // body faces 70; on the belt the back camera points into the body (250)
  const pose = pocketWalk(flat(70), upright(250));
  const placing = runTo(pose, 2800);
  const byHand = finishCalibrationByHand(placing, 2800);
  assert.ok(byHand && byHand.phase === 'done');
  if (byHand && byHand.phase === 'done') {
    const c = byHand.calibration;
    assert.ok(near(calibratedHeading(upright(250), c)!, 70, 1));
    assert.ok(near(calibratedHeading(turn(upright(250), 90), c)!, 160, 1)); // follows a body turn
  }
});
