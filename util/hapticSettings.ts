import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_HAPTIC_SETTINGS,
  HapticSettings,
  clampSettings,
} from './haptics';

// The current haptic settings, kept in memory so every screen (the guidance on
// Home, the compass, the Settings card) sees a change at once, and saved on the
// phone so they survive a restart.
const KEY = 'haptics.settings.v2';

let current: HapticSettings = DEFAULT_HAPTIC_SETTINGS;
const listeners = new Set<() => void>();
let loaded = false;

function set(next: HapticSettings) {
  current = next;
  listeners.forEach((l) => l());
}

export function getHapticSettings(): HapticSettings {
  return current;
}

export async function loadHapticSettings(): Promise<HapticSettings> {
  try {
    let raw = await AsyncStorage.getItem(KEY);
    if (raw === null) {
      const oldPhone = await AsyncStorage.getItem('haptics.settings.v1');
      const oldBelt = await AsyncStorage.getItem('belt.settings.v1');
      const phone = oldPhone ? JSON.parse(oldPhone) : {};
      const belt = oldBelt ? JSON.parse(oldBelt) : {};
      // Preserve the selected output's zone when merging the two settings.
      const deadband = belt.enabled !== false ? (belt.silentZone ?? 10) : phone.deadband;
      raw = JSON.stringify(clampSettings({ ...phone, ...(deadband === undefined ? {} : { deadband }) }));
      await AsyncStorage.setItem(KEY, raw);
    }
    set(clampSettings(JSON.parse(raw)));
  } catch {
    set(DEFAULT_HAPTIC_SETTINGS);
  }
  loaded = true;
  return current;
}

export function updateHapticSettings(change: Partial<HapticSettings>): HapticSettings {
  const next = clampSettings({ ...current, ...change });
  set(next);
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

export function resetHapticSettings(): HapticSettings {
  return updateHapticSettings(DEFAULT_HAPTIC_SETTINGS);
}

// React hook: the settings, re-rendering when they change. Loads the saved
// values the first time it is used.
export function useHapticSettings(): HapticSettings {
  if (!loaded) {
    loaded = true; // start loading once
    loadHapticSettings();
  }
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getHapticSettings,
    getHapticSettings
  );
}
