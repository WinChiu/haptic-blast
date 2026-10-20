import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_BELT_SETTINGS,
  BeltSettings,
  clampBeltSettings,
} from './belt';

// The current haptic settings, kept in memory so every screen (the guidance on
// Home, the compass, the Settings card) sees a change at once, and saved on the
// phone so they survive a restart.
const KEY = 'belt.settings.v1';

let current: BeltSettings = DEFAULT_BELT_SETTINGS;
const listeners = new Set<() => void>();
let loaded = false;

function set(next: BeltSettings) {
  current = next;
  listeners.forEach((l) => l());
}

export function getBeltSettings(): BeltSettings {
  return current;
}

export async function loadBeltSettings(): Promise<BeltSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    set(clampBeltSettings(raw ? JSON.parse(raw) : null));
  } catch {
    set(DEFAULT_BELT_SETTINGS);
  }
  loaded = true;
  return current;
}

export function updateBeltSettings(change: Partial<BeltSettings>): BeltSettings {
  const next = clampBeltSettings({ ...current, ...change });
  set(next);
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

export function resetBeltSettings(): BeltSettings {
  return updateBeltSettings(DEFAULT_BELT_SETTINGS);
}

// React hook: the settings, re-rendering when they change. Loads the saved
// values the first time it is used.
export function useBeltSettings(): BeltSettings {
  if (!loaded) {
    loaded = true; // start loading once
    loadBeltSettings();
  }
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getBeltSettings,
    getBeltSettings
  );
}
