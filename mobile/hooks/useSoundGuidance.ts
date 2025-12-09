import { useEffect, useRef, useCallback } from 'react';
import { useAudioPlayer } from 'expo-audio';
import { GlobalStore } from '../util/globals';

// ------- angle helpers --------
const normalizeAngle = (angle: number) => {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
};

const shortestDiff = (target: number, current: number) => {
  let diff = normalizeAngle(target) - normalizeAngle(current);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
};

// ------- hook --------
const BEEP_URL = 'https://www.soundjay.com/buttons/sounds/beep-07a.mp3';

const BEEP_SOURCE = require('../assets/beep.mp3');

export function useSoundGuidance(
  currentHeading: number,
  targetBearing: number,
  isActive: boolean
) {
  const intervalRef = useRef<number>(1000);
  const shouldSoundRef = useRef<boolean>(false);
  const isLoopRunningRef = useRef<boolean>(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create audio player (auto-loads the source)
  const player = useAudioPlayer(BEEP_SOURCE);

  // Play one beep (always from start)
  const playBeep = useCallback(async () => {
    try {
      // restart from the beginning every time
      player.seekTo(0);
      await player.play();
    } catch (error) {
      console.warn('Error playing sound:', error);
    }
  }, [player]);

  // The timing loop
  const startSoundLoop = useCallback(() => {
    if (isLoopRunningRef.current) return;

    isLoopRunningRef.current = true;

    const loop = () => {
      if (!shouldSoundRef.current) {
        isLoopRunningRef.current = false;
        return;
      }

      // play beep
      playBeep();

      const delay = intervalRef.current;
      timeoutRef.current = setTimeout(loop, delay);
    };

    loop();
  }, [playBeep]);

  // Respond to heading / target / active changes
  useEffect(() => {
    const angleDiff = Math.abs(shortestDiff(targetBearing, currentHeading));
    const isAligned = angleDiff <= GlobalStore.COMPASS_ANGLE_TOLERANCE;

    const shouldSound = isActive && !isAligned;
    shouldSoundRef.current = shouldSound;

    if (shouldSound) {
      // stepped interval: faster when more misaligned
      const MIN_INTERVAL = GlobalStore.FEEDBACK.MIN_INTERVAL; // beeps fastest when very wrong
      const MAX_INTERVAL = GlobalStore.FEEDBACK.MAX_INTERVAL; // slow when close
      const MAX_DIFF = GlobalStore.FEEDBACK.MAX_DIFF;
      const MIN_DIFF = GlobalStore.FEEDBACK.MIN_DIFF;
      const STEP = GlobalStore.FEEDBACK.STEP;
      const STEPPED_DIFF = Math.floor(angleDiff / STEP) * STEP;

      const ratio = (MAX_DIFF - STEPPED_DIFF) / (MAX_DIFF - MIN_DIFF);
      const clampedRatio = Math.max(0, Math.min(1, ratio));

      const interval =
        MIN_INTERVAL + (MAX_INTERVAL - MIN_INTERVAL) * clampedRatio;
      intervalRef.current = interval;

      if (!isLoopRunningRef.current) {
        startSoundLoop();
      }
    } else {
      // we should be quiet now
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      isLoopRunningRef.current = false;
      try {
        player.pause();
      } catch {
        // ignore
      }
    }
  }, [currentHeading, targetBearing, isActive, startSoundLoop, player]);

  // Cleanup
  useEffect(() => {
    return () => {
      shouldSoundRef.current = false;
      isLoopRunningRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      try {
        player.pause();
      } catch {
        // ignore
      }
    };
  }, [player]);
}
