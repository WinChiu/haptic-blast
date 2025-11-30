import { useState, useEffect } from 'react';
import { Magnetometer } from 'expo-sensors';

export function useCompass() {
  const [heading, setHeading] = useState(0);
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    _subscribe();
    return () => _unsubscribe();
  }, []);

  const _subscribe = async () => {
    const { status } = await Magnetometer.requestPermissionsAsync();
    if (status !== 'granted') return;

    Magnetometer.setUpdateInterval(20);
    setSubscription(
      Magnetometer.addListener((data) => {
        const { x, y } = data;
        let angle = Math.atan2(y, x) * (180 / Math.PI);
        angle = angle >= 0 ? angle : angle + 360;
        setHeading(angle);
      })
    );
  };

  const _unsubscribe = () => {
    subscription && subscription.remove();
    setSubscription(null);
  };

  return heading;
}
