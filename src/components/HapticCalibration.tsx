import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface HapticCalibrationProps {
  onContinue: (delay: number) => void;
}

// Normalize angle to [0, 360)
const normalizeAngle = (angle: number) => {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
};

const HapticCalibration: React.FC<HapticCalibrationProps> = ({
  onContinue,
}) => {
  const [hapticDelay, setHapticDelay] = useState(2.0);

  // Relative heading (0° = forward)
  const [heading, setHeading] = useState(0);
  const [baseHeading, setBaseHeading] = useState<number | null>(null);

  const targetAngle = 0;      // “correct” direction in relative space
  const coneAngle = 60;       // width of the torch cone (degrees)
  const alignThreshold = 20;  // inside this = “good direction”

  // Device orientation → smooth relative heading
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      let absoluteHeading: number | null = null;
      const anyEvent = event as any;

      // iOS: webkitCompassHeading (0 = North, clockwise)
      if (typeof anyEvent.webkitCompassHeading === "number") {
        absoluteHeading = anyEvent.webkitCompassHeading;
      } else if (event.alpha != null) {
        // Fallback: alpha in [0, 360], invert to get compass-like behaviour
        absoluteHeading = 360 - event.alpha;
      }

      if (absoluteHeading == null) return;
      absoluteHeading = normalizeAngle(absoluteHeading);

      setBaseHeading((prev) => prev ?? absoluteHeading);
      const base = baseHeading ?? absoluteHeading;

      const rawRelative = normalizeAngle(absoluteHeading - base);

      // Smooth toward new heading
      setHeading((current) => {
        const target = rawRelative;

        let diff = normalizeAngle(target - current);
        if (diff > 180) diff -= 360; // shortest path

        const smoothing = 0.2; // 0–1, lower = smoother
        const next = current + diff * smoothing;
        return normalizeAngle(next);
      });
    };

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

  // Haptics: vibrate when we are outside the “good” cone
  useEffect(() => {
    if (!navigator.vibrate) return;

    const angleDiff = Math.abs(
      ((targetAngle - heading + 180) % 360) - 180
    ); // shortest distance

    if (angleDiff <= alignThreshold) return;

    const intensity = Math.min(angleDiff / 180, 1);
    const vibrationPattern = Math.floor(100 + intensity * 200);

    const interval = setInterval(() => {
      navigator.vibrate([vibrationPattern, 100, vibrationPattern * 0.5]);
    }, hapticDelay * 1000);

    return () => clearInterval(interval);
  }, [heading, targetAngle, hapticDelay, alignThreshold]);

  const handleContinue = () => {
    onContinue(hapticDelay);
  };

  // This is how much we rotate the torch around the circle.
  // If the direction feels flipped on device, change this to `-heading`.
  const torchRotation = heading;

  // Visual colours
  const baseColor = "hsl(210, 100%, 65%)";   // blue torch
  const alignedColor = "hsl(142, 76%, 45%)"; // green when aligned

  const angleDiffForColor = Math.abs(
    ((targetAngle - heading + 180) % 360) - 180
  );
  const torchColor =
    angleDiffForColor <= alignThreshold ? alignedColor : baseColor;

  // Some geometry helpers for the cone
  const radius = 90;
  const center = { x: 100, y: 100 };
  const startAngle = (-coneAngle / 2) * (Math.PI / 180);
  const endAngle = (coneAngle / 2) * (Math.PI / 180);

  const startX = center.x + radius * Math.sin(startAngle);
  const startY = center.y - radius * Math.cos(startAngle);
  const endX = center.x + radius * Math.sin(endAngle);
  const endY = center.y - radius * Math.cos(endAngle);

  const largeArcFlag = coneAngle > 180 ? 1 : 0;

  const conePath = `
    M ${center.x} ${center.y}
    L ${startX} ${startY}
    A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}
    Z
  `;

  const arcPath = `
    M ${startX} ${startY}
    A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}
  `;

  return (
    <div className="fixed inset-0 bg-background z-[3000] flex flex-col items-center justify-between p-8">
      {/* Torch visualization */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative w-72 h-72 mb-12">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
            {/* Outer circle */}
            <circle
              cx={center.x}
              cy={center.y}
              r={radius}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={3}
            />

            {/* Center dot (static) */}
            <circle
              cx={center.x}
              cy={center.y}
              r={6}
              fill={torchColor}
            />

            {/* Rotating torch group */}
            <g
              style={{
                transform: `rotate(${torchRotation}deg)`,
                transformOrigin: `${center.x}px ${center.y}px`,
                transition: "transform 0.15s linear",
              }}
            >
              {/* Cone fill */}
              <path
                d={conePath}
                fill={torchColor}
                opacity={0.25}
              />
              {/* Outer arc */}
              <path
                d={arcPath}
                stroke={torchColor}
                strokeWidth={6}
                strokeLinecap="round"
                fill="none"
              />
            </g>
          </svg>
        </div>

        <p className="text-center text-muted-foreground max-w-xs mb-8">
          Rotate slowly on the spot. The torch should follow your heading
          smoothly. When it lines up with the correct direction, it turns green
          and haptics become calmer.
        </p>
      </div>

      {/* Controls */}
      <div className="w-full max-w-md space-y-8">
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