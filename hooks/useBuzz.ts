import { useEffect, useRef } from 'react';
import { Platform, TurboModuleRegistry, Vibration } from 'react-native';
import { GlobalStore } from '../util/globals';
import { Buzzer, RealtimeLike, createBuzzer } from '../util/buzzer';

// Pulsar ships native code, so it only exists in a dev build, not in Expo Go.
// Requiring it without the native module throws, so check first.
const PULSAR_AVAILABLE = TurboModuleRegistry.get('RNPulsar') != null;
const Pulsar = PULSAR_AVAILABLE ? require('react-native-pulsar') : null;

// - pulsar: continuous vibration with live amplitude (iOS Core Haptics / Android VibrationEffect)
// - android-vibration: Expo Go on Android; continuous but fixed strength
// - none: Expo Go on iOS; buzz is impossible, callers fall back to taps
export type BuzzBackend = 'pulsar' | 'android-vibration' | 'none';

export const BUZZ_BACKEND: BuzzBackend = PULSAR_AVAILABLE
  ? 'pulsar'
  : Platform.OS === 'android'
    ? 'android-vibration'
    : 'none';

// Long enough to outlast any gap between start() refreshes.
const ANDROID_HOLD_MS = 60_000;

export function useBuzz(): Buzzer {
  // BUZZ_BACKEND is fixed for the app's lifetime, so this conditional hook
  // call always takes the same branch.
  const realtime: RealtimeLike | null = PULSAR_AVAILABLE
    ? Pulsar.useRealtimeComposer()
    : null;
  // useRealtimeComposer() returns a new object on every render. The buzzer is
  // created once and reads the latest composer through this ref, so start,
  // stop, pulse and level keep the same identity and nothing stops the buzz
  // just because the screen re-rendered.
  const realtimeRef = useRef<RealtimeLike | null>(realtime);
  realtimeRef.current = realtime;

  const buzzerRef = useRef<Buzzer | null>(null);
  if (buzzerRef.current === null) {
    buzzerRef.current = createBuzzer({
      getRealtime: () => realtimeRef.current,
      androidVibration:
        !PULSAR_AVAILABLE && BUZZ_BACKEND === 'android-vibration'
          ? Vibration
          : null,
      frequency: () => GlobalStore.BUZZ.FREQUENCY,
      androidHoldMs: ANDROID_HOLD_MS,
    });
  }
  const buzzer = buzzerRef.current;

  // Only when the screen goes away
  useEffect(() => () => buzzer.stop(), [buzzer]);

  return buzzer;
}
