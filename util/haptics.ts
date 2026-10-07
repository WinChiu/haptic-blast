// How the phone vibrates to say "turn": the shape of the signal, as pure
// functions so it can be tested on a computer. Follows the team's Vibration
// Design Guide: intensity grows exponentially with the angle error, the buzz is
// pulsed with a pause that shrinks as the error grows, a very short "click"
// confirms entering the dead zone, and nothing vibrates while on course.

export type HapticMode = 'pulsed' | 'continuous';

export type HapticSettings = {
  mode: HapticMode;
  deadband: number; // degrees either side of the target where the phone stays silent
  pulseMs: number; // length of one vibration
  confirmMs: number; // length of the "you are lined up" click
};

// The ranges the guide recommends; the app keeps every setting inside them
export const HAPTIC_LIMITS = {
  deadband: { min: 5, max: 15 },
  pulseMs: { min: 500, max: 1000 },
  confirmMs: { min: 50, max: 100 },
} as const;

export const DEFAULT_HAPTIC_SETTINGS: HapticSettings = {
  mode: 'pulsed',
  deadband: 15,
  pulseMs: 750,
  confirmMs: 50,
};

// Fixed parts of the shape (not adjustable in the app)
export const HAPTIC_SHAPE = {
  minIntensity: 0.2, // at the edge of the dead zone (Pulsar amplitude 0..1)
  maxIntensity: 1, // at maxDeviation or beyond
  maxDeviation: 90, // degrees of error at which the signal is strongest and fastest
  pauseNearMs: 600, // silence between pulses just outside the dead zone
  pauseFarMs: 200, // silence between pulses at maximum deviation
  confirmIntensity: 0.35, // the click is light
  confirmMinGapMs: 1500, // at most one click this often, so edge noise cannot machine-gun it
} as const;

// The silent zone the guidance really uses. A GPS error of e metres seen from an
// aim point d metres away tilts the bearing by about atan(e / d), so the zone
// is never narrower than that or the phone would buzz at errors that are only
// GPS noise. Snapped to the path, sideways drift is already removed, so only
// part of the error counts. Never narrower than the chosen zone, never wider
// than maxZone.
export function effectiveDeadband(
  base: number,
  accuracyM: number | null,
  snapped: boolean,
  aimDistanceM: number,
  maxZone = 25,
  snapNoiseFactor = 0.5
): number {
  if (accuracyM === null || !Number.isFinite(accuracyM) || accuracyM <= 0) return base;
  if (!Number.isFinite(aimDistanceM) || aimDistanceM <= 0) return base;
  const noise = accuracyM * (snapped ? snapNoiseFactor : 1);
  const tilt = (Math.atan(noise / aimDistanceM) * 180) / Math.PI;
  return Math.max(base, Math.min(maxZone, Math.round(tilt)));
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// Any (possibly missing or corrupt) saved settings in, valid settings out
export function clampSettings(raw: Partial<HapticSettings> | null | undefined): HapticSettings {
  const d = DEFAULT_HAPTIC_SETTINGS;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return {
    mode: raw?.mode === 'continuous' ? 'continuous' : 'pulsed',
    deadband: Math.round(clamp(num(raw?.deadband, d.deadband), HAPTIC_LIMITS.deadband.min, HAPTIC_LIMITS.deadband.max)),
    pulseMs: Math.round(clamp(num(raw?.pulseMs, d.pulseMs), HAPTIC_LIMITS.pulseMs.min, HAPTIC_LIMITS.pulseMs.max)),
    confirmMs: Math.round(clamp(num(raw?.confirmMs, d.confirmMs), HAPTIC_LIMITS.confirmMs.min, HAPTIC_LIMITS.confirmMs.max)),
  };
}

// Intensity = S0 * e^(b * y), where y is the error beyond the dead zone, S0 is
// the weakest intensity (at the dead zone's edge, not at 0 degrees) and b is
// chosen so the intensity reaches the strongest value at maxDeviation. Equal
// steps in error then feel like equal steps in strength (Weber-Fechner).
// Inside the dead zone there is no vibration (0).
export function exponentialIntensity(
  errorDeg: number,
  deadband: number,
  shape: { minIntensity: number; maxIntensity: number; maxDeviation: number } = HAPTIC_SHAPE
): number {
  const error = Math.abs(errorDeg);
  if (error <= deadband) return 0;
  const span = shape.maxDeviation - deadband;
  if (span <= 0) return shape.maxIntensity;
  const b = Math.log(shape.maxIntensity / shape.minIntensity) / span;
  const intensity = shape.minIntensity * Math.exp(b * (Math.min(error, shape.maxDeviation) - deadband));
  return Math.min(shape.maxIntensity, intensity);
}

// Silence after a pulse: long (600 ms) just outside the dead zone, shrinking to
// 200 ms at maximum deviation, so the further off, the more urgent the rhythm.
export function pauseForDeviation(
  errorDeg: number,
  deadband: number,
  shape: { pauseNearMs: number; pauseFarMs: number; maxDeviation: number } = HAPTIC_SHAPE
): number {
  const span = shape.maxDeviation - deadband;
  if (span <= 0) return shape.pauseFarMs;
  const t = clamp((Math.abs(errorDeg) - deadband) / span, 0, 1);
  return Math.round(shape.pauseNearMs + t * (shape.pauseFarMs - shape.pauseNearMs));
}

export type PulsePlan = { amplitude: number; pulseMs: number; pauseMs: number };

// What to do for this angle error: null while on course (silent), otherwise
// one pulse and the pause that follows it.
export function planPulse(errorDeg: number, settings: HapticSettings): PulsePlan | null {
  const error = Math.abs(errorDeg);
  if (error <= settings.deadband) return null;
  return {
    amplitude: exponentialIntensity(error, settings.deadband),
    pulseMs: settings.pulseMs,
    pauseMs: pauseForDeviation(error, settings.deadband),
  };
}

// The "click" when the phone first lines up with the target: true on the step
// that goes from outside the dead zone to inside it, and not more often than
// confirmMinGapMs.
export function shouldConfirm(
  wasOutside: boolean,
  errorDeg: number,
  deadband: number,
  msSinceLastConfirm: number
): boolean {
  return (
    wasOutside &&
    Math.abs(errorDeg) <= deadband &&
    msSinceLastConfirm >= HAPTIC_SHAPE.confirmMinGapMs
  );
}

// Which style to write into a round's record: 'tap' when the phone cannot
// vibrate continuously (Expo Go on iOS), otherwise the chosen mode.
export function hapticStyleOf(
  backendCanBuzz: boolean,
  mode: HapticMode
): 'tap' | 'pulse' | 'continuous' {
  if (!backendCanBuzz) return 'tap';
  return mode === 'pulsed' ? 'pulse' : 'continuous';
}
