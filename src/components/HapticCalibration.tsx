import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface HapticCalibrationProps {
  onContinue: (delay: number) => void;
}

// Helper to normalize angles to [0, 360)
const normalizeAngle = (angle: number) => {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
};

const HapticCalibration: React.FC<HapticCalibrationProps> = ({
  onContinue,
}) => {
  const [hapticDelay, setHapticDelay] = useState(2.0);
  const [heading, setHeading] = useState(0); // smoothed compass-like heading
  const [targetAngle] = useState(0); // 0° = "forward" / reference direction

  // Device orientation → heading (in degrees, 0–360, 0 ≈ North)
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      let rawHeading: number | null = null;
      const anyEvent = event as any;

      // iOS Safari provides webkitCompassHeading (0 = North, clockwise)
      if (typeof anyEvent.webkitCompassHeading === "number") {
        rawHeading = anyEvent.webkitCompassHeading;
      } else if (event.alpha != null) {
        // Fallback: use alpha, try to interpret as compass-ish
        // alpha is rotation around Z-axis (0–360), 0 is device "facing" some reference.
        // We invert to roughly align with compass-like heading.
        rawHeading = 360 - event.alpha;
      }

      if (rawHeading == null) return;

      rawHeading = normalizeAngle(rawHeading);

      // Smooth the heading to avoid jitter and wild spins
      setHeading((prev) => {
        const current = prev;
        const target = rawHeading;

        // Compute shortest signed difference
        let diff = normalizeAngle(target - current);
        if (diff > 180) diff -= 360; // now diff in (-180, 180]

        const smoothing = 0.2; // 0 = no movement, 1 = jump immediately
        const next = current + diff * smoothing;
        return normalizeAngle(next);
      });
    };

    // iOS: need explicit permission
    if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
      (DeviceOrientationEvent as any)
        .requestPermission()
        .then((response: string) => {
          if (response === "granted") {
            window.addEventListener("deviceorientation", handleOrientation);
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener("deviceorientation", handleOrientation);
    }

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, []);

  // Demo haptic feedback (based on angle error)
  useEffect(() => {
    if (!navigator.vibrate) return;

    const angleDiff = Math.abs(
      ((targetAngle - heading + 180) % 360) - 180
    ); // shortest distance

    if (angleDiff <= 15) return;

    const intensity = Math.min(angleDiff / 180, 1);
    const vibrationPattern = Math.floor(100 + intensity * 200);

    const interval = setInterval(() => {
      navigator.vibrate([vibrationPattern, 100, vibrationPattern * 0.5]);
    }, hapticDelay * 1000);

    return () => clearInterval(interval);
  }, [heading, targetAngle, hapticDelay]);

  const handleContinue = () => {
    onContinue(hapticDelay);
  };

  const coneAngle = 30; // Acceptable cone around target direction
  const pointerRotation = targetAngle - heading; // rotate pointer relative to heading

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

            {/* Acceptance cone arcs */}
            <path
              d={`M 100 10 A 90 90 0 0 1 ${
                100 +
                90 * Math.sin((coneAngle / 2) * Math.PI / 180)
              } ${
                10 +
                90 * (1 - Math.cos((coneAngle / 2) * Math.PI / 180))
              }`}
              fill="none"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth="6"
              strokeLinecap="round"
              style={{
                transform: "rotate(-15deg)",
                transformOrigin: "100px 100px",
              }}
            />
            <path
              d={`M 100 10 A 90 90 0 0 0 ${
                100 -
                90 * Math.sin((coneAngle / 2) * Math.PI / 180)
              } ${
                10 +
                90 * (1 - Math.cos((coneAngle / 2) * Math.PI / 180))
              }`}
              fill="none"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth="6"
              strokeLinecap="round"
              style={{
                transform: "rotate(15deg)",
                transformOrigin: "100px 100px",
              }}
            />

            {/* Cone fill */}
            <path
              d={`
                M 100 100
                L 100 10
                A 90 90 0 0 1 ${
                  100 +
                  90 * Math.sin((coneAngle / 2) * Math.PI / 180)
                } ${
                  10 +
                  90 * (1 - Math.cos((coneAngle / 2) * Math.PI / 180))
                }
                Z
              `}
              fill="hsl(142, 76%, 36%)"
              opacity="0.2"
            />
            <path
              d={`
                M 100 100
                L 100 10
                A 90 90 0 0 0 ${
                  100 -
                  90 * Math.sin((coneAngle / 2) * Math.PI / 180)
                } ${
                  10 +
                  90 * (1 - Math.cos((coneAngle / 2) * Math.PI / 180))
                }
                Z
              `}
              fill="hsl(142, 76%, 36%)"
              opacity="0.2"
            />
          </svg>

          {/* Direction pointer */}
          <div
            className="absolute inset-0 flex items-center justify-center transition-transform duration-200"
            style={{ transform: `rotate(${pointerRotation}deg)` }}
          >
            <div
              className="absolute w-4 h-4 bg-[hsl(142,76%,36%)] rounded-full"
              style={{
                top: "8px",
                boxShadow: "0 0 20px hsl(142, 76%, 36%)",
              }}
            />
          </div>
        </div>

        <p className="text-center text-muted-foreground max-w-xs mb-8">
          You will feel a specific vibration signal to indicate the correct
          direction.
        </p>
      </div>

      {/* Controls */}
      <div className="w-full max-w-md space-y-8">
        {/* Haptic Delay Slider */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              Haptic Delay
            </label>
            <span className="text-sm text-muted-foreground">
              {hapticDelay.toFixed(1)} s
            </span>
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