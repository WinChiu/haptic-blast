import { useEffect, useRef, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { GlobalStore } from '../util/globals';
import { addMistakeToRound } from '../util/store';

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
  const dispatch = useDispatch();
  const rounds = useSelector((state: any) => state.userData.round);
  const userUid = useSelector((state: any) => state.userData.userProfile.Uid);
  
  const isLoopRunningRef = useRef<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasAlignedRef = useRef<boolean>(true);
  const mistakeStartTimeRef = useRef<number | null>(null);

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
      if (strength > 0.3) {
        hapticType = Haptics.ImpactFeedbackStyle.Heavy;
      } else if (strength > 0.15) {
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

  // Watcher to start/stop loop and track mistakes
  useEffect(() => {
    const { isNavigating, hapticEnabled, soundEnabled } = stateRef.current;
    
    // Reset mistake tracking only when navigation stops
    if (!isNavigating) {
      wasAlignedRef.current = true;
      mistakeStartTimeRef.current = null;
    }
    
    // Stop feedback loop when navigation stops or no feedback enabled
    if (!isNavigating || (!hapticEnabled && !soundEnabled)) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      isLoopRunningRef.current = false;
      if (!isNavigating) return; // Exit early only if not navigating
    }

    const angleDiff = Math.abs(shortestDiff(targetBearing, currentHeading));
    const isAligned = angleDiff <= GlobalStore.COMPASS_ANGLE_TOLERANCE;

    // Track alignment changes and log mistakes (only if logged in)
    // Transition from aligned to misaligned (mistake starts)
    if (userUid && wasAlignedRef.current && !isAligned) {
      mistakeStartTimeRef.current = Date.now();
    }

    // Transition from misaligned to aligned (mistake ends)
    if (userUid && !wasAlignedRef.current && isAligned && mistakeStartTimeRef.current !== null) {
      const finishTime = Date.now();
      const duration = finishTime - mistakeStartTimeRef.current;
      
      // Dispatch mistake to current round
      const currentRoundIndex = rounds.length - 1;
      if (currentRoundIndex >= 0) {
        dispatch(addMistakeToRound(currentRoundIndex, {
          start: mistakeStartTimeRef.current,
          finish: finishTime,
          duration: duration,
        }));
      }
      
      mistakeStartTimeRef.current = null;
    }

    wasAlignedRef.current = isAligned;

    // Control feedback loop (only when feedback is enabled)

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
    dispatch,
    rounds.length,
    userUid,
  ]);

  // Cleanup
  useEffect(() => {
    return () => {
      isLoopRunningRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
}
