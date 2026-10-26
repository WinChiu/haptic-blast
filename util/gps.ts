import { GlobalStore } from './globals';

// Is a GPS fix with this accuracy (metres, smaller is better) good enough?
// An unknown accuracy (null) is accepted, since mock locations have none.
export function accuracyOk(
  accuracy: number | null | undefined,
  max: number
): boolean {
  return accuracy === null || accuracy === undefined || accuracy <= max;
}

// A journey is only planned or started from a fix at least this good: the
// route begins at the GPS position, so a wandering fix gives a wrong start.
// The user can allow up to 50 m (for a wet day or a poor sky view); the default
// stays at GlobalStore.GPS.maxStartAccuracy.
export const GPS_START_LIMITS = { min: 5, max: 50, step: 5 };

// Fixes worse than this are ignored for route progress: standing still with a
// poor fix, the position wanders by tens of metres and moves the route on.
// It is 20 m, or the allowed start error if the user raised that above 20 m:
// a start that is allowed at 40 m must not then freeze because every later fix
// is also worse than 20 m.
export const usableAccuracyFor = (startAccuracy: unknown) =>
  Math.max(GlobalStore.GPS.maxUsableAccuracy, clampStartAccuracy(startAccuracy));

export const isFixUsable = (
  accuracy: number | null | undefined,
  startAccuracy: unknown = GlobalStore.GPS.maxStartAccuracy
) => accuracyOk(accuracy, usableAccuracyFor(startAccuracy));

export function clampStartAccuracy(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return GlobalStore.GPS.maxStartAccuracy;
  return Math.max(GPS_START_LIMITS.min, Math.min(GPS_START_LIMITS.max,
    Math.round(value / GPS_START_LIMITS.step) * GPS_START_LIMITS.step));
}

export const isFixGoodToStart = (
  accuracy: number | null | undefined,
  max = GlobalStore.GPS.maxStartAccuracy
) => accuracyOk(accuracy, clampStartAccuracy(max));

// iOS gives a magnetic-north heading and, when it can, a true-north one (-1
// when unavailable). Routes and bearings use true north, so prefer it: in
// Stockholm the magnetic heading was about 7 to 9 degrees off.
export function pickHeading(
  trueHeading: number | null | undefined,
  magHeading: number
): number {
  return trueHeading !== null && trueHeading !== undefined && trueHeading >= 0
    ? trueHeading
    : magHeading;
}
