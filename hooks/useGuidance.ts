import { useEffect, useRef, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { GlobalStore } from '../util/globals';
import { addMistakeToRound } from '../util/store';
import { useBuzz, BUZZ_BACKEND } from './useBuzz';
import { useHapticSettings } from '../util/hapticSettings';
import {
  HAPTIC_SHAPE,
  exponentialIntensity,
  planPulse,
  shouldConfirm,
} from '../util/haptics';

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

// Haptics vibrate while off course, stronger the further off (see util/haptics.ts):
// in short pulses (default) or one continuous buzz. Expo Go on iOS has no way to
// buzz, so it falls back to timed taps there.
type HapticStyleNow = 'tap' | 'pulsed' | 'continuous';

// Whether the timed loop has work: sound beeps, or the tap fallback.
// Pulses and the continuous buzz run on their own, see below.
const loopNeeded = (s: {
  hapticEnabled: boolean;
  soundEnabled: boolean;
  hapticStyle: HapticStyleNow;
}) => s.soundEnabled || (s.hapticEnabled && s.hapticStyle === 'tap');

export function useGuidance(
  currentHeading: number,
  targetBearing: number,
  isNavigating: boolean,
  hapticEnabled: boolean,
  soundEnabled: boolean,
  zoneDegrees?: number
) {
  const dispatch = useDispatch();
  const haptics = useHapticSettings();
  // The silent zone in use: the chosen one, or wider when GPS error calls for it
  const zone = Math.max(haptics.deadband, zoneDegrees ?? 0);
  const hapticStyle: HapticStyleNow =
    BUZZ_BACKEND === 'none' ? 'tap' : haptics.mode;
  const rounds = useSelector((state: any) => state.userData.round);
  const userUid = useSelector((state: any) => state.userData.userProfile.Uid);
  
  const isLoopRunningRef = useRef<boolean>(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    deadband: zone,
    hapticStyle,
    settings: { ...haptics, deadband: zone },
  });

  useEffect(() => {
    stateRef.current = {
      heading: currentHeading,
      target: targetBearing,
      isNavigating,
      hapticEnabled,
      soundEnabled,
      deadband: zone,
      hapticStyle,
      settings: { ...haptics, deadband: zone },
    };
  }, [
    currentHeading,
    targetBearing,
    isNavigating,
    hapticEnabled,
    soundEnabled,
    haptics,
    zone,
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
      deadband,
      hapticStyle,
    } = stateRef.current;

    // Check if we should be giving feedback
    if (!isNavigating) return;

    const angleDiff = Math.abs(shortestDiff(target, heading));
    const isAligned = angleDiff <= deadband;

    if (isAligned) return;

    const strength = strengthOf(angleDiff);

    // HAPTIC ACTION: tap fallback only (pulses and the continuous buzz have their own effects)
    if (hapticEnabled && hapticStyle === 'tap') {
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
    const { heading, target, isNavigating, deadband } = stateRef.current;

    // Stop conditions
    if (!isNavigating || !loopNeeded(stateRef.current)) {
      isLoopRunningRef.current = false;
      return;
    }

    const angleDiff = Math.abs(shortestDiff(target, heading));
    const isAligned = angleDiff <= deadband;

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
    const isAligned = angleDiff <= zone;

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
    zone,
    hapticStyle,
  ]);

  // Continuous buzz: follows every heading update instead of the timed loop.
  // Its strength follows the same exponential curve as the pulses.
  useEffect(() => {
    const angleDiff = Math.abs(shortestDiff(targetBearing, currentHeading));
    const shouldBuzz =
      isNavigating &&
      hapticEnabled &&
      hapticStyle === 'continuous' &&
      angleDiff > zone;

    if (shouldBuzz) {
      startBuzz(exponentialIntensity(angleDiff, zone));
      isContinuousBuzzingRef.current = true;
    } else if (isContinuousBuzzingRef.current) {
      stopBuzz();
      isContinuousBuzzingRef.current = false;
    }
  }, [
    currentHeading,
    targetBearing,
    isNavigating,
    hapticEnabled,
    hapticStyle,
    zone,
    startBuzz,
    stopBuzz,
  ]);

  // Pulsed vibration (the default): while off course, one pulse, then a pause
  // that is shorter the further off the phone points; silent on course. A very
  // short, light click confirms the moment the phone lines up. The angle is
  // checked every 50 ms, so lining up cuts a running pulse short and the click
  // comes at once, and the rhythm follows the user as they turn.
  // The loop reads these through refs so that it restarts only when navigation,
  // the haptic switch or the mode changes, never because a function was recreated.
  const pulseRef = useRef(pulseBuzz);
  pulseRef.current = pulseBuzz;
  const stopRef = useRef(stopBuzz);
  stopRef.current = stopBuzz;

  useEffect(() => {
    if (!(isNavigating && hapticEnabled && hapticStyle === 'pulsed')) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let wasOutside = false;
    let nextPulseAt = 0; // when the next pulse may start (after the pause)
    let lastConfirmAt = -Infinity;

    const tick = () => {
      if (cancelled) return;
      const now = Date.now();
      const { heading, target, settings } = stateRef.current;
      const error = Math.abs(shortestDiff(target, heading));
      const plan = planPulse(error, settings);

      if (plan) {
        wasOutside = true;
        if (now >= nextPulseAt) {
          pulseRef.current(plan.amplitude, plan.pulseMs);
          nextPulseAt = now + plan.pulseMs + plan.pauseMs;
        }
      } else {
        // on course: click once when lining up, otherwise just go quiet
        if (shouldConfirm(wasOutside, error, settings.deadband, now - lastConfirmAt)) {
          pulseRef.current(HAPTIC_SHAPE.confirmIntensity, settings.confirmMs);
          lastConfirmAt = now;
        } else if (wasOutside) {
          stopRef.current();
        }
        wasOutside = false;
        nextPulseAt = 0;
      }
      timer = setTimeout(tick, 50);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stopRef.current();
    };
  }, [isNavigating, hapticEnabled, hapticStyle]);

  // Cleanup
  useEffect(() => {
    return () => {
      isLoopRunningRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
}
