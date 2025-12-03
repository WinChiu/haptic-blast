import { useEffect, useRef, useCallback, useState } from 'react';
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

export function useSoundGuidance(
  currentHeading: number,
  targetBearing: number,
  isActive: boolean
) {
//   console.log('useSoundGuidance hook initialized');
  
  const intervalRef = useRef<number>(1000);
  const shouldSoundRef = useRef<boolean>(false);
  const isLoopRunningRef = useRef<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  console.log('isLoaded state:', isLoaded);

  // Load audio on mount
  useEffect(() => {
    let mounted = true;
    
    const loadSound = async () => {
      try {
        console.log('Setting audio mode...');
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        
        console.log('Loading sound file...');
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/beep.mp3'),
          { shouldPlay: false }
        );
        
        console.log('Sound created, checking status...');
        const status = await sound.getStatusAsync();
        console.log('Sound status:', status);
        
        if (mounted) {
          soundRef.current = sound;
          setIsLoaded(true);
          console.log('Sound loaded successfully');
        }
      } catch (error) {
        console.log('Error loading sound:', error);
        console.log('Error details:', JSON.stringify(error));
      }
    };
    
    loadSound();
    
    return () => {
      mounted = false;
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  // Play beep sound
  const playBeep = useCallback(async () => {
    if (!isLoaded || !soundRef.current) {
      console.log('Sound not loaded yet');
      return;
    }
    
    try {
      await soundRef.current.setPositionAsync(0);
      await soundRef.current.playAsync();
      console.log('Sound played');
    } catch (error) {
      console.log('Error playing sound:', error);
    }
  }, [isLoaded]);

  // The Sound Loop
  const startSoundLoop = useCallback(() => {
    console.log('startSoundLoop called');
    isLoopRunningRef.current = true;

    const loop = () => {
      const currentInterval = intervalRef.current;
      console.log('Sound loop iteration, interval:', currentInterval, 'shouldSound:', shouldSoundRef.current);

      // Check if we should still play sound
      if (!shouldSoundRef.current) {
        console.log('Stopping sound loop');
        isLoopRunningRef.current = false;
        return; // Stop the loop
      }

      // Play sound
      playBeep();

      // Schedule next sound using the LATEST interval
      timeoutRef.current = setTimeout(loop, currentInterval);
    };

    // Start immediately
    loop();
  }, [playBeep]);

  // Update refs based on current props/state
  useEffect(() => {
    const angleDiff = Math.abs(shortestDiff(targetBearing, currentHeading));
    const isAligned = angleDiff <= 15;

    // Determine if we should play sound
    const shouldSound = isActive && !isAligned;
    const wasRunning = isLoopRunningRef.current;
    
    // Only log when state changes
    if (shouldSound !== shouldSoundRef.current || (shouldSound && !wasRunning)) {
      console.log('useSoundGuidance state change:', {
        isActive,
        angleDiff,
        isAligned,
        shouldSound,
        wasRunning
      });
    }
    
    shouldSoundRef.current = shouldSound;

    // Calculate interval if we are playing sound
    if (shouldSound) {
      const minInterval = 200; // Max frequency (Closer)
      const maxInterval = 1000; // Min frequency (Further)
      const maxDiff = 180;
      const minDiff = 15;

      // Stepped Frequency Logic
      const stepSize = 15;
      const steppedDiff = Math.floor(angleDiff / stepSize) * stepSize;

      // Linear interpolation based on STEPPED difference
      const ratio = (maxDiff - steppedDiff) / (maxDiff - minDiff);
      const clampedRatio = Math.max(0, Math.min(1, ratio));

      const interval = minInterval + (maxInterval - minInterval) * clampedRatio;
      intervalRef.current = interval;
    }

    // If we should play sound and loop isn't running, start it
    if (shouldSound && !isLoopRunningRef.current) {
      console.log('Starting sound loop');
      startSoundLoop();
    }
  }, [currentHeading, targetBearing, isActive, startSoundLoop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldSoundRef.current = false; // Stop loop logic
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (soundRef.current) {
        soundRef.current.stopAsync();
      }
    };
  }, []);
}
