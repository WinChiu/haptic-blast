/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Recording,
  Sample,
  circularDiff,
  circularStats,
  conditionOf,
  formatSummary,
  formatTable,
  groupWalks,
  motionRow,
  parseCsv,
  walkMetrics,
  summariseHeading,
  toCsv,
} from '../util/recorder';

const sample = (over: Partial<Sample> = {}): Sample => ({
  t: 0,
  lat: 59.35,
  lng: 18.07,
  accuracy: 5,
  speed: 1.4,
  course: 90,
  phoneHeading: 80,
  targetBearing: 90,
  checkpoint: 2,
  ...over,
});

test('circularDiff wraps around north', () => {
  assert.equal(circularDiff(10, 350), 20);
  assert.equal(circularDiff(350, 10), -20);
  assert.equal(circularDiff(180, 0), 180);
  assert.equal(circularDiff(90, 90), 0);
});

test('circularStats: a constant offset has zero spread', () => {
  const s = circularStats([90, 90, 90]);
  assert.ok(Math.abs(s.mean - 90) < 1e-6);
  assert.ok(s.stdDev < 1e-3);
});

test('circularStats: angles either side of north average to north, not 180', () => {
  const s = circularStats([350, 10, 355, 5]);
  assert.ok(Math.abs(s.mean) < 1e-6, `mean ${s.mean}`);
});

test('circularStats: scattered angles have a large spread', () => {
  const s = circularStats([0, 90, 180, 270]);
  assert.ok(s.r < 0.01);
  assert.ok(s.stdDev > 90);
});

test('toCsv then parseCsv gives the same recording back', () => {
  const rec: Recording = {
    meta: { started: '2026-10-03T12:00:00Z', phone_position: 'pocket' },
    samples: [
      sample({ t: 0 }),
      sample({ t: 500, accuracy: null, course: null, targetBearing: null, checkpoint: null }),
    ],
  };
  const parsed = parseCsv(toCsv(rec));
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].meta, rec.meta);
  assert.equal(parsed[0].samples.length, 2);
  assert.equal(parsed[0].samples[0].course, 90);
  assert.equal(parsed[0].samples[1].course, null);
  assert.equal(parsed[0].samples[1].checkpoint, null);
  assert.equal(parsed[0].samples[1].t, 500);
});

test('parseCsv reads several recordings joined together', () => {
  const a: Recording = { meta: { n: '1' }, samples: [sample()] };
  const b: Recording = { meta: { n: '2' }, samples: [sample(), sample({ t: 500 })] };
  const parsed = parseCsv(toCsv(a) + '\n\n' + toCsv(b));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].samples.length, 1);
  assert.equal(parsed[1].samples.length, 2);
  assert.equal(parsed[1].meta.n, '2');
});

test('summariseHeading: a steady offset between phone and course is found', () => {
  // phone points 40 degrees away from the way the person walks, constantly
  const samples = [0, 60, 120, 200, 300].map((c) =>
    sample({ course: c, phoneHeading: (c - 40 + 360) % 360, targetBearing: c })
  );
  const s = summariseHeading(samples);
  assert.equal(s.walking, 5);
  assert.ok(Math.abs(s.offsetMean - 40) < 1e-6);
  assert.ok(s.offsetStdDev < 1e-3);
  assert.equal(s.courseWithinToleranceOfTarget, 1);
  assert.equal(s.phoneWithinToleranceOfTarget, 0); // 40 degrees off, tolerance is 25
});

test('summariseHeading ignores slow samples and samples with no course', () => {
  const samples = [
    sample({ speed: 0.2 }),
    sample({ course: null }),
    sample({ speed: null }),
    sample({ speed: 1.5 }),
  ];
  assert.equal(summariseHeading(samples).walking, 1);
});

test('summariseHeading with no walking samples does not crash', () => {
  const s = summariseHeading([]);
  assert.equal(s.walking, 0);
  assert.ok(Number.isNaN(s.offsetMean));
});

