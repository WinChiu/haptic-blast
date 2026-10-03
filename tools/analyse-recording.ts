/// <reference types="node" />
// Summarises recordings shared from the app (Settings -> Walk recording).
//
//   npm run analyse-recording -- path/to/recording.txt
//   pbpaste | npm run analyse-recording        (macOS, text copied to the clipboard)
import { readFileSync } from 'fs';
import { formatSummary, parseCsv } from '../util/recorder';

const file = process.argv[2];
const text = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');
const recordings = parseCsv(text);

if (recordings.length === 0) {
  console.log('No recordings found. Expected text that starts with "# haptic-blast recording v1".');
  process.exit(1);
}
recordings.forEach((rec, i) => console.log('\n' + formatSummary(rec, i)));
