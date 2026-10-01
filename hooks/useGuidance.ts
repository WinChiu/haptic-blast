import { useEffect, useRef, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { GlobalStore } from '../util/globals';
import { addMistakeToRound } from '../util/store';
import { HapticStyle } from './FeedbackContext';
import { useBuzz, BUZZ_BACKEND } from './useBuzz';

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

// Map angle error to 0..1 (larger error = closer to 1)
const strengthOf = (angleDiff: number) => {
  const { MAX_DIFF, MIN_DIFF } = GlobalStore.FEEDBACK;
  return Math.max(0, Math.min(1, (angleDiff - MIN_DIFF) / (MAX_DIFF - MIN_DIFF)));
};

// Whether the timed loop has work: sound beeps, or tap/pulse haptics.
// Continuous buzz is driven directly by heading changes instead.
const loopNeeded = (s: {
  hapticEnabled: boolean;
  soundEnabled: boolean;
  hapticStyle: HapticStyle;
}) => s.soundEnabled || (s.hapticEnabled && s.hapticStyle !== 'continuous');

export function useGuidance(
  currentHeading: number,
  targetBearing: number,
  isNavigating: boolean,
  hapticEnabled: boolean,
  soundEnabled: boolean,
  requestedHapticStyle: HapticStyle
) {
  // Expo Go on iOS has no way to buzz, so fall back to taps there.
  const hapticStyle: HapticStyle =
    BUZZ_BACKEND === 'none' ? 'tap' : requestedHapticStyle;

  const dispatch = useDispatch();
  const rounds = useSelector((state: any) => state.userData.round);
  const userUid = useSelector((state: any) => state.userData.userProfile.Uid);
  
  const isLoopRunningRef = useRef<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasAlignedRef = useRef<boolean>(true);
  const mistakeStartTimeRef = useRef<number | null>(null);
  const isContinuousBuzzingRef = useRef<boolean>(false);

  // Refs for current state so the loop sees latest values without restarting
  const stateRef = useRef({
    heading: currentHeading,
    target: targetBearing,
    isNavigating,
    hapticEnabled,
    soundEnabled,
    hapticStyle,
  });

  useEffect(() => {
    stateRef.current = {
      heading: currentHeading,
      target: targetBearing,
      isNavigating,
      hapticEnabled,
      soundEnabled,
      hapticStyle,
    };
  }, [
    currentHeading,
    targetBearing,
    isNavigating,
    hapticEnabled,
    soundEnabled,
    hapticStyle,
  ]);

  // Audio setup
  const player = useAudioPlayer(BEEP_SOURCE);
  const { start: startBuzz, stop: stopBuzz, pulse: pulseBuzz } = useBuzz();

  // Constants
  const { MAX_INTERVAL, MIN_INTERVAL, STEP } = GlobalStore.FEEDBACK;

  const playFeedback = useCallback(async () => {
    const {
      heading,
      target,
      isNavigating,
      hapticEnabled,
      soundEnabled,
      hapticStyle,
    } = stateRef.current;

    // Check if we should be giving feedback
    if (!isNavigating) return;

    const angleDiff = Math.abs(shortestDiff(target, heading));
    const isAligned = angleDiff <= GlobalStore.COMPASS_ANGLE_TOLERANCE;

    if (isAligned) return;

    const strength = strengthOf(angleDiff);

    // HAPTIC ACTION (continuous buzz is handled by its own effect)
    if (hapticEnabled && hapticStyle === 'pulse') {
      const { PULSE_MIN_ON, PULSE_MAX_ON } = GlobalStore.BUZZ;
      pulseBuzz(strength, PULSE_MIN_ON + strength * (PULSE_MAX_ON - PULSE_MIN_ON));
    } else if (hapticEnabled && hapticStyle === 'tap') {
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
  }, [player, pulseBuzz]);

  // The Loop
  const loop = useCallback(() => {
    const { heading, target, isNavigating } = stateRef.current;

    // Stop conditions
    if (!isNavigating || !loopNeeded(stateRef.current)) {
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

    // Inverse relationship: High strength (large error) = Low interval (fast beeps)
    const strength = strengthOf(angleDiff);
    const interval =
      Math.round(((1 - strength) * (MAX_INTERVAL - MIN_INTERVAL)) / STEP) *
        STEP +
      MIN_INTERVAL;

    timeoutRef.current = setTimeout(loop, interval);
  }, [playFeedback]);

  // Watcher to start/stop loop and track mistakes
  useEffect(() => {
    const { isNavigating } = stateRef.current;

    // Reset mistake tracking only when navigation stops
    if (!isNavigating) {
      wasAlignedRef.current = true;
      mistakeStartTimeRef.current = null;
    }
    
    // Stop feedback loop when navigation stops or no feedback enabled
    if (!isNavigating || !loopNeeded(stateRef.current)) {
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
    hapticStyle,
    loop,
    dispatch,
    rounds.length,
    userUid,
  ]);

  // Continuous buzz: follows every heading update instead of the timed loop
  useEffect(() => {
    const angleDiff = Math.abs(shortestDiff(targetBearing, currentHeading));
    const shouldBuzz =
      isNavigating &&
      hapticEnabled &&
      hapticStyle === 'continuous' &&
      angleDiff > GlobalStore.COMPASS_ANGLE_TOLERANCE;

    if (shouldBuzz) {
      startBuzz(strengthOf(angleDiff));
      isContinuousBuzzingRef.current = true;
    } else if (isContinuousBuzzingRef.current) {
      // Only stop our own buzz, so pulse bursts aren't cut short
      stopBuzz();
      isContinuousBuzzingRef.current = false;
    }
  }, [
    currentHeading,
    targetBearing,
    isNavigating,
    hapticEnabled,
    hapticStyle,
    startBuzz,
    stopBuzz,
  ]);

  // Cleanup
  useEffect(() => {
    return () => {
      isLoopRunningRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
}
