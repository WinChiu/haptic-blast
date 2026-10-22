import { Coord, bearingDegrees, distanceMeters } from './geo';

// The haptic belt: which of three motors (left, front, right) should vibrate,
// and how strongly, to tell the wearer which way to go. Pure functions, so the
// rules can be tested on a computer.
//
// The belt points at the direction of the NEXT STRETCH of the route after the
// junction the wearer is approaching, so the wearer learns about the turn
// before reaching it. Along a straight street the belt is silent.

export type BeltMix = { left: number; main: number; right: number }; // each 0..1

export const SILENT_MIX: BeltMix = { left: 0, main: 0, right: 0 };

// Angle from where the wearer faces to the target, in degrees: positive means
// the target is to the right, negative to the left. In [-180, 180).
export function relativeBearing(targetDeg: number, facingDeg: number): number {
  return ((((targetDeg - facingDeg) % 360) + 540) % 360) - 180;
}

// Motor strengths for a target `relDeg` degrees to the right (+) or left (-).
//   side  = min(1, |a| / 45)           the motor on that side
//   main  = min(1, (90 - |a|) / 45)    the front motor
// Silent inside the silent zone and for targets behind the wearer (|a| > 90,
// a limit of this prototype). At most two motors vibrate at once.
export function beltMix(relDeg: number, zoneDeg: number): BeltMix {
  const a = Math.abs(relDeg);
  if (a <= zoneDeg || a > 90) return SILENT_MIX;
  const side = Math.min(1, a / 45);
  const main = Math.min(1, (90 - a) / 45);
  return relDeg < 0
    ? { left: side, main, right: 0 }
    : { left: 0, main, right: side };
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
};

// Remembers that the belt has started for one junction. Once started it stays
// on until the junction is passed (the index changes), so slowing down cannot
// switch it off.
export type JunctionLatch = { index: number | null; started: boolean };
export const NEW_JUNCTION_LATCH: JunctionLatch = { index: null, started: false };

// What the belt is following:
//   'route'     the direction along the route (like version 1): it buzzes
//               whenever the wearer faces away from it
//   'junction'  within the trigger distance of a junction: the direction of the
//               next stretch, so the wearer learns about the turn early
//   'none'      no target yet (no route, or no journey)
export type BeltPhase = 'route' | 'junction' | 'none';

export type BeltGuidance = {
  mix: BeltMix;
  active: boolean; // the belt has a target (phase is not 'none')
  phase: BeltPhase;
  target: number | null; // the bearing the belt is pointing at (route direction or the turn)
  relative: number | null; // degrees from where the wearer faces to the target
  latch: JunctionLatch;
};

export function beltGuidance(input: {
  facing: number; // the wearer's heading in degrees
  routeTarget?: number | null; // bearing along the route (version 1's target), if any
  junction: Junction | null;
  speedMps: number | null;
  zoneDeg: number;
  latch: JunctionLatch;
  timing?: BeltTiming;
}): BeltGuidance {
  const { facing, junction, speedMps, zoneDeg } = input;
  const routeTarget = input.routeTarget ?? null;
  const timing = input.timing ?? DEFAULT_BELT_TIMING;

  // Has the belt switched to the junction's turn direction? Once started it
  // stays on until the junction is passed, so slowing down cannot end it.
  let latch = input.latch;
  let turnTarget: number | null = null;
  if (junction && junction.legBearing !== null) {
    if (latch.index !== junction.index) latch = { index: junction.index, started: false };
    if (!latch.started && junction.distanceM <= triggerDistance(timing, speedMps)) {
      latch = { index: junction.index, started: true };
    }
    if (latch.started) turnTarget = junction.legBearing;
  } else {
    latch = NEW_JUNCTION_LATCH;
  }

  const phase: BeltPhase = turnTarget !== null ? 'junction' : routeTarget !== null ? 'route' : 'none';
  const target = turnTarget ?? routeTarget;
  if (target === null) {
    return { mix: SILENT_MIX, active: false, phase: 'none', target: null, relative: null, latch };
  }
  const relative = relativeBearing(target, facing);
  return { mix: beltMix(relative, zoneDeg), active: true, phase, target, relative, latch };
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
  silentZone: number; // degrees either side of the target where the belt is silent
  minPower: number; // motor power just above 0 % strength, in percent of full power
  maxPower: number; // motor power at 100 % strength, in percent of full power
};

export const BELT_LIMITS = {
  lookAheadM: { min: 10, max: 80 },
  secondsAhead: { min: 3, max: 15 },
  silentZone: { min: 1, max: 20 },
  minPower: { min: 0, max: 60 },
  maxPower: { min: 20, max: 100 },
} as const;

export const DEFAULT_BELT_SETTINGS: BeltSettings = {
  enabled: true, // the belt is the main product; the phone is the other option
  trigger: DEFAULT_BELT_TIMING.trigger,
  lookAheadM: DEFAULT_BELT_TIMING.lookAheadM,
  secondsAhead: DEFAULT_BELT_TIMING.secondsAhead,
  pattern: 'continuous', // steady strengths, like the vibration simulator; the pulse patterns stay selectable
  minPower: 30, // about 77 of 255: small motors do not spin below roughly this
  maxPower: 100,
  silentZone: 10, // the simulator's value (to be confirmed); the belt's target does not move with GPS error, so it never widens
};

// minPower and maxPower, each inside its range, and never maxPower below minPower
function powerLimits(raw: Partial<BeltSettings> | null | undefined) {
  const d = DEFAULT_BELT_SETTINGS;
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const minPower = Math.round(clamp(num(raw?.minPower, d.minPower), BELT_LIMITS.minPower.min, BELT_LIMITS.minPower.max));
  const maxPower = Math.max(minPower, Math.round(clamp(num(raw?.maxPower, d.maxPower), BELT_LIMITS.maxPower.min, BELT_LIMITS.maxPower.max)));
  return { minPower, maxPower };
}

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
    silentZone: Math.round(clamp(num(raw?.silentZone, d.silentZone), BELT_LIMITS.silentZone.min, BELT_LIMITS.silentZone.max)),
    ...powerLimits(raw),
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
