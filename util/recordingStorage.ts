import AsyncStorage from '@react-native-async-storage/async-storage';
import { Recording, formatSummary, toCsv } from './recorder';

// Recordings stay on the phone (AsyncStorage, the app's private storage). They
// are never sent to Firebase. Deleting or reinstalling the app deletes them.
const RECORDINGS_KEY = 'recordings.v1';
const PREFS_KEY = 'recordings.prefs.v1';
export const MAX_RECORDINGS = 5; // oldest are dropped beyond this

export type PhonePosition =
  | 'hand-flat'
  | 'hand-upright'
  | 'pocket'
  | 'bag'
  | 'other';

export const PHONE_POSITIONS: { value: PhonePosition; label: string }[] = [
  { value: 'hand-flat', label: 'Hand, flat' },
  { value: 'hand-upright', label: 'Hand, upright' },
  { value: 'pocket', label: 'Pocket' },
  { value: 'bag', label: 'Bag' },
  { value: 'other', label: 'Other' },
];

export type RecordingPrefs = {
  enabled: boolean;
  phonePosition: PhonePosition;
  // Free text saved in every recording, for example "angel-lappis-pocket-1"
  // (person, route, condition, repeat). Used to tell walks apart in the analysis.
  label: string;
};
const DEFAULT_PREFS: RecordingPrefs = {
  enabled: false,
  phonePosition: 'pocket',
  label: '',
};

export async function loadRecordingPrefs(): Promise<RecordingPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveRecordingPrefs(prefs: RecordingPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

export async function loadRecordings(): Promise<Recording[]> {
  try {
    const raw = await AsyncStorage.getItem(RECORDINGS_KEY);
    return raw ? (JSON.parse(raw) as Recording[]) : [];
  } catch {
    return [];
  }
}

// Insert a recording, or replace the one with the same `started` time (a walk
// is saved about once a minute while it runs, then once more at the end)
export async function saveRecording(recording: Recording): Promise<void> {
  try {
    const all = await loadRecordings();
    const index = all.findIndex((r) => r.meta.started === recording.meta.started);
    if (index >= 0) all[index] = recording;
    else all.push(recording);
    await AsyncStorage.setItem(
      RECORDINGS_KEY,
      JSON.stringify(all.slice(-MAX_RECORDINGS))
    );
  } catch {}
}

export async function clearRecordings(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECORDINGS_KEY);
  } catch {}
}

// All saved recordings as one text (CSV), ready for the share sheet
export async function recordingsAsText(): Promise<string> {
  const all = await loadRecordings();
  return all.map(toCsv).join('\n\n');
}

// A few lines per recording (no samples), small enough to paste into a chat
export async function recordingsSummaryText(): Promise<string> {
  const all = await loadRecordings();
  return all.map((r, i) => formatSummary(r, i)).join('\n\n');
}

// Share every recording as one real .csv file (attachment) through the share
// sheet. Needs the native modules expo-file-system and expo-sharing, which only
// exist in a build made after they were added, so they are loaded lazily and
// this returns false when they are missing (the caller then shares plain text).
export async function shareRecordingsAsFile(): Promise<boolean> {
  const text = await recordingsAsText();
  if (!text) return false;
  try {
    const { File, Paths } = require('expo-file-system');
    const Sharing = require('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) return false;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = new File(Paths.cache, `haptic-blast-${stamp}.csv`);
    file.create({ overwrite: true });
    file.write(text);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'Haptic Blast recordings',
    });
    return true;
  } catch {
    return false; // native modules missing, or the file could not be written
  }
}
