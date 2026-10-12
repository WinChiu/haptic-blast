import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { AXES_SOURCE, addAxesListener } from './useCompass';
import {
  Calibration,
  CalibrationFailure,
  CalibrationState,
  finishCalibrationByHand,
  startCalibration,
  stepCalibration,
} from '../util/calibration';

export type CalibrationStatus =
  | 'idle'
  | 'capturing' // hold the phone pointing forward
  | 'placing' // put the phone away and keep it still
  | 'done'
  | 'failed';

// Runs the pocket calibration (see util/calibration.ts) and holds its result.
// Buzzes when the phone may be put away, and on success or failure, since the
// phone is out of sight by then.
export function useCalibration() {
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [status, setStatus] = useState<CalibrationStatus>('idle');
  const [failure, setFailure] = useState<CalibrationFailure | null>(null);
  const removeRef = useRef<(() => void) | null>(null);
  const stateRef = useRef<CalibrationState | null>(null);
  // Tapped Done before the phone had been still long enough
  const [needsStill, setNeedsStill] = useState(false);

  const stopListening = () => {
    removeRef.current?.();
    removeRef.current = null;
  };
  useEffect(() => stopListening, []);

  const start = () => {
    stopListening();
    // Hand-held heading while measuring the forward direction
    setCalibration(null);
    setFailure(null);
    setNeedsStill(false);
    setStatus('capturing');

    let state: CalibrationState | null = null;
    stateRef.current = null;
    removeRef.current = addAxesListener((axes) => {
      const sample = { t: Date.now(), axes };
      const previous = state?.phase;
      state = state ? stepCalibration(state, sample) : startCalibration(sample);
      stateRef.current = state;
      if (state.phase === previous) return;

      if (state.phase === 'placing') {
        setStatus('placing');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (state.phase === 'done') {
        stopListening();
        setCalibration(state.calibration);
        setStatus('done');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (state.phase === 'failed') {
        stopListening();
        setFailure(state.reason);
        setStatus('failed');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    });
  };

  // The person taps Done once the phone is where it will be carried
  const finish = () => {
    const state = stateRef.current;
    if (!state) return;
    const done = finishCalibrationByHand(state, Date.now());
    if (!done || done.phase !== 'done') {
      setNeedsStill(true); // hold still a moment, then tap Done again
      return;
    }
    stopListening();
    setNeedsStill(false);
    setCalibration(done.calibration);
    setStatus('done');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // Back to the hand-held heading
  const clear = () => {
    stopListening();
    stateRef.current = null;
    setCalibration(null);
    setFailure(null);
    setNeedsStill(false);
    setStatus('idle');
  };

  return {
    calibration,
    status,
    failure,
    needsStill,
    start,
    finish,
    clear,
    available: AXES_SOURCE !== null,
  };
}
