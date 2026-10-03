/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Recording,
  Sample,
  circularDiff,
  circularStats,
  formatSummary,
  parseCsv,
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
