import { requireOptionalNativeModule } from 'expo';

type EventSubscription = { remove(): void };

export type AttitudeEvent = {
  // Attitude quaternion, device frame -> east-north-up world frame (same
  // convention as the Android FusedOrientation module)
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  // false when iOS could only reference magnetic north
  trueNorth: boolean;
};

type DeviceAttitudeModule = {
  isAvailable(): boolean;
  addListener(
    eventName: 'onAttitude',
    listener: (event: AttitudeEvent) => void
  ): EventSubscription;
};

// Null in Expo Go, on Android, or in builds made before this module existed
const NativeModule =
  requireOptionalNativeModule<DeviceAttitudeModule>('DeviceAttitude');

// Requires an iOS dev or release build that includes this module
export const isDeviceAttitudeAvailable = (() => {
  try {
    return NativeModule?.isAvailable() ?? false;
  } catch {
    return false;
  }
})();

export function addAttitudeListener(
  listener: (event: AttitudeEvent) => void
): EventSubscription | null {
  if (!isDeviceAttitudeAvailable || !NativeModule) return null;
  return NativeModule.addListener('onAttitude', listener);
}
