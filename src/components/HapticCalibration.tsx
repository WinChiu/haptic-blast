import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface HapticCalibrationProps {
  onContinue: (delay: number) => void;
}

const HapticCalibration: React.FC<HapticCalibrationProps> = ({ onContinue }) => {
  const [hapticDelay, setHapticDelay] = useState(2.0);
  const [heading, setHeading] = useState(0);
  const [targetAngle, setTargetAngle] = useState(0);

  // Get device orientation for demo
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null) {
        setHeading(360 - event.alpha);
      }
    };

    // Request permission for iOS devices
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission()
        .then((response: string) => {
          if (response === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  // Demo haptic feedback
  useEffect(() => {
    if (!navigator.vibrate) return;

    const angleDiff = Math.abs(((targetAngle - heading + 180) % 360) - 180);
    
    // Only vibrate if not aligned
    if (angleDiff > 15) {
      const interval = setInterval(() => {
        const intensity = Math.min(angleDiff / 180, 1);
        const vibrationPattern = Math.floor(100 + intensity * 200);
        navigator.vibrate([vibrationPattern, 100, vibrationPattern * 0.5]);
      }, hapticDelay * 1000);

      return () => clearInterval(interval);
    }
  }, [heading, targetAngle, hapticDelay]);

  const handleContinue = () => {
    onContinue(hapticDelay);
  };

  const coneAngle = 30; // Degrees of the acceptable direction cone
  const pointerRotation = targetAngle - heading;

  return (
    <div className="fixed inset-0 bg-background z-[3000] flex flex-col items-center justify-between p-8">
      {/* Compass and cone visualization */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative w-72 h-72 mb-12">
          {/* Background circle */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
            {/* Outer circle */}
            <circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="3"
            />
            
            {/* Acceptance cone (green arc at top) */}
            <path
              d={`M 100 10 A 90 90 0 0 1 ${100 + 90 * Math.sin((coneAngle / 2) * Math.PI / 180)} ${10 + 90 * (1 - Math.cos((coneAngle / 2) * Math.PI / 180))}`}
              fill="none"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth="6"
              strokeLinecap="round"
              style={{ transform: 'rotate(-15deg)', transformOrigin: '100px 100px' }}
            />
            <path
              d={`M 100 10 A 90 90 0 0 0 ${100 - 90 * Math.sin((coneAngle / 2) * Math.PI / 180)} ${10 + 90 * (1 - Math.cos((coneAngle / 2) * Math.PI / 180))}`}
              fill="none"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth="6"
              strokeLinecap="round"
              style={{ transform: 'rotate(15deg)', transformOrigin: '100px 100px' }}
            />

            {/* Direction cone fill (semi-transparent) */}
            <path
              d={`
                M 100 100
                L 100 10
                A 90 90 0 0 1 ${100 + 90 * Math.sin((coneAngle / 2) * Math.PI / 180)} ${10 + 90 * (1 - Math.cos((coneAngle / 2) * Math.PI / 180))}
                Z
              `}
              fill="hsl(142, 76%, 36%)"
              opacity="0.2"
            />
            <path
              d={`
                M 100 100
                L 100 10
                A 90 90 0 0 0 ${100 - 90 * Math.sin((coneAngle / 2) * Math.PI / 180)} ${10 + 90 * (1 - Math.cos((coneAngle / 2) * Math.PI / 180))}
                Z
              `}
              fill="hsl(142, 76%, 36%)"
              opacity="0.2"
            />
          </svg>

          {/* Direction pointer (rotates with device) */}
          <div 
            className="absolute inset-0 flex items-center justify-center transition-transform duration-200"
            style={{ transform: `rotate(${pointerRotation}deg)` }}
          >
            <div className="absolute top-0 w-4 h-4 bg-[hsl(142,76%,36%)] rounded-full"
              style={{
                boxShadow: '0 0 20px hsl(142, 76%, 36%)',
                top: '8px'
              }}
            />
          </div>
        </div>

        {/* Instruction text */}
        <p className="text-center text-muted-foreground max-w-xs mb-8">
          You will feel a specific vibration signal to indicate the correct direction.
        </p>
      </div>

      {/* Controls */}
      <div className="w-full max-w-md space-y-8">
        {/* Haptic Delay Slider */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Haptic Delay</label>
            <span className="text-sm text-muted-foreground">{hapticDelay.toFixed(1)}</span>
          </div>
          <Slider
            value={[hapticDelay]}
            onValueChange={(value) => setHapticDelay(value[0])}
            min={0.5}
            max={5.0}
            step={0.1}
            className="w-full"
          />
        </div>

        {/* Continue button */}
        <Button 
          onClick={handleContinue}
          className="w-full h-12 rounded-full text-base font-medium"
          size="lg"
        >
          CONTINUE
        </Button>
      </div>
    </div>
  );
};

export default HapticCalibration;
