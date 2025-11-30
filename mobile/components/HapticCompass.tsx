import React from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import Svg, { Circle, Path, G } from 'react-native-svg';

const { width } = Dimensions.get('window');

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

interface HapticCompassProps {
  targetAngle?: number;
}

export default function HapticCompass({
  targetAngle = 0,
  heading = 0,
}: HapticCompassProps & { heading: number }) {
  // Visuals
  const radius = 90;
  const centerX = 100;
  const centerY = 100;
  const topY = 10;
  const coneWidth = 60;
  const half = (coneWidth / 2) * (Math.PI / 180);

  // FIXED: Torch (Pointer) is fixed at 0 (top)
  // Target Arc rotates relative to heading
  // If target is 90 (East) and heading is 0 (North), diff is 90. Arc should be at 90 deg (Right).
  // If target is 90 (East) and heading is 90 (East), diff is 0. Arc should be at 0 deg (Top).
  const torchRotation = 0;
  const targetRotation = targetAngle - heading;

  const isAligned = Math.abs(shortestDiff(targetAngle, heading)) <= 15;

  // Colors
  const staticArcColor = 'hsl(215, 15%, 35%)';
  const torchInactiveFill = 'rgba(100, 149, 237, 0.25)';
  const torchActiveFill = 'rgba(14, 165, 233, 0.45)';
  const torchInactiveStroke = 'rgba(160, 174, 192, 0.7)';
  const torchActiveStroke = 'rgb(14, 165, 233)';

  const torchFill = isAligned ? torchActiveFill : torchInactiveFill;
  const torchStroke = isAligned ? torchActiveStroke : torchInactiveStroke;
  const circleStroke = isAligned ? 'rgb(14, 165, 233)' : 'hsl(215, 15%, 40%)';

  // Arc endpoints
  const rightX = centerX + radius * Math.sin(half);
  const rightY = topY + radius * (1 - Math.cos(half));
  const leftX = centerX - radius * Math.sin(half);
  const leftY = rightY;

  return (
    <View style={styles.container}>
      <View style={styles.compassContainer}>
        <Svg height="300" width="300" viewBox="0 0 200 200">
          {/* Outer Circle */}
          <Circle
            cx={centerX}
            cy={centerY}
            r={radius}
            stroke={circleStroke}
            strokeWidth="3"
            fill="none"
          />

          {/* Target Arc */}
          <G rotation={targetRotation} origin={`${centerX}, ${centerY}`}>
            <Path
              d={`M ${leftX} ${leftY} A ${radius} ${radius} 0 0 1 ${rightX} ${rightY}`}
              stroke={isAligned ? torchActiveStroke : staticArcColor}
              strokeWidth="8"
              strokeLinecap="round"
              fill="none"
            />
          </G>

          {/* Torch Cone - Fixed at Top */}
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
              strokeWidth="1.5"
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
          Target: {targetAngle.toFixed(0)}°
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
    color: '#a3a3a3', // muted-foreground
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
