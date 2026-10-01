import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native';
import Svg, { Circle, Path, G } from 'react-native-svg';
import { GlobalStore } from '../util/globals';
import { ANDROID_UPDATE_INTERVAL_MS } from '../hooks/useCompass';

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

// Animate over one heading update interval so the arc rotates continuously
// instead of stepping, without adding more lag than one update.
const ROTATION_ANIMATION_MS = ANDROID_UPDATE_INTERVAL_MS;

// How often the debug readout refreshes
const DEBUG_REFRESH_MS = 100;

interface HapticCompassProps {
  targetAngle?: number;
  heading: number;
}

export default function HapticCompass({
  targetAngle = 0,
  heading = 0,
}: HapticCompassProps) {
  // Visuals
  const radius = 90;
  const centerX = 100;
  const centerY = 100;
  const topY = 10;

  // Angle Spans (Degrees)
  const coneWidth = GlobalStore.COMPASS_ANGLE_TOLERANCE * 2;
  const arcWidth = 0; // 🟢 Smaller arc length (was 60 to match cone)

  const half = (coneWidth / 2) * (Math.PI / 180);
  const arcHalf = (arcWidth / 2) * (Math.PI / 180);

  // FIXED: Torch (Pointer) is fixed at 0 (top)
  // Target Arc rotates relative to heading
  // If target is 90 (East) and heading is 0 (North), diff is 90. Arc should be at 90 deg (Right).
  // If target is 90 (East) and heading is 90 (East), diff is 0. Arc should be at 0 deg (Top).
  const torchRotation = 0;
  const targetRotation = targetAngle - heading;

  // Unwrapped angle so 359° -> 1° animates 2°, not -358°
  const rotationRef = useRef(targetRotation);
  const rotationAnim = useRef(new Animated.Value(targetRotation)).current;

  useEffect(() => {
    rotationRef.current += shortestDiff(targetRotation, rotationRef.current);
    Animated.timing(rotationAnim, {
      toValue: rotationRef.current,
      duration: ROTATION_ANIMATION_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [targetRotation]);

  // Debug: read the arc's actually rendered rotation, so lag shows up as
  // "Dot bearing" drifting away from "Target bearing" while turning.
  const renderedRotationRef = useRef(targetRotation);
  const [renderedRotation, setRenderedRotation] = useState(targetRotation);

  useEffect(() => {
    const id = rotationAnim.addListener(({ value }) => {
      renderedRotationRef.current = value;
    });
    const timer = setInterval(
      () => setRenderedRotation(renderedRotationRef.current),
      DEBUG_REFRESH_MS
    );
    return () => {
      rotationAnim.removeListener(id);
      clearInterval(timer);
    };
  }, [rotationAnim]);

  const rotate = rotationAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
    extrapolate: 'extend',
  });

  const isAligned = Math.abs(shortestDiff(targetAngle, heading)) <= 25;

  // Colors
  // Colors
  // Yellow Series (Default/Inactive)
  const staticArcColor = 'rgba(234, 179, 8, 1)';
  const torchInactiveFill = 'rgba(234, 179, 8, 0.45)'; // Yellow-500 low opacity
  const torchInactiveStroke = 'rgb(234, 179, 8)'; // Yellow-500 high opacity

  // Green Series (Active/Aligned)
  const torchActiveFill = 'rgba(34, 197, 94, 0.45)'; // Green-500
  const torchActiveStroke = 'rgb(34, 197, 94)';

  const torchFill = isAligned ? torchActiveFill : torchInactiveFill;
  const torchStroke = isAligned ? torchActiveStroke : torchInactiveStroke;
  const circleStroke = isAligned ? torchActiveStroke : 'rgb(234, 179, 8)';

  // Cone endpoints (using outer radius)

  // Note: center point for cone is simply (centerX, centerY)

  // Arc endpoints (using radius but different width)
  const arcRightX = centerX + radius * Math.sin(arcHalf);
  const arcRightY = centerY - radius * Math.cos(arcHalf);
  const arcLeftX = centerX - radius * Math.sin(arcHalf);
  const arcLeftY = arcRightY;

  return (
    <View style={styles.container}>
      <View style={styles.compassContainer}>
        {/* Layers: circle, rotating target arc, fixed torch on top */}
        <Svg
          height="300"
          width="300"
          viewBox="0 0 200 200"
          style={StyleSheet.absoluteFill}
        >
          {/* Outer Circle */}
          <Circle
            cx={centerX}
            cy={centerY}
            r={radius}
            stroke={circleStroke}
            strokeWidth="3"
            fill="none"
          />
        </Svg>

        {/* Target Arc: rotated natively so it animates smoothly */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}
        >
          <Svg height="300" width="300" viewBox="0 0 200 200">
            <Path
              d={`M ${arcLeftX} ${arcLeftY} A ${radius} ${radius} 0 0 1 ${arcRightX} ${arcRightY}`}
              stroke={isAligned ? torchActiveStroke : staticArcColor}
              strokeWidth="15"
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Animated.View>

        <Svg
          height="300"
          width="300"
          viewBox="0 0 200 200"
          style={StyleSheet.absoluteFill}
        >
          {/* Torch Cone */}
          <G rotation={torchRotation} origin={`${centerX}, ${centerY}`}>
            <Path
              d={`
                M ${centerX} ${centerY}
                L ${centerX - radius * Math.sin(half)} ${
                topY + radius * (1 - Math.cos(half))
              }
                A ${radius} ${radius} 0 0 1 ${
                centerX + radius * Math.sin(half)
              } ${topY + radius * (1 - Math.cos(half))}
                Z
              `}
              fill={torchFill}
              stroke={torchStroke}
              strokeWidth="3"
            />
          </G>
        </Svg>
      </View>
      <Text style={styles.text}>
        Rotate your phone until the cone lines up with the top arc.
      </Text>

      <View style={styles.debug}>
        <Text style={{ color: 'white' }}>Heading: {heading.toFixed(0)}°</Text>
        <Text style={{ color: 'white' }}>
          Target bearing: {normalizeAngle(targetAngle).toFixed(0)}°
        </Text>
        <Text style={{ color: 'white' }}>
          Dot bearing: {normalizeAngle(heading + renderedRotation).toFixed(0)}°
        </Text>
        <Text style={{ color: 'white' }}>
          Diff: {shortestDiff(targetAngle, heading).toFixed(0)}°
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#171717', // neutral-900
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  compassContainer: {
    marginBottom: 40,
    width: 300,
    height: 300,
  },
  text: {
    color: 'white', // muted-foreground
    textAlign: 'center',
    fontSize: 16,
    maxWidth: 300,
  },
  debug: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#333',
    borderRadius: 8,
  },
});
