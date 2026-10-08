import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';
import { pickHeading } from '../util/gps';
import {
  addOrientationListener,
  isFusedOrientationAvailable,
} from '../modules/fused-orientation';
import {
  addAttitudeListener,
  isDeviceAttitudeAvailable,
} from '../modules/device-attitude';
import { Calibration, calibratedHeading } from '../util/calibration';
import { GlobalStore } from '../util/globals';

// Where the heading comes from:
// - fused-orientation: Android dev build with Google Play services. Google's
//   Fused Orientation Provider (what Google Maps uses), referenced to true north.
// - rotation-vector: Android without it (e.g. Expo Go). DeviceMotion's fused
//   TYPE_ROTATION_VECTOR sensor, referenced to magnetic north.
// - system: iOS. CoreLocation's heading, already fused by the system.
export type HeadingSource = 'fused-orientation' | 'rotation-vector' | 'system';

export const HEADING_SOURCE: HeadingSource =
  Platform.OS !== 'android'
    ? 'system'
    : isFusedOrientationAvailable
      ? 'fused-orientation'
      : 'rotation-vector';

// Android heading updates pushed to React state. Kept moderate because each
// update re-renders HomeScreen (map included).
export const ANDROID_UPDATE_INTERVAL_MS = 50;
// The fused sensors are already stable, so keep smoothing light: heavier
// smoothing makes the heading lag behind the phone while it turns.
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

// World-frame (east, north, up) directions of the phone's top edge and of its
// screen normal (out of the screen).
export type DeviceAxes = {
  topE: number;
  topN: number;
  topU: number;
  normalE: number;
  normalN: number;
  normalU: number;
};

// From W3C-style Euler angles in radians (DeviceMotion alpha/beta/gamma;
// Reanimated's ROTATION sensor uses the same angles as yaw/pitch/roll).
export const axesFromEuler = (
  alpha: number,
  beta: number,
  gamma: number
): DeviceAxes => {
  'worklet';
  const cA = Math.cos(alpha);
  const sA = Math.sin(alpha);
  const cB = Math.cos(beta);
  const sB = Math.sin(beta);
  const cG = Math.cos(gamma);
  const sG = Math.sin(gamma);
  return {
    topE: -sA * cB,
    topN: cA * cB,
    topU: sB,
    normalE: cA * sG + sA * sB * cG,
    normalN: sA * sG - cA * sB * cG,
    normalU: cB * cG,
  };
};

// From an attitude quaternion rotating the device frame into east-north-up
// (Fused Orientation Provider's getAttitude, scalar last).
export const axesFromQuaternion = (
  qx: number,
  qy: number,
  qz: number,
  qw: number
): DeviceAxes => {
  'worklet';
  return {
    topE: 2 * (qx * qy - qz * qw),
    topN: 1 - 2 * (qx * qx + qz * qz),
    topU: 2 * (qy * qz + qx * qw),
    normalE: 2 * (qx * qz + qy * qw),
    normalN: 2 * (qy * qz - qx * qw),
    normalU: 1 - 2 * (qx * qx + qy * qy),
  };
};

// Tilt of the screen away from facing up (0 = flat, 90 = upright) at which
// the heading switches between flat and upright mode. The gap between them
// (hysteresis) stops it flipping back and forth around a single threshold.
const UPRIGHT_ENTER_DEG = 60;
const UPRIGHT_EXIT_DEG = 40;

// Whether the phone is in upright mode, given the previous mode.
export const nextIsUpright = (axes: DeviceAxes, wasUpright: boolean) => {
  'worklet';
  const cosTilt = Math.max(-1, Math.min(1, axes.normalU));
  const tiltDeg = (Math.acos(cosTilt) * 180) / Math.PI;
  return wasUpright ? tiltDeg > UPRIGHT_EXIT_DEG : tiltDeg > UPRIGHT_ENTER_DEG;
};

// Heading (degrees clockwise from north) the phone points to. Same idea as
// Android's remapCoordinateSystem for camera views:
// - flat: direction of the top edge, which ignores sideways roll
// - upright: direction of the back camera, which stays defined when the top
//   edge points at the sky (the top edge alone flips 180° there)
export const headingFromAxes = (axes: DeviceAxes, upright: boolean) => {
  'worklet';
  const east = upright ? -axes.normalE : axes.topE;
  const north = upright ? -axes.normalN : axes.topN;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
};

