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

export type BeltGuidance = {
  mix: BeltMix;
  active: boolean; // the belt has started for this junction
  relative: number | null; // degrees to the next stretch, when active
  latch: JunctionLatch;
};

export function beltGuidance(input: {
  facing: number; // the wearer's heading in degrees
  junction: Junction | null;
  speedMps: number | null;
  zoneDeg: number;
  latch: JunctionLatch;
  timing?: BeltTiming;
}): BeltGuidance {
  const { facing, junction, speedMps, zoneDeg } = input;
  const timing = input.timing ?? DEFAULT_BELT_TIMING;

  if (!junction || junction.legBearing === null) {
    return { mix: SILENT_MIX, active: false, relative: null, latch: NEW_JUNCTION_LATCH };
  }

  let latch = input.latch;
  if (latch.index !== junction.index) latch = { index: junction.index, started: false };
  if (!latch.started && junction.distanceM <= triggerDistance(timing, speedMps)) {
    latch = { index: junction.index, started: true };
  }
  if (!latch.started) {
    return { mix: SILENT_MIX, active: false, relative: null, latch };
  }

  const relative = relativeBearing(junction.legBearing, facing);
  return { mix: beltMix(relative, zoneDeg), active: true, relative, latch };
}
