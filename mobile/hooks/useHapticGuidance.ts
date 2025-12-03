import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

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
  const soundRef = useRef<Audio.Sound | null>(null);

  // Refs to hold mutable values accessible by the loop without triggering re-renders or cleanup
  const intervalRef = useRef<number>(1000);
  const shouldVibrateRef = useRef<boolean>(false);
  const shouldSoundRef = useRef<boolean>(false);
  const isLoopRunningRef = useRef<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Update refs based on current props/state
  useEffect(() => {
    const angleDiff = Math.abs(shortestDiff(targetBearing, currentHeading));
    const isAligned = angleDiff <= 65;

    // Determine if we should be vibrating
    const shouldVibrate = isActive && !isAligned;
    shouldVibrateRef.current = shouldVibrate;

    // Determine if we should play sound
    const shouldSound = isActive && !isAligned;
    shouldSoundRef.current = shouldSound;

    // Calculate interval if we are vibrating
    if (shouldVibrate) {
      const minInterval = 30; // Max frequency (Further) - User set
      const maxInterval = 500; // Min frequency (Closer) - User set
      const maxDiff = 180;
      const minDiff = 15;

      // Stepped Frequency Logic
      // User Request: Change frequency every 15 degrees to prevent jitter.
      // We floor the angleDiff to the nearest multiple of 15.
      const stepSize = 15;
      const steppedDiff = Math.floor(angleDiff / stepSize) * stepSize;

      // Linear interpolation based on STEPPED difference
      const ratio = (maxDiff - steppedDiff) / (maxDiff - minDiff);
      // Clamp ratio to 0-1 just in case
      const clampedRatio = Math.max(0, Math.min(1, ratio));

      const interval = minInterval + (maxInterval - minInterval) * clampedRatio;
      intervalRef.current = interval;
    }

    // If we should vibrate and loop isn't running, start it
    if (shouldVibrate && !isLoopRunningRef.current) {
      startVibrationLoop();
    }
  }, [currentHeading, targetBearing, isActive]);

  // Play beep sound
  const playBeep = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://www.soundjay.com/buttons/sounds/beep-07a.mp3' },
        { shouldPlay: true, volume: 0.5 }
      );
      soundRef.current = sound;
      
      // Unload after playing
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.log('Error playing sound:', error);
    }
  };

  // 2. The Vibration Loop
  const startVibrationLoop = () => {
    isLoopRunningRef.current = true;

    const loop = () => {
      const currentInterval = intervalRef.current;

      // Check if we should still vibrate
      if (!shouldVibrateRef.current) {
        isLoopRunningRef.current = false;
        setIsVibrating(false);
        return; // Stop the loop
      }

      // Dynamic Haptic Style
      // User Suggestion: Use Heavy impact even at high frequency (approx 120ms)
      // to simulate a "continuous buzz" that feels like a strong vibration.
      const style = Haptics.ImpactFeedbackStyle.Heavy;

      // Vibrate
      Haptics.impactAsync(style);
      setIsVibrating(true);
      setTimeout(() => setIsVibrating(false), 100);

      // Play sound if needed
      if (shouldSoundRef.current) {
        playBeep();
      }

      // Schedule next vibration using the LATEST interval
      timeoutRef.current = setTimeout(loop, currentInterval);
    };

    // Start immediately
    loop();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldVibrateRef.current = false; // Stop loop logic
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  return isVibrating;
}