test('formatSummary: a short report with the offset and the carry position', () => {
  const samples = [0, 90, 180].map((c) =>
    sample({ course: c, phoneHeading: (c - 40 + 360) % 360, targetBearing: c })
  );
  const text = formatSummary({ meta: { started: 'x', phone_position: 'pocket', ended: 'finished' }, samples });
  assert.ok(text.includes('phone carried: pocket'));
  assert.ok(text.includes('average offset 40 deg'));
  assert.ok(text.split('\n').length < 10, 'should be a few lines');
});

test('formatSummary: says so when there is no walking data (e.g. debug mode)', () => {
  const text = formatSummary({ meta: { started: 'x' }, samples: [sample({ speed: 0 })] });
  assert.ok(text.includes('Not enough walking data'));
});

test('formatSummary: flags a debug-mode recording as fake positions', () => {
  const text = formatSummary({ meta: { started: 'x', debug_mode: 'true' }, samples: [sample()] });
  assert.ok(text.includes('debug mode, the positions are fake'));
  const real = formatSummary({ meta: { started: 'x', debug_mode: 'false' }, samples: [sample()] });
  assert.ok(!real.includes('positions are fake'));
});

const recording = (meta: Record<string, string>, samples: Sample[]): Recording => ({
  meta: { started: 'x', haptic: 'true', sound: 'false', debug_mode: 'false', phone_position: 'pocket', ...meta },
  samples,
});
// a 60 s walk: the phone points 30 deg away from the target for 20 s in the middle
const walkSamples = (): Sample[] =>
  Array.from({ length: 61 }, (_, i) =>
    sample({
      t: i * 1000,
      speed: 1.1,
      course: 100,
      phoneHeading: 100,
      targetBearing: i >= 20 && i < 40 ? 130 : 100,
    })
  );

test('conditionOf: carry position and feedback', () => {
  assert.equal(conditionOf({ phone_position: 'pocket', haptic: 'true', sound: 'false' }), 'pocket | haptic');
  assert.equal(conditionOf({ phone_position: 'bag', haptic: 'true', sound: 'true' }), 'bag | haptic+sound');
  assert.equal(conditionOf({ phone_position: 'hand-flat', haptic: 'false', sound: 'true' }), 'hand-flat | sound');
  assert.equal(conditionOf({ phone_position: 'hand-flat', haptic: 'false', sound: 'false' }), 'hand-flat | no feedback');
});

test('walkMetrics: aligned share, episodes per minute and the label', () => {
  const w = walkMetrics(recording({ label: 'angel-test-1' }, walkSamples()));
  assert.equal(w.label, 'angel-test-1');
  assert.equal(w.condition, 'pocket | haptic');
  assert.ok(Math.abs(w.minutes - 1) < 1e-9);
  assert.ok(Math.abs(w.phoneAligned - 41 / 61) < 1e-9); // 20 of 61 samples are 30 deg off
  assert.ok(Math.abs(w.episodesPerMin - 1) < 1e-9); // one stretch in one minute
  assert.equal(w.offsetMean, 0);
  assert.equal(walkMetrics(recording({}, walkSamples())).label, 'unlabelled');
});

test('groupWalks: groups by condition and leaves out debug-mode recordings', () => {
  const walks = [
    walkMetrics(recording({ label: 'a' }, walkSamples())),
    walkMetrics(recording({ label: 'b' }, walkSamples())),
    walkMetrics(recording({ label: 'c', phone_position: 'bag' }, walkSamples())),
    walkMetrics(recording({ label: 'fake', debug_mode: 'true' }, walkSamples())),
  ];
  const groups = groupWalks(walks);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.condition === 'pocket | haptic')!.walks.length, 2);
  assert.ok(!groups.some((g) => g.walks.some((w) => w.label === 'fake')));
});

test('formatTable: counts walks, flags debug recordings and few repeats', () => {
  const text = formatTable([
    recording({ label: 'a' }, walkSamples()),
    recording({ label: 'fake', debug_mode: 'true' }, walkSamples()),
  ]);
  assert.ok(text.includes('Walks: 1'));
  assert.ok(text.includes('1 debug-mode recording left out'));
  assert.ok(text.includes('pocket | haptic  (1 walk, fewer than 3: treat as anecdotal)'));
});

