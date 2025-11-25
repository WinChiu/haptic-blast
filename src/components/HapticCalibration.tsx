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

// Shortest signed angle difference target - current, in [-180, 180]
const shortestDiff = (target: number, current: number) => {
  let diff = normalizeAngle(target) - normalizeAngle(current);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
};

const HapticCalibration: React.FC<HapticCalibrationProps> = ({ onContinue }) => {
  const [hapticDelay, setHapticDelay] = useState(2.0);
  const [heading, setHeading] = useState(0); // continuous relative heading

  // Refs for smoothing absolute heading
  const baseHeadingRef = useRef<number | null>(null);
  const smoothedAbsoluteRef = useRef<number | null>(null);

  const targetAngle = 0;      // desired forward direction (top)
  const coneAngle = 60;       // width of cone in degrees
  const alignThreshold = 20;  // how close to be considered "aligned"

  // === Device orientation → smooth relative heading ===
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

      // baseline = heading when calibration opened
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

  // Angle difference to target
  const angleDiff = Math.abs(shortestDiff(targetAngle, heading));
  const isAligned = angleDiff <= alignThreshold;
  const isOff = !isAligned;

  // === Haptics when not aligned (same logic, just based on angleDiff) ===
  useEffect(() => {
    if (!navigator.vibrate) return;
    if (isAligned) return;

    const intensity = Math.min(angleDiff / 180, 1);
    const vibrationPattern = Math.floor(100 + intensity * 200);

    const interval = setInterval(() => {
      navigator.vibrate([vibrationPattern, 100, vibrationPattern * 0.5]);
    }, hapticDelay * 1000);

    return () => clearInterval(interval);
  }, [angleDiff, isAligned, hapticDelay]);

  const handleContinue = () => {
    onContinue(hapticDelay);
  };

  // Torch rotation – this was correct in your working version
  const torchRotation = heading;

  // Colors – muted when off, sky blue when aligned
  const staticArcColor = "hsl(215, 15%, 35%)"; // muted
  const torchInactiveFill = "hsla(215, 15%, 60%, 0.25)";
  const torchInactiveStroke = "hsla(215, 15%, 60%, 0.9)";
  const torchActiveFill = "hsla(204, 88%, 53%, 0.45)"; // sky-like
  const torchActiveStroke = "hsl(204, 88%, 53%)";
  const circleStroke = isAligned ? torchActiveStroke : "hsl(215, 15%, 40%)";

  const torchFill = isAligned ? torchActiveFill : torchInactiveFill;
  const torchStroke = isAligned ? torchActiveStroke : torchInactiveStroke;

  // Geometry for cone & arcs
  const radius = 90;
  const center = { x: 100, y: 100 };
  const halfAngleRad = (coneAngle / 2) * (Math.PI / 180);

  const topY = 10;
  const rightX = center.x + radius * Math.sin(halfAngleRad);
  const rightY = topY + radius * (1 - Math.cos(halfAngleRad));
  const leftX = center.x - radius * Math.sin(halfAngleRad);
  const leftY = rightY;

  const largeArcFlag = coneAngle > 180 ? 1 : 0;

  // Static top arc path
  const staticArcPath = `
    M ${leftX} ${leftY}
    A ${radius} ${radius} 0 ${largeArcFlag} 1 ${rightX} ${rightY}
  `;

  // Cone wedge paths (used inside rotating group)
  const conePath = `
    M ${center.x} ${center.y}
    L ${leftX} ${leftY}
    A ${radius} ${radius} 0 ${largeArcFlag} 1 ${rightX} ${rightY}
    Z
  `;

  const arcPath = `
    M ${leftX} ${leftY}
    A ${radius} ${radius} 0 ${largeArcFlag} 1 ${rightX} ${rightY}
  `;

  return (
    <div className="fixed inset-0 bg-neutral-900 z-[3000] flex flex-col items-center justify-between p-8">
      {/* Torch visualization */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div
          className={
            "relative w-72 h-72 mb-12" + (isOff ? " haptic-shake" : "")
          }
        >
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
            {/* Outer circle */}
            <circle
              cx={center.x}
              cy={center.y}
              r={radius}
              fill="none"
              stroke={circleStroke}
              strokeWidth={3}
            />

            {/* Static target arc at top */}
            <path
              d={staticArcPath}
              stroke={isAligned ? torchActiveStroke : staticArcColor}
              strokeWidth={8}
              strokeLinecap="round"
              fill="none"
            />

            {/* Center dot */}
            <circle cx={center.x} cy={center.y} r={6} fill={torchStroke} />

            {/* Rotating torch (cone + arc) */}
            <g
              style={{
                transform: `rotate(${torchRotation}deg)`,
                transformOrigin: `${center.x}px ${center.y}px`,
                transition: "transform 0.15s linear",
              }}
            >
              {/* Cone fill */}
              <path d={conePath} fill={torchFill} opacity={0.25} />
              {/* Outer arc of the cone */}
              <path
                d={arcPath}
                stroke={torchStroke}
                strokeWidth={6}
                strokeLinecap="round"
                fill="none"
              />
            </g>
          </svg>
        </div>

        <p className="text-center text-muted-foreground max-w-xs mb-8">
          Slowly rotate on the spot. Line up the moving cone with the static arc
          at the top. When it turns blue and feels stable, you are facing the
          correct direction.
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