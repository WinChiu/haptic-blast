import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface HapticCalibrationProps {
  onContinue: (delay: number) => void;
}

// Helper: normalize angle to [0, 360)
const normalize360 = (angle: number) => {
  const a = angle % 360;
  return a < 0 ? a + 360 : a;
};

// Helper: shortest signed difference target - heading in [-180, 180]
const shortestAngleDiff = (target: number, current: number) => {
  let diff = normalize360(target) - normalize360(current);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
};

const HapticCalibration: React.FC<HapticCalibrationProps> = ({ onContinue }) => {
  const [hapticDelay, setHapticDelay] = useState(2.0);
  const [heading, setHeading] = useState(0); // 0° = facing "up"
  const targetAngle = 0; // desired forward direction (top of circle)

  const coneAngle = 30; // total width of "correct" cone
  const coneHalf = coneAngle / 2;

  // --- Device orientation handling (smoothed) ---
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha == null) return;

      // Convert alpha (0 = north, increasing clockwise) to "screen up" reference
      const rawHeading = normalize360(360 - event.alpha); // 0° = top

      // Smooth transitions so it doesn't jump
      setHeading((prev) => {
        const diff = shortestAngleDiff(rawHeading, prev);
        const smoothed = prev + diff * 0.15; // 0.0–1.0: higher = less smoothing
        return normalize360(smoothed);
      });
    };

    // iOS permission request
    const DeviceOrientationAny = DeviceOrientationEvent as any;
    if (typeof DeviceOrientationAny?.requestPermission === "function") {
      DeviceOrientationAny.requestPermission()
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

  // Angle difference between where we point and the target
  const signedDiff = shortestAngleDiff(targetAngle, heading); // [-180, 180]
  const angleDiffAbs = Math.abs(signedDiff);

  const isOnTarget = angleDiffAbs <= coneHalf;
  const isFarOff = angleDiffAbs > coneHalf + 10; // only "shake" when clearly off

  // --- Haptic feedback when clearly off-direction ---
  useEffect(() => {
    if (!navigator.vibrate) return;

    // Don't vibrate if we're roughly on target
    if (!isFarOff) return;

    const intensity = Math.min(angleDiffAbs / 180, 1);
    const vibrationPattern = Math.floor(80 + intensity * 170); // 80–250 ms

    const interval = setInterval(() => {
      // Simple left/right feel by varying pattern length
      navigator.vibrate([vibrationPattern, 100, vibrationPattern]);
    }, hapticDelay * 1000);

    return () => clearInterval(interval);
  }, [angleDiffAbs, isFarOff, hapticDelay]);

  const handleContinue = () => {
    onContinue(hapticDelay);
  };

  // Pointer rotation: we rotate the whole cone by the *negative* heading,
  // so that when heading === targetAngle, the cone points straight up.
  const pointerRotation = -heading;

  const sweepColor = isOnTarget ? "#0EA5E9" : "#4b5563"; // sky vs muted gray
  const circleStroke = isOnTarget ? "#0EA5E9" : "#6b7280";

  return (
    <div className="fixed inset-0 bg-neutral-900 z-[3000] flex flex-col items-center justify-between p-8 text-neutral-100">
      {/* Compass + cone */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div
          className={
            "relative w-72 h-72 mb-12 transition-transform " +
            (isFarOff ? "haptic-shake" : "")
          }
        >
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
            {/* Outer circle */}
            <circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke={circleStroke}
              strokeWidth="3"
            />

            {/* Static arc at top to line up with */}
            <path
              d={`
                M 55 30
                A 70 70 0 0 1 145 30
              `}
              fill="none"
              stroke="#374151"
              strokeWidth="6"
              strokeLinecap="round"
            />

            {/* Rotating cone group */}
            <g
              style={{
                transform: `rotate(${pointerRotation}deg)`,
                transformOrigin: "100px 100px",
                transition: "transform 0.12s linear",
              }}
            >
              {/* Filled cone */}
              <path
                d={`
                  M 100 100
                  L 100 20
                  A 80 80 0 0 1 ${
                    100 +
                    80 * Math.sin((coneHalf * Math.PI) / 180)
                  } ${
                  20 + 80 * (1 - Math.cos((coneHalf * Math.PI) / 180))
                }
                  Z
                `}
                fill={sweepColor}
                opacity={isOnTarget ? 0.3 : 0.18}
              />
              <path
                d={`
                  M 100 100
                  L 100 20
                  A 80 80 0 0 0 ${
                    100 -
                    80 * Math.sin((coneHalf * Math.PI) / 180)
                  } ${
                  20 + 80 * (1 - Math.cos((coneHalf * Math.PI) / 180))
                }
                  Z
                `}
                fill={sweepColor}
                opacity={isOnTarget ? 0.3 : 0.18}
              />

              {/* Outer arc (highlight edge) */}
              <path
                d={`
                  M ${100 - 80 * Math.sin((coneHalf * Math.PI) / 180)} ${
                  20 + 80 * (1 - Math.cos((coneHalf * Math.PI) / 180))
                }
                  A 80 80 0 0 1 ${
                    100 +
                    80 * Math.sin((coneHalf * Math.PI) / 180)
                  } ${
                  20 + 80 * (1 - Math.cos((coneHalf * Math.PI) / 180))
                }
                `}
                fill="none"
                stroke={sweepColor}
                strokeWidth="4"
                strokeLinecap="round"
              />
            </g>
          </svg>
        </div>

        <p className="text-center text-neutral-400 max-w-xs mb-8">
          Rotate your phone until the cone lines up with the top arc. When
          aligned, you&apos;re facing the correct direction.
        </p>
      </div>

      {/* Controls */}
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-neutral-100">
              Haptic Delay
            </label>
            <span className="text-sm text-neutral-400">
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
          className="w-full h-12 rounded-full text-base font-medium bg-sky-500 hover:bg-sky-400 text-white"
          size="lg"
        >
          CONTINUE
        </Button>
      </div>
    </div>
  );
};

export default HapticCalibration;