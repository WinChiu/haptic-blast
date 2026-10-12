// The buzz controller, kept free of React so that it is created exactly once.
// Pulsar's useRealtimeComposer() returns a new wrapper object on every render;
// callbacks that depended on that object were recreated on every render, and
// the effect cleanup that stops the buzz then ran on every render too, cutting
// off pulses whenever the screen updated (every heading change). Reading the
// composer through getRealtime() at call time avoids that.

export type RealtimeLike = {
  set: (amplitude: number, frequency: number) => void;
  stop: () => void;
};

export type AndroidVibrationLike = {
  vibrate: (ms: number) => void;
  cancel: () => void;
};

export type Buzzer = {
  start: (amplitude: number) => void;
  stop: () => void;
  pulse: (amplitude: number, durationMs: number) => void;
  level: (amplitude: number) => void;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function createBuzzer(options: {
  getRealtime: () => RealtimeLike | null;
  androidVibration: AndroidVibrationLike | null;
  frequency: () => number;
  androidHoldMs: number;
}): Buzzer {
  let isBuzzing = false;
  let pulseTimer: ReturnType<typeof setTimeout> | null = null;

  // Stop whatever is vibrating, including a pulse still waiting to end.
  const stop = () => {
    if (pulseTimer) {
      clearTimeout(pulseTimer);
      pulseTimer = null;
    }
    if (!isBuzzing) return;
    const realtime = options.getRealtime();
    if (realtime) realtime.stop();
    else options.androidVibration?.cancel();
    isBuzzing = false;
  };

  // Start buzzing, or update the amplitude (0..1) of an ongoing buzz.
  const start = (amplitude: number) => {
    const realtime = options.getRealtime();
    if (realtime) {
      realtime.set(clamp01(amplitude), options.frequency());
    } else if (options.androidVibration && !isBuzzing) {
      options.androidVibration.vibrate(options.androidHoldMs);
    }
    isBuzzing = true;
  };

  // One vibration of durationMs at amplitude, then silence. On Android without
  // Pulsar the strength cannot be set, only the length.
  const pulse = (amplitude: number, durationMs: number) => {
    if (pulseTimer) clearTimeout(pulseTimer);
    const realtime = options.getRealtime();
    if (realtime) {
      realtime.set(clamp01(amplitude), options.frequency());
    } else if (options.androidVibration) {
      options.androidVibration.vibrate(durationMs);
    }
    isBuzzing = true;
    pulseTimer = setTimeout(stop, durationMs);
  };

  // Change the strength of a buzz that is already running (its length stays).
  const level = (amplitude: number) => {
    const realtime = options.getRealtime();
    if (realtime && isBuzzing) {
      realtime.set(clamp01(amplitude), options.frequency());
    }
  };

  return { start, stop, pulse, level };
}
