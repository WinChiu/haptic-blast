import { Coord, bearingDegrees, distanceMeters } from './geo';

// The haptic belt: which of three motors (left, front, right) should vibrate,
// and how strongly, to tell the wearer which way to go. Pure functions, so the
// rules can be tested on a computer.
//
// The belt points at the direction of the NEXT STRETCH of the route after the
// junction when within the preview distance; otherwise it points at the
// current checkpoint. Leaving the distance restores the approach direction.

export type BeltMix = { left: number; main: number; right: number }; // each 0..1

export const SILENT_MIX: BeltMix = { left: 0, main: 0, right: 0 };

// Angle from where the wearer faces to the target, in degrees: positive means
// the target is to the right, negative to the left. In [-180, 180).
export function relativeBearing(targetDeg: number, facingDeg: number): number {
  return ((((targetDeg - facingDeg) % 360) + 540) % 360) - 180;
}

// Actual motor amplitude fractions. The side reaches weakest at the zone edge;
// the front stays strongest up to 45 degrees, then fades towards 90 degrees.
export function beltMix(relDeg: number, zoneDeg: number, strengths = { minStrength: 32, maxStrength: 100 }): BeltMix {
  const a = Math.abs(relDeg);
  if (a <= zoneDeg) return SILENT_MIX;
  const low = strengths.minStrength / 100;
  const high = strengths.maxStrength / 100;
  const side = low + (high - low) * Math.min(1, (a - zoneDeg) / (45 - zoneDeg));
  const main = a <= 45 ? high : a >= 90 ? 0 : low + (high - low) * (90 - a) / 45;
  return relDeg < 0 ? { left: side, main, right: 0 } : { left: 0, main, right: side };
}

// When the belt starts telling the wearer about the next junction.
// 'fixed': a set distance before the junction.
// 'speed': a set number of seconds before it at the current speed, never
//          closer than minM or further than maxM.
export type BeltTrigger = 'fixed' | 'speed';

export type BeltTiming = {
  trigger: BeltTrigger;
  lookAheadM: number; // 'fixed' distance
  secondsAhead: number; // 'speed' warning time
  minM: number;
  maxM: number;
};

export const DEFAULT_BELT_TIMING: BeltTiming = {
  trigger: 'fixed',
  lookAheadM: 30,
  secondsAhead: 8,
  minM: 15,
  maxM: 60,
};

export function triggerDistance(
  timing: BeltTiming,
  speedMps: number | null
): number {
  if (timing.trigger === 'fixed') return timing.lookAheadM;
  const v = speedMps !== null && Number.isFinite(speedMps) && speedMps > 0 ? speedMps : 0;
  return Math.min(timing.maxM, Math.max(timing.minM, v * timing.secondsAhead));
}

// The junction being approached: the checkpoint the wearer is heading for, and
// the direction of the route leaving it (null at the last checkpoint).
export type Junction = {
  index: number;
  distanceM: number;
  legBearing: number | null;
  approachBearing: number;
};

// Current preview state; recalculated from distance on every update.
export type JunctionLatch = { index: number | null; started: boolean; turnSide?: 'left' | 'right' };
export const NEW_JUNCTION_LATCH: JunctionLatch = { index: null, started: false };

export type BeltGuidance = {
  mix: BeltMix;
  active: boolean; // navigation has a target
  relative: number | null; // degrees to the current guidance target
  targetBearing: number | null;
  latch: JunctionLatch;
};

