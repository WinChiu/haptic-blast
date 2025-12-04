import { useEffect, useRef, useCallback } from 'react';
import { useAudioPlayer } from 'expo-audio';

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
    const isAligned = angleDiff <= 25;

    const shouldSound = isActive && !isAligned;
    shouldSoundRef.current = shouldSound;

    if (shouldSound) {
      // stepped interval: faster when more misaligned
      const minInterval = 220; // beeps fastest when very wrong
      const maxInterval = 1000; // slow when close
      const maxDiff = 180;
      const minDiff = 15;

      const stepSize = 15;
      const steppedDiff = Math.floor(angleDiff / stepSize) * stepSize;

      const ratio = (maxDiff - steppedDiff) / (maxDiff - minDiff);
      const clampedRatio = Math.max(0, Math.min(1, ratio));

      const interval = minInterval + (maxInterval - minInterval) * clampedRatio;
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
