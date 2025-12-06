import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';

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

export function useHapticGuidance(
  currentHeading: number,
  targetBearing: number,
  isActive: boolean
) {
  const [isVibrating, setIsVibrating] = useState(false);

  // Refs to hold mutable values accessible by the loop without triggering re-renders or cleanup
  const shouldVibrateRef = useRef<boolean>(false);
  const isLoopRunningRef = useRef<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const strengthRef = useRef(0);

  // Fixed vibration frequency
  const MAX_INTERVAL = 800;
  const MIN_INTERVAL = 150;
  const STEP = 15;

  // Calculate strength based on heading and target
  const calculateStrength = () => {
    const angleDiff = Math.abs(shortestDiff(targetBearing, currentHeading));
    return Math.max(0, (angleDiff - 15) / (180 - 15));
  };

  // Update strength ref without triggering loop restart
  useEffect(() => {
    strengthRef.current = calculateStrength();
  }, [currentHeading, targetBearing]);

  // 1. Update vibration state based on alignment
  useEffect(() => {
    const angleDiff = Math.abs(shortestDiff(targetBearing, currentHeading));
    const isAligned = angleDiff <= 25;

    // Determine if we should be vibrating
    const shouldVibrate = isActive && !isAligned;
    shouldVibrateRef.current = shouldVibrate;

    // If we should vibrate and loop isn't running, start it
    if (shouldVibrate && !isLoopRunningRef.current) {
      startVibrationLoop();
    } else if (!shouldVibrate && isLoopRunningRef.current) {
      isLoopRunningRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, [isActive, currentHeading, targetBearing]);

  // 2. The Vibration Loop with constant frequency
  const startVibrationLoop = () => {
    isLoopRunningRef.current = true;

    const loop = () => {
      if (!shouldVibrateRef.current) {
        isLoopRunningRef.current = false;
        setIsVibrating(false);
        return;
      }

      // Use current strength without recalculating
      const strength = strengthRef.current;

      // Map into three gradual steps: Light, Medium, Heavy
      let hapticType: Haptics.ImpactFeedbackStyle =
        Haptics.ImpactFeedbackStyle.Light;
      if (strength > 0.66) {
        hapticType = Haptics.ImpactFeedbackStyle.Heavy;
      } else if (strength > 0.33) {
        hapticType = Haptics.ImpactFeedbackStyle.Medium;
      } else {
        hapticType = Haptics.ImpactFeedbackStyle.Light;
      }

      setIsVibrating(true);
      // Single impact call per cycle
      Haptics.impactAsync(hapticType);
      setTimeout(() => setIsVibrating(false), 50);
      // Re-run the loop with fixed interval
      timeoutRef.current = setTimeout(
        loop,
        Math.round(((1 - strength) * (MAX_INTERVAL - MIN_INTERVAL)) / STEP) *
          STEP +
          MIN_INTERVAL
      );
    };

    // Start immediately
    loop();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldVibrateRef.current = false; // Stop loop logic
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return isVibrating;
}
