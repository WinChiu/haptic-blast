/// <reference types="node" />
// Summarises recordings shared from the app (Settings -> Walk recording).
//
//   npm run analyse-recording -- path/to/recording.txt
//   pbpaste | npm run analyse-recording        (macOS, text copied to the clipboard)
import { readFileSync } from 'fs';
import { parseCsv, summariseHeading } from '../util/recorder';

const file = process.argv[2];
const text = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');
const recordings = parseCsv(text);

if (recordings.length === 0) {
  console.log('No recordings found. Expected text that starts with "# haptic-blast recording v1".');
  process.exit(1);
}

const pct = (v: number) => (Number.isNaN(v) ? 'n/a' : `${(v * 100).toFixed(0)}%`);
const deg = (v: number) => (Number.isNaN(v) ? 'n/a' : `${v.toFixed(0)} deg`);

recordings.forEach((rec, i) => {
  const s = summariseHeading(rec.samples);
  const seconds = rec.samples.length ? rec.samples[rec.samples.length - 1].t / 1000 : 0;
  const accuracies = rec.samples.map((x) => x.accuracy).filter((a): a is number => a !== null);
  const meanAccuracy = accuracies.length
    ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
    : NaN;

  console.log(`\nRecording ${i + 1}: started ${rec.meta.started}`);
  console.log(
    `  phone carried: ${rec.meta.phone_position} | haptic=${rec.meta.haptic} sound=${rec.meta.sound} | debug mode=${rec.meta.debug_mode} | ended: ${rec.meta.ended ?? 'unknown (app closed?)'}`
  );
  console.log(`  ${s.samples} samples over ${seconds.toFixed(0)} s; mean GPS accuracy ${Number.isNaN(meanAccuracy) ? 'n/a' : meanAccuracy.toFixed(1) + ' m'}`);
  console.log(`  walking samples (speed >= 1 m/s with a GPS direction): ${s.walking} (${pct(s.walking / Math.max(s.samples, 1))})`);
  if (s.walking === 0) {
    console.log('  Not enough walking data to say anything about heading.');
    return;
  }
  console.log(`  phone heading vs direction of travel: average offset ${deg(s.offsetMean)}, spread ${deg(s.offsetStdDev)}`);
  console.log(`    small spread (under ~20 deg) = a fixed correction could work; large = phone orientation is not usable`);
  console.log(`  within 25 deg of the guidance target: by GPS direction ${pct(s.courseWithinToleranceOfTarget)}, by phone heading ${pct(s.phoneWithinToleranceOfTarget)}`);
});
