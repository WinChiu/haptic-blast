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

// Shortest signed angle difference target - current in [-180, 180]
const shortestDiff = (target: number, current: number) => {
  let diff = normalizeAngle(target) - normalizeAngle(current);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
};

const HapticCalibration: React.FC<HapticCalibrationProps> = ({ onContinue }) => {
  const [hapticDelay, setHapticDelay] = useState(2.0);
  const [heading, setHeading] = useState(0); // continuous relative heading in degrees
  const [targetAngle] = useState(0); // "forward" direction, static arc at top

  // Refs for orientation smoothing
  const baselineRef = useRef<number | null>(null);
  const prevRelRef = useRef<number | null>(null);
  const continuousHeadingRef = useRef<number>(0);

  // Visual parameters
  const coneWidth = 60; // degrees of cone opening (lit area)
  const coneHalf = coneWidth / 2;

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

      // Set baseline on first valid reading
      if (baselineRef.current == null) {
        baselineRef.current = absoluteHeading;
      }
      const baseline = baselineRef.current!;

      // relative raw angle in [0, 360) with 0 = "forward"
      const relRaw = normalizeAngle(absoluteHeading - baseline);

      if (prevRelRef.current == null) {
        prevRelRef.current = relRaw;
        continuousHeadingRef.current = 0;
        setHeading(0);
        return;
      }

      // How much did we really rotate since last frame? (shortest path)
      const diff = shortestDiff(relRaw, prevRelRef.current);
      continuousHeadingRef.current += diff;
      prevRelRef.current = relRaw;

      setHeading(continuousHeadingRef.current);
    };

    // iOS permission dance
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

  // Angle difference between where we point and the target
  const angleDiff = Math.abs(shortestDiff(targetAngle, heading));
  const isInsideCone = angleDiff <= coneHalf;

  // Pure haptics: vibrate phone when OUTSIDE lit cone
  useEffect(() => {
    if (!navigator.vibrate) return;

    // If we are inside the cone, stop any repeating haptics
    if (isInsideCone) {
      navigator.vibrate(0);
      return;
    }

    // Outside cone: intensity depends on how wrong we are
    const intensity = Math.min(angleDiff / 180, 1);
    const vibrationLength = Math.floor(80 + intensity * 220); // 80–300 ms

    const interval = setInterval(() => {
      navigator.vibrate([vibrationLength, 80, vibrationLength * 0.5]);
    }, hapticDelay * 1000);

    return () => clearInterval(interval);
  }, [angleDiff, isInsideCone, hapticDelay]);

  const handleContinue = () => {
    onContinue(hapticDelay);
  };

  const torchRotation = heading; // already correct direction

  // Colors
  const staticArcColor = "hsl(215, 15%, 35%)"; // muted neutral
  const torchInactiveFill = "hsla(215, 15%, 60%, 0.25)"; // muted
  const torchInactiveStroke = "hsla(215, 15%, 60%, 0.9)";
  const torchActiveFill = "hsla(204, 88%, 53%, 0.45)"; // sky-500-ish
  const torchActiveStroke = "hsl(204, 88%, 53%)";

  const torchFill = isInsideCone ? torchActiveFill : torchInactiveFill;
  const torchStroke = isInsideCone ? torchActiveStroke : torchInactiveStroke;
  const circleStroke = isInsideCone ? torchActiveStroke : "hsl(215, 15%, 40%)";

  // Geometry
  const radius = 90;
  const centerX = 100;
  const centerY = 100;
  const topY = 10;
  const half = (coneWidth / 2) * (Math.PI / 180);

  const rightX = centerX + radius * Math.sin(half);
  const rightY = topY + radius * (1 - Math.cos(half));
  const leftX = centerX - radius * Math.sin(half);
  const leftY = rightY;

  const largeArcFlag = coneWidth > 180 ? 1 : 0;

  // Static target arc at top
  const staticArcPath = `
    M ${leftX} ${leftY}
    A ${radius} ${radius} 0 ${largeArcFlag} 1 ${rightX} ${rightY}
  `;

  // Torch cone paths
  const conePath = `
    M ${centerX} ${centerY}
    L ${leftX} ${leftY}
    A ${radius} ${radius} 0 ${largeArcFlag} 1 ${rightX} ${rightY}
    Z
  `;

  const arcPath = `
    M ${leftX} ${leftY}
    A ${radius} ${radius} 0 ${largeArcFlag} 1 ${rightX} ${rightY}
  `;

  return (
    <div className="fixed inset-0 bg-neutral-900 z-[3000] flex flex-col items-center justify-between p-8 text-neutral-100">
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

            {/* Static arc at top (desired direction) */}
            <path
              d={staticArcPath}
              fill="none"
              stroke={isInsideCone ? torchActiveStroke : staticArcColor}
              strokeWidth={8}
              strokeLinecap="round"
            />

            {/* Rotating torch cone */}
            <g
              transform={`rotate(${torchRotation} ${centerX} ${centerY})`}
              style={{ transition: "transform 0.18s ease-out" }}
            >
              {/* Cone wedge */}
              <path
                d={conePath}
                fill={torchFill}
                stroke={torchStroke}
                strokeWidth={1.5}
                opacity={isInsideCone ? 0.4 : 0.2}
              />
              {/* Outer edge */}
              <path
                d={arcPath}
                fill="none"
                stroke={torchStroke}
                strokeWidth={4}
                strokeLinecap="round"
              />
            </g>
          </svg>
        </div>

        <p className="text-center text-neutral-400 max-w-xs mb-8">
          Rotate your phone until the moving cone lines up with the static arc
          at the top. When it turns blue and the phone stops vibrating, you’re
          facing the correct direction.
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