import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

export function useCompass(gpsHeading?: number | null, speed?: number | null) {
  const [magHeading, setMagHeading] = useState(0);
  const [subscription, setSubscription] =
    useState<Location.LocationSubscription | null>(null);

  useEffect(() => {
    _subscribe();
    return () => _unsubscribe();
  }, []);

  const _subscribe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const sub = await Location.watchHeadingAsync((obj) => {
      const { magHeading } = obj;
      // setMagHeading(magHeading);
      setMagHeading((prev) => {
        // Circular Smoothing (Low-Pass Filter)
        // Calculate shortest difference between angles
        let diff = magHeading - prev;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        // Alpha: 0.1 = very smooth (slow), 0.5 = balanced, 1.0 = no smoothing
        const alpha = 0.1;
        const newHeading = prev + diff * alpha;

        // Normalize to 0-360
        return (newHeading + 360) % 360;
      });
    });
    setSubscription(sub);
  };

  const _unsubscribe = () => {
    subscription && subscription.remove();
    setSubscription(null);
  };

  // Sensor Fusion Logic
  // If speed is > 1 m/s (approx 3.6 km/h) and we have a valid GPS heading, use it.
  // Otherwise fallback to magnetometer.
  if (
    speed &&
    speed > 1 &&
    gpsHeading !== null &&
    gpsHeading !== undefined &&
    gpsHeading >= 0
  ) {
    return gpsHeading;
  }

  return magHeading;
}
