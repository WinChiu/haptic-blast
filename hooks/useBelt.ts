import { useEffect, useRef, useState } from 'react';
import {
  BeltGuidance,
  BeltMix,
  BeltSettings,
  Junction,
  NEW_JUNCTION_LATCH,
  SILENT_MIX,
  beltGuidance,
  timingOf,
  triggerDistance,
} from '../util/belt';
import {
  BeltFrame,
  NEW_BELT_CLOCK,
  ZERO_FRAME,
  beltFrame,
  stepBeltGate,
} from '../util/beltPattern';
import { getHapticSettings } from '../util/hapticSettings';

export type BeltState = {
  mix: BeltMix;
  active: boolean; // the belt has started for the junction ahead
  relative: number | null; // degrees to the next stretch of the route
  distanceM: number | null; // distance to the junction ahead
  triggerM: number | null; // the belt starts when the junction is this close
};

const IDLE: BeltState = { mix: SILENT_MIX, active: false, relative: null, distanceM: null, triggerM: null };
const TICK_MS = 50;

// Works out what the belt should do, twenty times a second, from the wearer's
// heading and the junction ahead, and hands each result (three motor bytes,
// already shaped by the chosen vibration pattern) to onFrame. Returns the
// current strengths for display. While belt mode is off, or nobody is
// navigating, it stays idle and sends one all-zero frame.

export function useBelt(input: {
  settings: BeltSettings;
  running: boolean; // a journey is on and the user is not calibrating
  facing: number;
  junction: Junction | null;
  speedMps: number | null;
  zoneDeg: number;
  onFrame?: (frame: BeltFrame) => void;
}): BeltState {
  const ref = useRef(input);
  ref.current = input;
  const [state, setState] = useState<BeltState>(IDLE);
  const active = input.settings.enabled && input.running;

  useEffect(() => {
    if (!active) {
      setState(IDLE);
      return;
    }
    let latch = NEW_JUNCTION_LATCH;
    let clock = NEW_BELT_CLOCK;
    let last: BeltGuidance | null = null;
    let lastDistance: number | null = null;
    const tick = () => {
      const i = ref.current;
      const g = beltGuidance({
        facing: i.facing,
        junction: i.junction,
        speedMps: i.speedMps,
        zoneDeg: i.zoneDeg,
        latch,
        timing: timingOf(i.settings),
      });
      latch = g.latch;
      const distanceM = i.junction ? Math.round(i.junction.distanceM) : null;
      const triggerM = i.junction ? Math.round(triggerDistance(timingOf(i.settings), i.speedMps)) : null;
      const anyOn = g.mix.left + g.mix.main + g.mix.right > 0;
      const step = stepBeltGate(clock, Date.now(), anyOn, Math.abs(g.relative ?? 0), {
        pattern: i.settings.pattern,
        pulseMs: getHapticSettings().pulseMs,
        zoneDeg: i.zoneDeg,
      });
      clock = step.clock;
      i.onFrame?.(beltFrame(g.mix, step.gate));
      const changed =
        !last ||
        lastDistance !== distanceM ||
        last.active !== g.active ||
        Math.round(last.mix.left * 100) !== Math.round(g.mix.left * 100) ||
        Math.round(last.mix.main * 100) !== Math.round(g.mix.main * 100) ||
        Math.round(last.mix.right * 100) !== Math.round(g.mix.right * 100);
      last = g;
      lastDistance = distanceM;
      if (changed) setState({ mix: g.mix, active: g.active, relative: g.relative, distanceM, triggerM });
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(timer);
      ref.current.onFrame?.(ZERO_FRAME); // never leave a motor running
    };
  }, [active]);

  return active ? state : IDLE;
}
