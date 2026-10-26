import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { clampStartAccuracy } from './gps';
import { GlobalStore } from './globals';

const KEY = 'gps.startAccuracy.v1';
let current = GlobalStore.GPS.maxStartAccuracy;
let loaded = false;
let revision = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export function updateStartAccuracy(value: number): void {
  revision++;
  current = clampStartAccuracy(value);
  notify();
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
}

export function useStartAccuracy(): number {
  if (!loaded) {
    loaded = true;
    const initialRevision = revision;
    AsyncStorage.getItem(KEY).then(raw => {
      if (revision !== initialRevision) return;
      current = clampStartAccuracy(raw === null ? undefined : JSON.parse(raw));
      notify();
    }).catch(() => {});
  }
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => current, () => current);
}
