import type { DeviceAxes } from '../hooks/useCompass';
import { GlobalStore } from './globals';
import { circularDiff, circularStats } from './recorder';

// Pocket calibration. The user holds the phone pointing forward and taps, then
// puts the phone away without turning their body. The forward heading measured
// in the hand (h0) and the heading of the phone once still in the pocket (h1)
// give an offset; from then on body heading = pocket heading + offset.

// Which phone axis the heading is read from: the top edge, or the back camera
// direction (out of the back of the phone)
export type HeadingAxis = 'top' | 'back';

export type Calibration = {
  axis: HeadingAxis; // locked: no flat/upright switching after calibration
  offset: number; // degrees added to the axis heading
};

export type CalibrationSample = { t: number; axes: DeviceAxes };

export type CalibrationFailure = 'moving' | 'not-still';

export type CalibrationState =
  | {
      phase: 'capturing';
      startT: number;
      axis: HeadingAxis;
      headings: number[];
    }
  | {
      phase: 'placing';
      h0: number;
      placingSince: number;
      prev: CalibrationSample;
      still: CalibrationSample[];
      // The latest still stretch that was long enough to finish by hand with.
      // Kept after the phone moves again, so the jolt of tapping Done does
      // not throw it away.
      bestStill: CalibrationSample[];
    }
  | { phase: 'done'; calibration: Calibration }
  | { phase: 'failed'; reason: CalibrationFailure };

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const normalize = (deg: number) => ((deg % 360) + 360) % 360;

// Heading of an axis projected onto the ground (degrees clockwise from north),
// and how horizontal the axis is (1 = level, 0 = pointing straight up or down,
// where its heading is meaningless)
export function axisHeading(
  axes: DeviceAxes,
  axis: HeadingAxis
): { deg: number; horizontal: number } {
  const east = axis === 'top' ? axes.topE : -axes.normalE;
  const north = axis === 'top' ? axes.topN : -axes.normalN;
  return {
    deg: normalize(toDeg(Math.atan2(east, north))),
    horizontal: Math.hypot(east, north),
  };
}

// The more horizontal of the two axes. They are perpendicular, so at least one
// is always within 45° of level.
export function pickAxis(axes: DeviceAxes): HeadingAxis {
  return axisHeading(axes, 'top').horizontal >=
    axisHeading(axes, 'back').horizontal
    ? 'top'
    : 'back';
}

// Body heading from a calibrated phone, or null while the locked axis points
// too close to straight up or down (the phone has turned in the pocket)
export function calibratedHeading(
  axes: DeviceAxes,
  calibration: Calibration
): number | null {
  const { deg, horizontal } = axisHeading(axes, calibration.axis);
  if (horizontal < GlobalStore.CALIBRATION.minHorizontal) return null;
  return normalize(deg + calibration.offset);
}

// How far the phone turned between two samples, in degrees
export function rotationBetween(a: DeviceAxes, b: DeviceAxes): number {
  const angle = (x: number) => toDeg(Math.acos(Math.max(-1, Math.min(1, x))));
  const top = angle(a.topE * b.topE + a.topN * b.topN + a.topU * b.topU);
  const normal = angle(
    a.normalE * b.normalE + a.normalN * b.normalN + a.normalU * b.normalU
  );
  return Math.max(top, normal);
}

const meanHeading = (headings: number[]) =>
  normalize(circularStats(headings).mean);

export function startCalibration(sample: CalibrationSample): CalibrationState {
  // Held flat this picks the top edge, held upright the back camera: both
  // point forward when the phone points forward
  const axis = pickAxis(sample.axes);
  return {
    phase: 'capturing',
    startT: sample.t,
    axis,
    headings: [axisHeading(sample.axes, axis).deg],
  };
}

// Advance the calibration by one sensor sample. Pure, so it can be tested
// with recorded or synthetic samples.
export function stepCalibration(
  state: CalibrationState,
  sample: CalibrationSample
): CalibrationState {
  const c = GlobalStore.CALIBRATION;

  if (state.phase === 'capturing') {
    const headings = [
      ...state.headings,
      axisHeading(sample.axes, state.axis).deg,
    ];
    if (sample.t - state.startT < c.captureMs) return { ...state, headings };
    if (circularStats(headings).stdDev > c.maxCaptureSpreadDeg) {
      return { phase: 'failed', reason: 'moving' };
    }
    return {
      phase: 'placing',
      h0: meanHeading(headings),
      placingSince: sample.t,
      prev: sample,
      still: [],
      bestStill: [],
    };
  }

  if (state.phase === 'placing') {
    const elapsed = sample.t - state.placingSince;
    if (elapsed > c.timeoutMs) return { phase: 'failed', reason: 'not-still' };

    const dt = (sample.t - state.prev.t) / 1000;
    const rate = dt > 0 ? rotationBetween(state.prev.axes, sample.axes) / dt : 0;
    const still = rate <= c.stillRateDegPerS ? [...state.still, sample] : [];

    if (
      elapsed >= c.minPlaceMs &&
      still.length > 0 &&
      sample.t - still[0].t >= c.stillMs
    ) {
      const axis = pickAxis(sample.axes);
      const h1 = meanHeading(still.map((s) => axisHeading(s.axes, axis).deg));
      return {
        phase: 'done',
        calibration: { axis, offset: circularDiff(state.h0, h1) },
      };
    }
    const longEnough =
      still.length > 0 && sample.t - still[0].t >= c.manualStillMs;
    return {
      ...state,
      prev: sample,
      still,
      bestStill: longEnough ? still : state.bestStill,
    };
  }

  return state;
}

// The user taps Done: finish now with the latest still stretch instead of
// waiting for the timer. The tap jolts the phone, so readings right before it
// are left out. Returns null when the phone has not been still long enough
// yet (the person should hold still for a moment and tap again).
export function finishCalibrationByHand(
  state: CalibrationState,
  nowMs: number
): CalibrationState | null {
  if (state.phase !== 'placing') return null;
  const c = GlobalStore.CALIBRATION;
  const usable = (run: CalibrationSample[]) => {
    const kept = run.filter((s) => s.t <= nowMs - c.tapGuardMs);
    if (kept.length === 0) return null;
    const last = kept[kept.length - 1];
    if (nowMs - last.t > c.staleStillMs) return null;
    if (last.t - kept[0].t < c.manualStillMs) return null;
    return kept;
  };
  const run = usable(state.still) ?? usable(state.bestStill);
  if (!run) return null;
  const axis = pickAxis(run[run.length - 1].axes);
  const h1 = meanHeading(run.map((s) => axisHeading(s.axes, axis).deg));
  return {
    phase: 'done',
    calibration: { axis, offset: circularDiff(state.h0, h1) },
  };
}