test('formatTable: three repeats are no longer flagged as anecdotal', () => {
  const text = formatTable([1, 2, 3].map((n) => recording({ label: 'r' + n }, walkSamples())));
  assert.ok(text.includes('(3 walks)'));
});

test('walkMetrics: judges alignment with the silent zone the walk was recorded with', () => {
  // the phone is always 15 degrees off the target
  const samples = Array.from({ length: 11 }, (_, i) =>
    sample({ t: i * 1000, course: 100, phoneHeading: 100, targetBearing: 115 })
  );
  const wide = walkMetrics(recording({ deadband_deg: '20' }, samples));
  const narrow = walkMetrics(recording({ deadband_deg: '10' }, samples));
  const old = walkMetrics(recording({}, samples)); // no deadband in the header: 25 degrees
  assert.equal(wide.tolerance, 20);
  assert.equal(wide.phoneAligned, 1);
  assert.equal(narrow.phoneAligned, 0);
  assert.equal(old.tolerance, 25);
  assert.equal(old.phoneAligned, 1);
});

// ---------- optional motion sensors ----------
const reading = {
  acceleration: { x: 0.1, y: -0.2, z: 0.3 },
  accelerationIncludingGravity: { x: 0.1, y: -0.2, z: -9.5 },
  rotationRate: { alpha: 1.5, beta: -2.5, gamma: 0.25 },
};

test('motionRow: gravity is the total minus the user\'s own acceleration', () => {
  const row = motionRow(1234.4, reading);
  assert.equal(row[0], 1234);
  assert.deepEqual(row.slice(1, 4), [0.1, -0.2, 0.3]); // user acceleration
  near3(row[4]!, 0); near3(row[5]!, 0); near3(row[6]!, -9.8); // gravity
  assert.deepEqual(row.slice(7, 10), [1.5, -2.5, 0.25]); // rotation rate
});

test('motionRow: missing sensors become null', () => {
  const row = motionRow(0, { ...reading, acceleration: null, rotationRate: null });
  assert.deepEqual(row.slice(1), [null, null, null, null, null, null, null, null, null]);
});

function near3(a: number, b: number) {
  assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
}

test('motion readings survive toCsv then parseCsv, and are not mistaken for GPS samples', () => {
  const rec: Recording = {
    meta: { started: 'x', motion_hz: '20' },
    samples: [sample({ t: 0 }), sample({ t: 1000 })],
    motion: [motionRow(0, reading), motionRow(50, { ...reading, rotationRate: null })],
  };
  const text = toCsv(rec);
  assert.ok(text.includes('# motion'));
  assert.ok(text.includes('t_ms,ax,ay,az,gx,gy,gz,wx,wy,wz'));
  const parsed = parseCsv(text)[0];
  assert.equal(parsed.samples.length, 2); // the two GPS samples only
  assert.equal(parsed.motion!.length, 2);
  assert.equal(parsed.motion![0][3], 0.3);
  assert.equal(parsed.motion![1][7], null); // blank stayed blank
  assert.equal(parsed.meta.motion_hz, '20');
});

test('a recording without motion has no motion section, and several recordings stay separate', () => {
  const plain: Recording = { meta: { n: '1' }, samples: [sample()] };
  const withMotion: Recording = { meta: { n: '2' }, samples: [sample()], motion: [motionRow(0, reading)] };
  assert.ok(!toCsv(plain).includes('# motion'));
  const parsed = parseCsv(toCsv(withMotion) + '\n\n' + toCsv(plain) + '\n\n' + toCsv(withMotion));
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].motion!.length, 1);
  assert.equal(parsed[1].motion, undefined);
  assert.equal(parsed[2].samples.length, 1);
});

test('formatSummary mentions the motion readings and their rate', () => {
  const motion = Array.from({ length: 200 }, (_, i) => motionRow(i * 50, reading)); // 10 s at 20 a second
  const samples = Array.from({ length: 11 }, (_, i) => sample({ t: i * 1000 }));
  const text = formatSummary({ meta: { started: 'x' }, samples, motion });
  assert.ok(text.includes('motion sensors: 200 readings (about 20 a second)'));
});