export function beltGuidance(input: {
  facing: number; // the wearer's heading in degrees
  junction: Junction | null;
  speedMps: number | null;
  zoneDeg: number;
  latch: JunctionLatch;
  timing?: BeltTiming;
  strengths?: Pick<BeltSettings, 'minStrength' | 'maxStrength'>;
}): BeltGuidance {
  const { facing, junction, speedMps, zoneDeg } = input;
  const timing = input.timing ?? DEFAULT_BELT_TIMING;

  if (!junction) {
    return { mix: SILENT_MIX, active: false, relative: null, targetBearing: null, latch: NEW_JUNCTION_LATCH };
  }
  const preview = junction.legBearing !== null && junction.distanceM <= triggerDistance(timing, speedMps);
  const target = preview ? junction.legBearing! : junction.approachBearing;
  const relative = relativeBearing(target, facing);
  // Keep the last turn direction within five degrees of directly behind.
  // A different checkpoint or preview target starts a fresh decision.
  const previousSide = input.latch.index === junction.index && input.latch.started === preview
    ? input.latch.turnSide : undefined;
  const turnSide = Math.abs(relative) >= 175 && previousSide
    ? previousSide : relative < 0 ? 'left' : 'right';
  const motorAngle = Math.abs(relative) >= 175
    ? (turnSide === 'left' ? -1 : 1) * Math.abs(relative) : relative;
  return {
    mix: beltMix(motorAngle, zoneDeg, input.strengths), active: true, relative, targetBearing: target,
    latch: { index: junction.index, started: preview, turnSide },
  };
}

// The junction being approached at checkpoint `index`, seen from `here`.
export function junctionAt(
  here: Coord,
  checkpoints: Coord[],
  index: number
): Junction | null {
  const cp = checkpoints[index];
  if (!cp) return null;
  const next = checkpoints[index + 1];
  return {
    index,
    distanceM: distanceMeters(here, cp),
    approachBearing: bearingDegrees(here, cp),
    legBearing: next ? bearingDegrees(cp, next) : null,
  };
}

// How a motor vibrates while it is on (see util/beltPattern.ts)
export type BeltPattern = 'continuous' | 'pulsed' | 'steady' | 'taps';
export const BELT_PATTERNS: { value: BeltPattern; label: string }[] = [
  { value: 'continuous', label: 'Continuous' },
  { value: 'pulsed', label: 'Pulsed' },
  { value: 'steady', label: 'Steady pulse' },
  { value: 'taps', label: 'Taps' },
];

export type BeltSettings = {
  enabled: boolean; // belt mode: the phone does not vibrate itself, the belt does
  trigger: BeltTrigger;
  lookAheadM: number;
  secondsAhead: number;
  pattern: BeltPattern;
  minStrength: number;
  maxStrength: number;
};

export const BELT_LIMITS = {
  lookAheadM: { min: 10, max: 80 },
  secondsAhead: { min: 3, max: 15 },
  minStrength: { min: 1, max: 100 },
  maxStrength: { min: 1, max: 100 },
} as const;

export const DEFAULT_BELT_SETTINGS: BeltSettings = {
  enabled: true, // the belt is the main product; the phone is the other option
  trigger: DEFAULT_BELT_TIMING.trigger,
  lookAheadM: DEFAULT_BELT_TIMING.lookAheadM,
  secondsAhead: DEFAULT_BELT_TIMING.secondsAhead,
  pattern: 'steady',
  minStrength: 32,
  maxStrength: 100,
};

export function clampBeltSettings(raw: Partial<BeltSettings> | null | undefined): BeltSettings {
  const d = DEFAULT_BELT_SETTINGS;
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const patterns: BeltPattern[] = ['continuous', 'pulsed', 'steady', 'taps'];
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : d.enabled,
    trigger: raw?.trigger === 'speed' ? 'speed' : 'fixed',
    lookAheadM: Math.round(clamp(num(raw?.lookAheadM, d.lookAheadM), BELT_LIMITS.lookAheadM.min, BELT_LIMITS.lookAheadM.max)),
    secondsAhead: Math.round(clamp(num(raw?.secondsAhead, d.secondsAhead), BELT_LIMITS.secondsAhead.min, BELT_LIMITS.secondsAhead.max)),
    pattern: patterns.includes(raw?.pattern as BeltPattern) ? (raw!.pattern as BeltPattern) : d.pattern,
    maxStrength: Math.round(clamp(num(raw?.maxStrength, d.maxStrength), 1, 100)),
    minStrength: Math.round(clamp(num(raw?.minStrength, d.minStrength), 1, Math.round(clamp(num(raw?.maxStrength, d.maxStrength), 1, 100)))),
  };
}

export function timingOf(settings: BeltSettings): BeltTiming {
  return {
    ...DEFAULT_BELT_TIMING,
    trigger: settings.trigger,
    lookAheadM: settings.lookAheadM,
    secondsAhead: settings.secondsAhead,
  };
}
