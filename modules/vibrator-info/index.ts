import { requireOptionalNativeModule } from 'expo';

export type VibratorCapabilities = {
  apiLevel: number;
  hasVibrator: boolean;
  // Can vibrate at a chosen strength (VibrationEffect amplitude 1..255)
  hasAmplitudeControl: boolean;
  // Composition primitives, which Pulsar needs to vary strength smoothly
  clickPrimitive: boolean;
  tickPrimitive: boolean;
};

type VibratorInfoModule = {
  getCapabilities(): VibratorCapabilities | null;
};

// Null in Expo Go, on iOS, or in builds without the native module
const NativeModule =
  requireOptionalNativeModule<VibratorInfoModule>('VibratorInfo');

export function getVibratorCapabilities(): VibratorCapabilities | null {
  try {
    return NativeModule?.getCapabilities() ?? null;
  } catch {
    return null;
  }
}
