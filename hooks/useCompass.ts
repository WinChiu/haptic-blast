import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';

// Android heading comes from DeviceMotion, which uses the fused
// TYPE_ROTATION_VECTOR sensor (accelerometer + magnetometer + gyroscope).
// expo-location's watchHeadingAsync on Android uses raw accelerometer +
// magnetometer only, which is jittery and only fires on ~2° changes.
// The fused sensor is already stable, so keep smoothing light: heavier
// smoothing makes the heading lag behind the phone while it turns.
export const ANDROID_UPDATE_INTERVAL_MS = 50;
const ANDROID_SMOOTHING_ALPHA = 0.6;
// Skip re-renders for sub-degree jitter
const ANDROID_MIN_CHANGE_DEG = 0.5;

// Shortest signed difference to - from in [-180, 180]
// (worklet: also runs on the UI thread, see HapticCompass)
export const angleDiff = (to: number, from: number) => {
  'worklet';
  let diff = to - from;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
};

// Heading (degrees clockwise from magnetic north) the phone points to, from
// W3C-style Euler angles in radians. Uses the horizontal direction of
// (top edge - screen normal): the top edge dominates when the phone is flat,
// the back camera when it is held upright, so both grips work.
// Reanimated's ROTATION sensor uses the same angles (yaw, pitch, roll).
export const headingFromRotation = (
  alpha: number,
  beta: number,
  gamma: number
) => {
  'worklet';
  const cA = Math.cos(alpha);
  const sA = Math.sin(alpha);
  const cB = Math.cos(beta);
  const sB = Math.sin(beta);
  const cG = Math.cos(gamma);
  const sG = Math.sin(gamma);

  const east = -sA * cB - cA * sG - sA * sB * cG;
  const north = cA * cB - sA * sG + cA * sB * cG;

  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
};

// Heading is always where the phone points (users turn the phone to find the
// direction), never the GPS course of movement.
export function useCompass() {
  const [magHeading, setMagHeading] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | null = null;

    // Circular low-pass filter
    const smooth = (raw: number, alpha: number, minChange = 0) =>
      setMagHeading((prev) => {
        const step = angleDiff(raw, prev) * alpha;
        if (Math.abs(step) < minChange) return prev;
        return (prev + step + 360) % 360;
      });

    (async () => {
      if (Platform.OS === 'android' && (await DeviceMotion.isAvailableAsync())) {
        DeviceMotion.setUpdateInterval(ANDROID_UPDATE_INTERVAL_MS);
        const sub = DeviceMotion.addListener(({ rotation }) => {
          if (!rotation) return;
          smooth(
            headingFromRotation(rotation.alpha, rotation.beta, rotation.gamma),
            ANDROID_SMOOTHING_ALPHA,
            ANDROID_MIN_CHANGE_DEG
          );
        });
        remove = () => sub.remove();
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        // Alpha: 0.1 = very smooth (slow), 0.5 = balanced, 1.0 = no smoothing
        const sub = await Location.watchHeadingAsync((obj) =>
          smooth(obj.magHeading, 0.1)
        );
        remove = () => sub.remove();
      }

      if (cancelled) remove();
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  return magHeading;
}
