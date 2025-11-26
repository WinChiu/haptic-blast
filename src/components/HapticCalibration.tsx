import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface HapticCalibrationProps {
  onContinue: (delay: number) => void;
  targetAngle: number; // Bearing to destination in degrees
}

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

const HapticCalibration: React.FC<HapticCalibrationProps> = ({ onContinue, targetAngle }) => {
  const [hapticDelay, setHapticDelay] = useState(2.0);
  const [absoluteHeading, setAbsoluteHeading] = useState<number | null>(null);

  // Refs for orientation smoothing
  const baselineRef = useRef<number | null>(null);
  const prevAbsRef = useRef<number | null>(null);
  const continuousHeadingRef = useRef<number>(0);

  // Device orientation → smooth continuous heading
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const anyEvent = event as any;
      let absoluteHeading: number | null = null;

      // iOS-specific heading
      if (typeof anyEvent.webkitCompassHeading === "number") {
        absoluteHeading = anyEvent.webkitCompassHeading; // 0 = North, clockwise
      } else if (event.alpha != null) {
        // Fallback: alpha [0, 360), invert to behave like a compass
        absoluteHeading = 360 - event.alpha;
      }

      if (absoluteHeading == null) return;
      absoluteHeading = normalizeAngle(absoluteHeading);

      if (prevAbsRef.current == null) {
        prevAbsRef.current = absoluteHeading;
        continuousHeadingRef.current = absoluteHeading;
        setAbsoluteHeading(absoluteHeading);
        return;
      }

      // Handle wrap-around smoothly
      const diff = shortestDiff(absoluteHeading, prevAbsRef.current);
      continuousHeadingRef.current += diff;
      prevAbsRef.current = absoluteHeading;

      setAbsoluteHeading(continuousHeadingRef.current);
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
  }, []);

  // Haptic feedback based on direction error
  useEffect(() => {
    if (!navigator.vibrate || absoluteHeading === null) return;

    const angleDiff = Math.abs(shortestDiff(targetAngle, absoluteHeading));

    // Only vibrate if not aligned
    if (angleDiff <= 15) {
      return;
    }

    const interval = setInterval(() => {
      const intensity = Math.min(angleDiff / 180, 1);
      const vibrationPattern = Math.floor(80 + intensity * 220);
      navigator.vibrate([vibrationPattern, 80, vibrationPattern * 0.5]);
    }, hapticDelay * 1000);

    return () => clearInterval(interval);
  }, [absoluteHeading, targetAngle, hapticDelay]);

  const handleContinue = () => {
    onContinue(hapticDelay);
  };

  // Visual parameters
  const coneWidth = 60; // degrees of cone opening
  const isAligned = absoluteHeading !== null && Math.abs(shortestDiff(targetAngle, absoluteHeading)) <= 10;
  
  // Rotate torch to show device heading, rotate target arc to show destination
  const torchRotation = absoluteHeading ?? 0;
  const targetRotation = targetAngle;

  // Colors
  const staticArcColor = "hsl(215, 15%, 35%)"; // muted neutral
  const torchInactiveFill = "hsla(215, 95%, 62%, 0.25)"; // muted sky-ish
  const torchInactiveStroke = "hsla(215, 15%, 60%, 0.7)";
  const torchActiveFill = "hsla(204, 88%, 53%, 0.45)"; // tailwind sky-500-ish
  const torchActiveStroke = "hsl(204, 88%, 53%)";

  const torchFill = isAligned ? torchActiveFill : torchInactiveFill;
  const torchStroke = isAligned ? torchActiveStroke : torchInactiveStroke;
  const circleStroke = isAligned ? "hsl(204, 88%, 53%)" : "hsl(215, 15%, 40%)";

  // Precompute arc endpoints for top static arc & cone
  const radius = 90;
  const centerX = 100;
  const centerY = 100;
  const topY = 10;
  const half = (coneWidth / 2) * (Math.PI / 180);

  // Arc endpoints on top outer circle for +/- half angle
  const rightX = centerX + radius * Math.sin(half);
  const rightY = topY + radius * (1 - Math.cos(half));
  const leftX = centerX - radius * Math.sin(half);
  const leftY = rightY;

  return (
    <div className="fixed inset-0 bg-neutral-900 z-[3000] flex flex-col items-center justify-between p-8">
      {/* Compass and cone visualization */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative w-72 h-72 mb-12">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
            {/* Outer circle */}
            <circle
              cx={centerX}
              cy={centerY}
              r={radius}
              fill="none"
              stroke={circleStroke}
              strokeWidth={3}
            />

            {/* Target arc - rotates to show destination direction */}
            <g
              transform={`rotate(${targetRotation} ${centerX} ${centerY})`}
              style={{ transition: "transform 0.3s ease-out" }}
            >
              <path
                d={`
                  M ${leftX} ${leftY}
                  A ${radius} ${radius} 0 0 1 ${rightX} ${rightY}
                `}
                fill="none"
                stroke={isAligned ? torchActiveStroke : staticArcColor}
                strokeWidth={8}
                strokeLinecap="round"
              />
            </g>

            {/* Torch cone group – rotates with heading */}
            <g
              transform={`rotate(${torchRotation} ${centerX} ${centerY})`}
              style={{ transition: "transform 0.18s ease-out" }}
            >
              {/* Cone wedge */}
              <path
                d={`
                  M ${centerX} ${centerY}
                  L ${centerX - radius * Math.sin(half)} ${topY + radius * (1 - Math.cos(half))}
                  A ${radius} ${radius} 0 0 1 ${centerX + radius * Math.sin(half)} ${topY + radius * (1 - Math.cos(half))}
                  Z
                `}
                fill={torchFill}
                stroke={torchStroke}
                strokeWidth={1.5}
              />
            </g>
          </svg>
        </div>

        {/* Instruction text */}
        <p className="text-center text-muted-foreground max-w-xs mb-8">
          Rotate your phone until the cone lines up with the top arc. When it
          glows blue, you are facing the correct direction.
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
              {hapticDelay.toFixed(1)}s
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