import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface HapticCalibrationProps {
  onContinue: (delay: number) => void;
}

// Normalize to [0, 360)
const normalizeAngle = (angle: number) => {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
};

const HapticCalibration: React.FC<HapticCalibrationProps> = ({
  onContinue,
}) => {
  const [hapticDelay, setHapticDelay] = useState(2.0);

  // This is the *relative* heading: 0° = "forward" (initial orientation)
  const [heading, setHeading] = useState(0);

  // Store the first absolute heading we see as "base"
  const [baseHeading, setBaseHeading] = useState<number | null>(null);

  // Target is "straight ahead" (0° in this relative frame)
  const targetAngle = 0;
  const coneAngle = 30; // ±15° around target

  // Device orientation → smooth relative heading
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      let absoluteHeading: number | null = null;
      const anyEvent = event as any;

      // iOS Safari: webkitCompassHeading (0 = North, increases clockwise)
      if (typeof anyEvent.webkitCompassHeading === "number") {
        absoluteHeading = anyEvent.webkitCompassHeading;
      } else if (event.alpha != null) {
        // Fallback: alpha is rotation around Z-axis (0–360)
        // We invert it to roughly match compass direction
        absoluteHeading = 360 - event.alpha;
      }

      if (absoluteHeading == null) return;
      absoluteHeading = normalizeAngle(absoluteHeading);

      // On first reading, set the current direction as "forward"
      setBaseHeading((prevBase) => prevBase ?? absoluteHeading);

      const base = baseHeading ?? absoluteHeading;
      const rawRelative = normalizeAngle(absoluteHeading - base);

      // Smooth movement so it doesn’t jump/spin
      setHeading((current) => {
        const target = rawRelative;

        // shortest signed difference in (-180, 180]
        let diff = normalizeAngle(target - current);
        if (diff > 180) diff -= 360;

        const smoothing = 0.2; // lower = smoother, higher = more reactive
        const next = current + diff * smoothing;
        return normalizeAngle(next);
      });
    };

    // iOS permission flow
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
  }, [baseHeading]);

  // Haptics: vibrate when outside cone
  useEffect(() => {
    if (!navigator.vibrate) return;

    const angleDiff = Math.abs(
      ((targetAngle - heading + 180) % 360) - 180
    ); // shortest angular distance

    if (angleDiff <= coneAngle / 2) return;

    const intensity = Math.min(angleDiff / 180, 1);
    const vibrationPattern = Math.floor(100 + intensity * 200);

    const interval = setInterval(() => {
      navigator.vibrate([vibrationPattern, 100, vibrationPattern * 0.5]);
    }, hapticDelay * 1000);

    return () => clearInterval(interval);
  }, [heading, targetAngle, hapticDelay, coneAngle]);

  const handleContinue = () => {
    onContinue(hapticDelay);
  };

  // Pointer rotation: relative heading around the circle
  // If this feels inverted on device, flip the sign: -heading instead of heading
  const pointerRotation = heading;

  return (
    <div className="fixed inset-0 bg-background z-[3000] flex flex-col items-center justify-between p-8">
      {/* Compass + cone */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative w-72 h-72 mb-12">
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

            {/* Acceptance cone (top) */}
            {/* right side arc */}
            <path
              d={`M 100 10 A 90 90 0 0 1 ${
                100 + 90 * Math.sin((coneAngle / 2) * Math.PI / 180)
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
            {/* left side arc */}
            <path
              d={`M 100 10 A 90 90 0 0 0 ${
                100 - 90 * Math.sin((coneAngle / 2) * Math.PI / 180)
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

          {/* Moving dot */}
          <div
            className="absolute inset-0 flex items-center justify-center transition-transform duration-150"
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
          Turn slowly on the spot. The dot should move smoothly around the
          circle as you rotate, and haptic feedback indicates when you are
          outside the correct cone.
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