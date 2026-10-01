import { useCallback, useEffect, useRef } from 'react';
import { Platform, TurboModuleRegistry, Vibration } from 'react-native';
import { GlobalStore } from '../util/globals';

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

const toAmplitude = (strength: number) => {
  const { MIN_AMPLITUDE, MAX_AMPLITUDE } = GlobalStore.BUZZ;
  const s = Math.max(0, Math.min(1, strength));
  return MIN_AMPLITUDE + s * (MAX_AMPLITUDE - MIN_AMPLITUDE);
};

export function useBuzz() {
  // BUZZ_BACKEND is fixed for the app's lifetime, so this conditional hook
  // call always takes the same branch.
  const realtime = PULSAR_AVAILABLE ? Pulsar.useRealtimeComposer() : null;
  const isBuzzingRef = useRef(false);

  // Start buzzing, or update the strength of an ongoing buzz.
  const start = useCallback(
    (strength: number) => {
      if (realtime) {
        realtime.set(toAmplitude(strength), GlobalStore.BUZZ.FREQUENCY);
      } else if (BUZZ_BACKEND === 'android-vibration' && !isBuzzingRef.current) {
        Vibration.vibrate(ANDROID_HOLD_MS);
      }
      isBuzzingRef.current = true;
    },
    [realtime]
  );

  const stop = useCallback(() => {
    if (!isBuzzingRef.current) return;
    if (realtime) {
      realtime.stop();
    } else if (BUZZ_BACKEND === 'android-vibration') {
      Vibration.cancel();
    }
    isBuzzingRef.current = false;
  }, [realtime]);

  useEffect(() => stop, [stop]);

  return { start, stop };
}
