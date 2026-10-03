import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReminderPreference } from './tipMode';

// Kept on the phone (not synced to Firebase): how the user wants to be
// reminded, and how many journeys they have finished.
const REMINDER_KEY = 'guidance.reminder';
const FINISHED_KEY = 'guidance.journeysFinished';

export type GuidancePrefs = {
  reminder: ReminderPreference;
  journeysFinished: number;
};

const DEFAULTS: GuidancePrefs = { reminder: 'adaptive', journeysFinished: 0 };

export async function loadGuidancePrefs(): Promise<GuidancePrefs> {
  try {
    const [reminder, finished] = await Promise.all([
      AsyncStorage.getItem(REMINDER_KEY),
      AsyncStorage.getItem(FINISHED_KEY),
    ]);
    return {
      reminder:
        reminder === 'always' || reminder === 'off' || reminder === 'adaptive'
          ? reminder
          : DEFAULTS.reminder,
      journeysFinished: Number.parseInt(finished ?? '', 10) || 0,
    };
  } catch {
    return DEFAULTS; // storage unavailable: behave like a first-time user
  }
}

export async function saveReminderPreference(
  reminder: ReminderPreference
): Promise<void> {
  try {
    await AsyncStorage.setItem(REMINDER_KEY, reminder);
  } catch {}
}

export async function recordJourneyFinished(): Promise<void> {
  try {
    const { journeysFinished } = await loadGuidancePrefs();
    await AsyncStorage.setItem(FINISHED_KEY, String(journeysFinished + 1));
  } catch {}
}
