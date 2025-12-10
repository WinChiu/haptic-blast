import { useEffect, useRef, useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { GlobalStore } from '../util/globals';

const BEEP_SOURCE = require('../assets/beep.mp3');

// Normalize angle to [0, 360)
const normalizeAngle = (angle: number) => {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
};

// Shortest signed angle difference target - current in [-180, 180]
const shortestDiff = (target: number, current: number) => {
  let diff = normalizeAngle(target) - normalizeAngle(current);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
};

export function useGuidance(
  currentHeading: number,
  targetBearing: number,
  isNavigating: boolean,
  hapticEnabled: boolean,
  soundEnabled: boolean
) {
  // We track "isVibrating" for potential UI feedback, though strictly strictly unnecessary for logic
  // Leaving it simple for now.

  const isLoopRunningRef = useRef<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for current state so the loop sees latest values without restarting
  const stateRef = useRef({
    heading: currentHeading,
    target: targetBearing,
    isNavigating,
    hapticEnabled,
    soundEnabled,
  });

  useEffect(() => {
    stateRef.current = {
      heading: currentHeading,
      target: targetBearing,
      isNavigating,
      hapticEnabled,
      soundEnabled,
    };
  }, [
    currentHeading,
    targetBearing,
    isNavigating,
    hapticEnabled,
    soundEnabled,
  ]);

  // Audio setup
  const player = useAudioPlayer(BEEP_SOURCE);

  // Constants
  const { MAX_INTERVAL, MIN_INTERVAL, MAX_DIFF, MIN_DIFF, STEP } =
    GlobalStore.FEEDBACK;

  const playFeedback = useCallback(async () => {
    const { heading, target, isNavigating, hapticEnabled, soundEnabled } =
      stateRef.current;

    // Check if we should be giving feedback
    if (!isNavigating) return;

    const angleDiff = Math.abs(shortestDiff(target, heading));
    const isAligned = angleDiff <= GlobalStore.COMPASS_ANGLE_TOLERANCE;

    if (isAligned) return;

    // Calculate intensity (0 to 1)
    // Larger diff = closer to 1 (stronger/faster)
    const strength = Math.max(
      0,
      Math.min(1, (angleDiff - MIN_DIFF) / (MAX_DIFF - MIN_DIFF))
    );

    // HAPTIC ACTION
    if (hapticEnabled) {
      let hapticType = Haptics.ImpactFeedbackStyle.Light;
      if (strength > 0.66) {
        hapticType = Haptics.ImpactFeedbackStyle.Heavy;
      } else if (strength > 0.33) {
        hapticType = Haptics.ImpactFeedbackStyle.Medium;
      }
      Haptics.impactAsync(hapticType);
    }

    // SOUND ACTION
    if (soundEnabled) {
      try {
        player.seekTo(0);
        player.play();
      } catch (err) {
        console.warn('Audio play error', err);
      }
    }
  }, [player]);

  // The Loop
  const loop = useCallback(() => {
    const { heading, target, isNavigating, hapticEnabled, soundEnabled } =
      stateRef.current;

    // Stop conditions
    if (!isNavigating || (!hapticEnabled && !soundEnabled)) {
      isLoopRunningRef.current = false;
      return;
    }

    const angleDiff = Math.abs(shortestDiff(target, heading));
    const isAligned = angleDiff <= GlobalStore.COMPASS_ANGLE_TOLERANCE;

    if (isAligned) {
      // If aligned, we don't stop the loop immediately, but we might wait a bit or check again?
      // Actually, if aligned, we shouldn't beep. The original hooks stopped the loop or paused.
      // Let's just check again in a short while (e.g. 200ms) to see if we become unaligned.
      // OR better: stop the loop, and rely on the useEffect to restart it when angle changes.
      isLoopRunningRef.current = false;
      return;
    }

    // Perform Feedback
    playFeedback();

    // Calculate next interval
    const strength = Math.max(
      0,
      Math.min(1, (angleDiff - MIN_DIFF) / (MAX_DIFF - MIN_DIFF))
    );

    // Inverse relationship: High strength (large error) = Low interval (fast beeps)
    // Using the formula from useHapticGuidance:
    const interval =
      Math.round(((1 - strength) * (MAX_INTERVAL - MIN_INTERVAL)) / STEP) *
        STEP +
      MIN_INTERVAL;

    timeoutRef.current = setTimeout(loop, interval);
  }, [playFeedback]);

  // Watcher to start/stop loop
  useEffect(() => {
    const { isNavigating, hapticEnabled, soundEnabled } = stateRef.current;
    if (!isNavigating || (!hapticEnabled && !soundEnabled)) {
      // cleanup
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      isLoopRunningRef.current = false;
      return;
    }

    const angleDiff = Math.abs(shortestDiff(targetBearing, currentHeading));
    const isAligned = angleDiff <= GlobalStore.COMPASS_ANGLE_TOLERANCE;

    if (!isAligned && !isLoopRunningRef.current) {
      isLoopRunningRef.current = true;
      loop();
    } else if (isAligned) {
      // If we become aligned, stop the loop
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      isLoopRunningRef.current = false;
    }
  }, [
    currentHeading,
    targetBearing,
    isNavigating,
    hapticEnabled,
    soundEnabled,
    loop,
  ]);

  // Cleanup
  useEffect(() => {
    return () => {
      isLoopRunningRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
}
