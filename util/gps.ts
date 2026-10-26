import { GlobalStore } from './globals';

// Is a GPS fix with this accuracy (metres, smaller is better) good enough?
// An unknown accuracy (null) is accepted, since mock locations have none.
export function accuracyOk(
  accuracy: number | null | undefined,
  max: number
): boolean {
  return accuracy === null || accuracy === undefined || accuracy <= max;
}

// Fixes worse than this are ignored for route progress: standing still with a
// poor fix, the position wanders by tens of metres and moves the route on.
export const isFixUsable = (accuracy: number | null | undefined) =>
  accuracyOk(accuracy, GlobalStore.GPS.maxUsableAccuracy);

// A journey is only planned or started from a fix at least this good: the
// route begins at the GPS position, so a wandering fix gives a wrong start.
export const GPS_START_LIMITS = { min: 5, max: GlobalStore.GPS.maxUsableAccuracy, step: 5 };

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
