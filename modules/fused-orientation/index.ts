import { requireOptionalNativeModule } from 'expo';

type EventSubscription = { remove(): void };

export type OrientationEvent = {
  // Attitude quaternion, device frame -> east-north-up world frame
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  // Direction the top of the device points, clockwise from true north
  // (magnetic north when the declination is unknown)
  headingDegrees: number;
  headingErrorDegrees: number;
};

type FusedOrientationModule = {
  isAvailable(): boolean;
  addListener(
    eventName: 'onOrientation',
    listener: (event: OrientationEvent) => void
  ): EventSubscription;
};

// Null in Expo Go, on iOS, or in builds without the native module
const NativeModule =
  requireOptionalNativeModule<FusedOrientationModule>('FusedOrientation');

// Requires a dev build on Android with Google Play services
export const isFusedOrientationAvailable = (() => {
  try {
    return NativeModule?.isAvailable() ?? false;
  } catch {
    return false;
  }
})();

export function addOrientationListener(
  listener: (event: OrientationEvent) => void
): EventSubscription | null {
  if (!isFusedOrientationAvailable || !NativeModule) return null;
  return NativeModule.addListener('onOrientation', listener);
}
