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
} from '../util/belt';

export type BeltState = {
  mix: BeltMix;
  active: boolean; // the belt has started for the junction ahead
  relative: number | null; // degrees to the next stretch of the route
};

const IDLE: BeltState = { mix: SILENT_MIX, active: false, relative: null };
const TICK_MS = 100;

// Works out what the belt should do, ten times a second, from the wearer's
// heading and the junction ahead. Returns the current state for display.
// While belt mode is off, or nobody is navigating, it stays idle.
export function useBelt(input: {
  settings: BeltSettings;
  running: boolean; // a journey is on and the user is not calibrating
  facing: number;
  junction: Junction | null;
  speedMps: number | null;
  zoneDeg: number;
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
    let last: BeltGuidance | null = null;
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
      const changed =
        !last ||
        last.active !== g.active ||
        Math.round(last.mix.left * 100) !== Math.round(g.mix.left * 100) ||
        Math.round(last.mix.main * 100) !== Math.round(g.mix.main * 100) ||
        Math.round(last.mix.right * 100) !== Math.round(g.mix.right * 100);
      last = g;
      if (changed) setState({ mix: g.mix, active: g.active, relative: g.relative });
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [active]);

  return active ? state : IDLE;
}
