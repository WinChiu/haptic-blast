// How the phone vibrates to say "turn": the shape of the signal, as pure
// functions so it can be tested on a computer. Follows the team's Vibration
// Design Guide: intensity grows exponentially with the angle error, the buzz is
// pulsed with a pause that shrinks as the error grows, a very short "click"
// confirms entering the dead zone, and nothing vibrates while on course.

// pulsed: pauses shrink as the error grows. steady: every pulse and every pause
// is the same length, only the strength changes. continuous: one buzz.
export type HapticMode = 'pulsed' | 'steady' | 'continuous';

export type HapticSettings = {
  mode: HapticMode;
  deadband: number; // degrees either side of the target where the phone stays silent
  pulseMs: number; // length of one vibration
  confirmMs: number; // length of the "you are lined up" click
  minStrength: number; // weakest buzz, just outside the silent zone, in percent
};

// The ranges the guide recommends; the app keeps every setting inside them
export const HAPTIC_LIMITS = {
  deadband: { min: 5, max: 15 },
  pulseMs: { min: 500, max: 1000 },
  confirmMs: { min: 50, max: 100 },
  // 20% was too faint to feel on the first tests; the guide's 20% is the lowest allowed
  // 100 makes every buzz full strength, so strength no longer says how far off you are
  minStrength: { min: 20, max: 100 },
} as const;

export const DEFAULT_HAPTIC_SETTINGS: HapticSettings = {
  mode: 'pulsed',
  deadband: 15,
  pulseMs: 750,
  confirmMs: 50,
  minStrength: 50,
};

// Fixed parts of the shape (not adjustable in the app)
export const HAPTIC_SHAPE = {
  minIntensity: 0.2, // at the edge of the dead zone (Pulsar amplitude 0..1)
  maxIntensity: 1, // at maxDeviation or beyond
  maxDeviation: 90, // degrees of error at which the signal is strongest and fastest
  pauseNearMs: 600, // silence between pulses just outside the dead zone
  pauseFarMs: 200, // silence between pulses at maximum deviation
  pauseSteadyMs: 400, // silence between pulses in steady mode, whatever the error
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
    mode: raw?.mode === 'continuous' || raw?.mode === 'steady' ? raw.mode : 'pulsed',
    deadband: Math.round(clamp(num(raw?.deadband, d.deadband), HAPTIC_LIMITS.deadband.min, HAPTIC_LIMITS.deadband.max)),
    pulseMs: Math.round(clamp(num(raw?.pulseMs, d.pulseMs), HAPTIC_LIMITS.pulseMs.min, HAPTIC_LIMITS.pulseMs.max)),
    confirmMs: Math.round(clamp(num(raw?.confirmMs, d.confirmMs), HAPTIC_LIMITS.confirmMs.min, HAPTIC_LIMITS.confirmMs.max)),
    minStrength: Math.round(clamp(num(raw?.minStrength, d.minStrength), HAPTIC_LIMITS.minStrength.min, HAPTIC_LIMITS.minStrength.max)),
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

// The fixed shape with the chosen weakest strength
export function shapeFor(settings: Pick<HapticSettings, 'minStrength'>) {
  return { ...HAPTIC_SHAPE, minIntensity: settings.minStrength / 100 };
}

export type PulsePlan = { amplitude: number; pulseMs: number; pauseMs: number };

// What to do for this angle error: null while on course (silent), otherwise
// one pulse and the pause that follows it.
export function planPulse(errorDeg: number, settings: HapticSettings): PulsePlan | null {
  const error = Math.abs(errorDeg);
  if (error <= settings.deadband) return null;
  return {
    amplitude: exponentialIntensity(error, settings.deadband, shapeFor(settings)),
    pulseMs: settings.pulseMs,
    pauseMs:
      settings.mode === 'steady'
        ? HAPTIC_SHAPE.pauseSteadyMs
        : pauseForDeviation(error, settings.deadband),
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

// The rhythm of the pulses over time, as one step per 50 ms check. The rhythm
// belongs to the walker, not to the angle: crossing the edge of the silent zone
// back and forth must not restart it, so nextPulseAt is never reset by going
// in and out of the zone. A pulse that is running when you line up is cut
// short (silence on course), but the next one still waits for its slot.
export type PulseClock = {
  nextPulseAt: number; // when the next pulse may start
  wasOutside: boolean;
  lastConfirmAt: number;
  pulseEndsAt: number; // when the pulse now running ends (steady mode follows the angle until then)
  level: number; // smoothed strength of the pulse now running
  levelSent: number; // the strength last handed to the motor
};
export const NEW_PULSE_CLOCK: PulseClock = {
  nextPulseAt: 0,
  wasOutside: false,
  lastConfirmAt: -Infinity,
  pulseEndsAt: 0,
  level: 0,
  levelSent: 0,
};
// Steady mode: while a pulse runs its strength follows the angle, smoothed so a
// jumpy compass does not make it flutter, and only re-sent when it changed enough.
export const LEVEL_SMOOTHING = 0.3;
export const LEVEL_MIN_CHANGE = 0.03;
export type PulseAction =
  | { kind: 'pulse'; amplitude: number; durationMs: number }
  | { kind: 'level'; amplitude: number }
  | { kind: 'confirm'; durationMs: number }
  | { kind: 'stop' }
  | { kind: 'none' };

export function stepPulse(
  clock: PulseClock,
  errorDeg: number,
  nowMs: number,
  settings: HapticSettings
): { clock: PulseClock; action: PulseAction } {
  const plan = planPulse(errorDeg, settings);
  if (plan) {
    if (nowMs >= clock.nextPulseAt) {
      return {
        clock: {
          ...clock,
          wasOutside: true,
          nextPulseAt: nowMs + plan.pulseMs + plan.pauseMs,
          pulseEndsAt: nowMs + plan.pulseMs,
          level: plan.amplitude,
          levelSent: plan.amplitude,
        },
        action: { kind: 'pulse', amplitude: plan.amplitude, durationMs: plan.pulseMs },
      };
    }
    // steady mode: the running pulse follows the angle (same length, same gaps)
    if (settings.mode === 'steady' && nowMs < clock.pulseEndsAt) {
      const level = clock.level + LEVEL_SMOOTHING * (plan.amplitude - clock.level);
      if (Math.abs(level - clock.levelSent) >= LEVEL_MIN_CHANGE) {
        return {
          clock: { ...clock, wasOutside: true, level, levelSent: level },
          action: { kind: 'level', amplitude: level },
        };
      }
      return { clock: { ...clock, wasOutside: true, level }, action: { kind: 'none' } };
    }
    return { clock: { ...clock, wasOutside: true }, action: { kind: 'none' } };
  }
  // on course
  if (shouldConfirm(clock.wasOutside, errorDeg, settings.deadband, nowMs - clock.lastConfirmAt)) {
    return {
      clock: { ...clock, wasOutside: false, lastConfirmAt: nowMs },
      action: { kind: 'confirm', durationMs: settings.confirmMs },
    };
  }
  return {
    clock: { ...clock, wasOutside: false },
    action: clock.wasOutside ? { kind: 'stop' } : { kind: 'none' },
  };
}

// Which style to write into a round's record: 'tap' when the phone cannot
// vibrate continuously (Expo Go on iOS), otherwise the chosen mode.
export function hapticStyleOf(
  backendCanBuzz: boolean,
  mode: HapticMode
): 'tap' | 'pulse' | 'steady-pulse' | 'continuous' {
  if (!backendCanBuzz) return 'tap';
  if (mode === 'steady') return 'steady-pulse';
  return mode === 'pulsed' ? 'pulse' : 'continuous';
}
