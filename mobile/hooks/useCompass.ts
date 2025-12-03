import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

export function useCompass() {
  const [heading, setHeading] = useState(0);
  const [subscription, setSubscription] = useState<Location.LocationSubscription | null>(null);

  useEffect(() => {
    _subscribe();
    return () => _unsubscribe();
  }, []);

  const _subscribe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const sub = await Location.watchHeadingAsync((obj) => {
      const { magHeading } = obj;
      setHeading(magHeading);
    });
    setSubscription(sub);
  };

  const _unsubscribe = () => {
    subscription && subscription.remove();
    setSubscription(null);
  };

  return heading;
}