// Where device axes come from on this platform, for pocket calibration. Null
// when there is none (iOS in Expo Go, or an iOS build made before the
// DeviceAttitude module existed).
export const AXES_SOURCE:
  | 'fused-orientation'
  | 'rotation-vector'
  | 'core-motion'
  | null =
  Platform.OS === 'android'
    ? isFusedOrientationAvailable
      ? 'fused-orientation'
      : 'rotation-vector'
    : isDeviceAttitudeAvailable
      ? 'core-motion'
      : null;

// Streams device axes from AXES_SOURCE (about 50 per second). Returns the
// function that stops it.
export function addAxesListener(
  listener: (axes: DeviceAxes) => void
): () => void {
  if (AXES_SOURCE === 'fused-orientation') {
    const sub = addOrientationListener(({ qx, qy, qz, qw }) =>
      listener(axesFromQuaternion(qx, qy, qz, qw))
    );
    return () => sub?.remove();
  }
  if (AXES_SOURCE === 'core-motion') {
    const sub = addAttitudeListener(({ qx, qy, qz, qw }) =>
      listener(axesFromQuaternion(qx, qy, qz, qw))
    );
    return () => sub?.remove();
  }
  if (AXES_SOURCE === 'rotation-vector') {
    DeviceMotion.setUpdateInterval(ANDROID_UPDATE_INTERVAL_MS);
    const sub = DeviceMotion.addListener(({ rotation }) => {
      if (rotation) {
        listener(axesFromEuler(rotation.alpha, rotation.beta, rotation.gamma));
      }
    });
    return () => sub.remove();
  }
  return () => {};
}

// Heading is always where the phone points (users turn the phone to find the
// direction), never the GPS course of movement. With a pocket calibration it
// is where the body faces: the locked axis plus the calibrated offset.
export function useCompass(calibration: Calibration | null = null) {
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | null = null;

    // Circular low-pass filter
    const smooth = (raw: number, alpha: number, minChange = 0) =>
      setHeading((prev) => {
        const step = angleDiff(raw, prev) * alpha;
        if (Math.abs(step) < minChange) return prev;
        return (prev + step + 360) % 360;
      });

    if (calibration) {
      let lastUpdate = 0;
      return addAxesListener((axes) => {
        const now = Date.now();
        if (now - lastUpdate < ANDROID_UPDATE_INTERVAL_MS) return;
        lastUpdate = now;
        // Null while the phone has turned in the pocket: keep the last heading
        const body = calibratedHeading(axes, calibration);
        if (body === null) return;
        smooth(
          body,
          GlobalStore.CALIBRATION.smoothingAlpha,
          ANDROID_MIN_CHANGE_DEG
        );
      });
    }

    let upright = false;
    const onAxes = (axes: DeviceAxes) => {
      upright = nextIsUpright(axes, upright);
      smooth(
        headingFromAxes(axes, upright),
        ANDROID_SMOOTHING_ALPHA,
        ANDROID_MIN_CHANGE_DEG
      );
    };

    (async () => {
      if (HEADING_SOURCE === 'fused-orientation') {
        // Fused Orientation Provider emits at ~50Hz; throttle state updates
        let lastUpdate = 0;
        const sub = addOrientationListener(({ qx, qy, qz, qw }) => {
          const now = Date.now();
          if (now - lastUpdate < ANDROID_UPDATE_INTERVAL_MS) return;
          lastUpdate = now;
          onAxes(axesFromQuaternion(qx, qy, qz, qw));
        });
        remove = () => sub?.remove();
      } else if (
        HEADING_SOURCE === 'rotation-vector' &&
        (await DeviceMotion.isAvailableAsync())
      ) {
        DeviceMotion.setUpdateInterval(ANDROID_UPDATE_INTERVAL_MS);
        const sub = DeviceMotion.addListener(({ rotation }) => {
          if (!rotation) return;
          onAxes(axesFromEuler(rotation.alpha, rotation.beta, rotation.gamma));
        });
        remove = () => sub.remove();
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        // Alpha: 0.1 = very smooth (slow), 0.5 = balanced, 1.0 = no smoothing
        // True north when iOS can provide it (routes use true north); magnetic
        // north reads about 7 to 9 degrees low in Stockholm
        const sub = await Location.watchHeadingAsync((obj) =>
          smooth(pickHeading(obj.trueHeading, obj.magHeading), 0.1)
        );
        remove = () => sub.remove();
      }

      if (cancelled) remove();
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [calibration]);

  return heading;
}
