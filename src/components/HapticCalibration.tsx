import React, { useState, useEffect, useRef } from "react";
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

// Shortest signed difference target - current, in [-180, 180]
const shortestDiff = (target: number, current: number) => {
  let diff = normalizeAngle(target) - normalizeAngle(current);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
};

const HapticCalibration: React.FC<HapticCalibrationProps> = ({ onContinue }) => {
  const [hapticDelay, setHapticDelay] = useState(2.0);

  // Relative heading in degrees (0 = “forward”)
  const [heading, setHeading] = useState(0);

  // Refs so we can smooth without re-registering listeners
  const baseHeadingRef = useRef<number | null>(null);
  const smoothedAbsoluteRef = useRef<number | null>(null);

  const targetAngle = 0;      // “correct” direction in relative space
  const coneAngle = 60;       // width of the torch cone in degrees
  const alignThreshold = 20;  // how close you have to be to count as “aligned”

  // === Device orientation → smoothed relative heading ===
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      let absoluteHeading: number | null = null;
      const anyEvent = event as any;

      // iOS specific
      if (typeof anyEvent.webkitCompassHeading === "number") {
        absoluteHeading = anyEvent.webkitCompassHeading; // 0 = North, clockwise
      } else if (event.alpha != null) {
        // Fallback: alpha is [0, 360), but device-dependent; invert to feel like a compass
        absoluteHeading = 360 - event.alpha;
      }

      if (absoluteHeading == null) return;
      absoluteHeading = normalizeAngle(absoluteHeading);

      // Initialize baseline on first valid reading
      if (baseHeadingRef.current == null) {
        baseHeadingRef.current = absoluteHeading;
      }

      // Smooth ABSOLUTE heading to avoid 0/360 jumps
      if (smoothedAbsoluteRef.current == null) {
        smoothedAbsoluteRef.current = absoluteHeading;
      } else {
        const diff = shortestDiff(absoluteHeading, smoothedAbsoluteRef.current);
        const smoothing = 0.2; // lower = smoother
        smoothedAbsoluteRef.current =
          smoothedAbsoluteRef.current + diff * smoothing;
        smoothedAbsoluteRef.current = normalizeAngle(smoothedAbsoluteRef.current);
      }

      const base = baseHeadingRef.current!;
      const relative = normalizeAngle(smoothedAbsoluteRef.current! - base);
      setHeading(relative);
    };

    // Request permission on iOS
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

  // === Haptics: stronger when you are further from the target ===
  useEffect(() => {
    if (!navigator.vibrate) return;

    const angleDiff = Math.abs(
      ((targetAngle - heading + 180) % 360) - 180
    );

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

  // Torch rotation: if it feels flipped on device, change to -heading
  const torchRotation = heading;

  // Colors: use theme primary for cyan, turn green when well aligned
  const baseTorchColor = "hsl(var(--primary))";            // cyan / sky blue
  const alignedTorchColor = "hsl(142, 76%, 45%)";          // pleasant green

  const angleDiffForColor = Math.abs(
    ((targetAngle - heading + 180) % 360) - 180
  );
  const torchColor =
    angleDiffForColor <= alignThreshold ? alignedTorchColor : baseTorchColor;

  // Geometry for the cone + arcs
  const radius = 90;
  const center = { x: 100, y: 100 };
  const startAngle = (-coneAngle / 2) * (Math.PI / 180);
  const endAngle = (coneAngle / 2) * (Math.PI / 180);

  const startX = center.x + radius * Math.sin(startAngle);
  const startY = center.y - radius * Math.cos(startAngle);
  const endX = center.x + radius * Math.sin(endAngle);
  const endY = center.y - radius * Math.cos(endAngle);

  const largeArcFlag = coneAngle > 180 ? 1 : 0;

  // Torch cone path (will be rotated)
  const conePath = `
    M ${center.x} ${center.y}
    L ${startX} ${startY}
    A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}
    Z
  `;

  // Torch outer arc (rotated with cone)
  const arcPath = `
    M ${startX} ${startY}
    A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}
  `;

  // STATIC target arc at the “correct” direction (top of circle)
  const staticArcPath = arcPath; // same segment, but NOT inside rotated group

  return (
    <div className="fixed inset-0 bg-background z-[3000] flex flex-col items-center justify-between p-8 bg-neutral-900">
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

            {/* Static target arc at the top (user aligns torch with this) */}
            <path
              d={staticArcPath}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={4}
              strokeLinecap="round"
              fill="none"
            />

            {/* Center dot */}
            <circle
              cx={center.x}
              cy={center.y}
              r={6}
              fill={torchColor}
            />

            {/* Rotating torch (cone + bright arc) */}
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
              {/* Outer arc of the cone */}
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
          Slowly rotate on the spot. Line up the moving cone with the static
          arc at the top of the circle. When aligned, the cone turns green and
          vibrations become calmer.
        </p>
      </div>

      {/* Controls */}
      <div className="w-full max-w-md space-y-8 bg-neutral-900">
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