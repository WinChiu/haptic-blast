// How the belt motors vibrate over time while they are on, and how a motor
// strength becomes the byte sent to the belt. Pure functions.
//
// The strength of each motor comes from util/belt.ts and follows the bearing
// live. This file only decides WHEN the motors are on (the rhythm):
//   continuous  on all the time
//   pulsed      one pulse, then a pause that shrinks as the bearing error grows
//   steady      one pulse, then the same pause every time
//   taps        like steady, but each pulse is a quick series of short taps
import { BeltMix, BeltPattern } from './belt';
import { HAPTIC_SHAPE, pauseForDeviation } from './haptics';

export const TAP_ON_MS = 50;
export const TAP_OFF_MS = 50;
export const IDLE_RESET_MS = 2000; // silent this long: the next buzz starts at once

export type BeltClock = {
  on: boolean; // inside a pulse
  until: number; // when the current pulse or pause ends
  onStart: number; // when the current pulse began (for the taps)
  idleSince: number | null; // since when the belt has been silent
};

export const NEW_BELT_CLOCK: BeltClock = { on: false, until: 0, onStart: 0, idleSince: null };

export type PatternConfig = {
  pattern: BeltPattern;
  pulseMs: number; // length of one pulse (the Pulse length setting)
  zoneDeg: number;
};

// One step of the rhythm (call it every 50 ms). `active` says whether the belt
// wants to vibrate at all (a motor strength above zero). The rhythm keeps
// running while the belt is silent for a short time, so brushing the edge of
// the silent zone never restarts it; after IDLE_RESET_MS of silence it starts
// afresh, so a new buzz is felt at once.
export function stepBeltGate(
  clock: BeltClock,
  nowMs: number,
  active: boolean,
  absAngleDeg: number,
  cfg: PatternConfig
): { clock: BeltClock; gate: boolean } {
  if (cfg.pattern === 'continuous') {
    return { clock: NEW_BELT_CLOCK, gate: active };
  }

  let c = clock;
  if (!active) {
    const since = c.idleSince ?? nowMs;
    if (nowMs - since >= IDLE_RESET_MS) return { clock: { ...NEW_BELT_CLOCK, idleSince: since }, gate: false };
    c = { ...c, idleSince: since };
  } else {
    c = { ...c, idleSince: null };
  }

  if (nowMs >= c.until) {
    if (c.on) {
      const pause =
        cfg.pattern === 'pulsed'
          ? pauseForDeviation(absAngleDeg, cfg.zoneDeg)
          : HAPTIC_SHAPE.pauseSteadyMs;
      c = { ...c, on: false, until: nowMs + pause };
    } else {
      c = { ...c, on: true, onStart: nowMs, until: nowMs + cfg.pulseMs };
    }
  }

  let gate = active && c.on;
  if (gate && cfg.pattern === 'taps') {
    gate = (nowMs - c.onStart) % (TAP_ON_MS + TAP_OFF_MS) < TAP_ON_MS;
  }
  return { clock: c, gate };
}

// Motor strength 0..1 to the byte for the belt. Small motors do not spin below
// about 30 % power, so 0 stays 0 and anything above 0 maps to floor..255.
export const MOTOR_FLOOR = 80;

export function motorByte(strength: number, floor: number = MOTOR_FLOOR): number {
  if (!(strength > 0)) return 0;
  return Math.min(255, Math.round(floor + Math.min(1, strength) * (255 - floor)));
}

// The three bytes (left, front, right) for one moment
export type BeltFrame = [number, number, number];
export const ZERO_FRAME: BeltFrame = [0, 0, 0];

export function beltFrame(mix: BeltMix, gate: boolean, floor: number = MOTOR_FLOOR): BeltFrame {
  if (!gate) return ZERO_FRAME;
  return [motorByte(mix.left, floor), motorByte(mix.main, floor), motorByte(mix.right, floor)];
}
