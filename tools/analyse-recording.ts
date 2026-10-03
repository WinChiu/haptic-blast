/// <reference types="node" />
// Summarises recordings shared from the app (Settings -> Walk recording).
//
//   npm run analyse-recording -- walk1.csv walk2.csv        one summary per recording
//   npm run analyse-recording -- --table walk1.csv walk2.csv  per-walk rows and a table by condition
//   pbpaste | npm run analyse-recording                     (macOS, text copied to the clipboard)
import { readFileSync } from 'fs';
import { formatSummary, formatTable, parseCsv } from '../util/recorder';

const args = process.argv.slice(2);
const table = args.includes('--table');
const files = args.filter((a) => !a.startsWith('--'));
const text = files.length
  ? files.map((f) => readFileSync(f, 'utf8')).join('\n\n')
  : readFileSync(0, 'utf8');
const recordings = parseCsv(text);

if (recordings.length === 0) {
  console.log('No recordings found. Expected text that starts with "# haptic-blast recording v1".');
  process.exit(1);
}

if (table) console.log(formatTable(recordings));
else recordings.forEach((rec, i) => console.log('\n' + formatSummary(rec, i)));
