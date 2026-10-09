import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Dimensions, Platform } from 'react-native';
import Animated, {
  Easing,
  SensorType,
  useAnimatedReaction,
  useAnimatedSensor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, G } from 'react-native-svg';
import { GlobalStore } from '../util/globals';
import {
  ANDROID_UPDATE_INTERVAL_MS,
  AXES_SOURCE,
  HEADING_SOURCE,
  addAxesListener,
  angleDiff,
  axesFromEuler,
  axesFromQuaternion,
  headingFromAxes,
  nextIsUpright,
} from '../hooks/useCompass';
import { addOrientationListener } from '../modules/fused-orientation';
import { useHapticSettings } from '../util/hapticSettings';
import { getVibratorCapabilities } from '../modules/vibrator-info';
import { BUZZ_BACKEND } from '../hooks/useBuzz';
import { Calibration } from '../util/calibration';

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

// How the target dot follows the phone, bypassing HomeScreen re-renders:
// - fused-orientation: every Fused Orientation Provider sample (~50Hz)
// - rotation-vector: the rotation sensor directly on the UI thread every frame
// - system (iOS): animated from the heading prop, since Reanimated's iOS
//   rotation reference frame hasn't been verified to point at north
const UI_THREAD_SENSOR = HEADING_SOURCE === 'rotation-vector';
const DIRECT_HEADING = HEADING_SOURCE !== 'system';
// Low-pass per sample on the dot's heading, to hide sensor jitter
const UI_SMOOTHING_ALPHA = 0.3;
// iOS: animate over one heading update so the dot moves instead of stepping
const ROTATION_ANIMATION_MS = ANDROID_UPDATE_INTERVAL_MS;

// How often the debug readout refreshes
const DEBUG_REFRESH_MS = 100;

// Debug: vibrator hardware support, which decides how the buzz feels
const VIBRATOR = getVibratorCapabilities();
const yesNo = (value: boolean) => (value ? 'yes' : 'no');
const VIBRATOR_TEXT = VIBRATOR
  ? `API ${VIBRATOR.apiLevel}, amplitude control: ${yesNo(
      VIBRATOR.hasAmplitudeControl
    )}, primitives: ${yesNo(VIBRATOR.clickPrimitive && VIBRATOR.tickPrimitive)}`
  : 'unavailable (iOS or Expo Go)';

interface HapticCompassProps {
  targetAngle?: number;
  heading: number;
  // Pocket calibration in use: the dot then follows the heading prop, which
  // has the calibration applied, instead of the raw sensor
  calibration?: Calibration | null;
  // The silent zone the guidance really uses (wider than the setting when GPS
  // is poor), so the triangle always matches when the phone buzzes
  zoneDegrees?: number;
}

export default function HapticCompass({
  targetAngle = 0,
  heading = 0,
  calibration = null,
  zoneDegrees,
}: HapticCompassProps) {
  const directHeading = DIRECT_HEADING && !calibration;
  const directSV = useSharedValue(directHeading);
  useEffect(() => {
    directSV.value = directHeading;
  }, [directHeading]);

  // Visuals
  const radius = 90;
  const centerX = 100;
  const centerY = 100;
  const topY = 10;

  // Angle Spans (Degrees)
  const { deadband: chosenDeadband } = useHapticSettings();
  const deadband = Math.max(chosenDeadband, zoneDegrees ?? 0);
  const coneWidth = deadband * 2;
  const arcWidth = 0; // 🟢 Smaller arc length (was 60 to match cone)

  const half = (coneWidth / 2) * (Math.PI / 180);
  const arcHalf = (arcWidth / 2) * (Math.PI / 180);

  // FIXED: Torch (Pointer) is fixed at 0 (top)
  // Target Arc rotates relative to heading
  // If target is 90 (East) and heading is 0 (North), diff is 90. Arc should be at 90 deg (Right).
  // If target is 90 (East) and heading is 90 (East), diff is 0. Arc should be at 0 deg (Top).
  const torchRotation = 0;
  const targetRotation = targetAngle - heading;

  const targetSV = useSharedValue(targetAngle);
  useEffect(() => {
    targetSV.value = targetAngle;
  }, [targetAngle]);

  // Android: heading computed on the UI thread from the sensor
  const uiHeadingSV = useSharedValue(heading);
  const uiUprightSV = useSharedValue(false);
  if (UI_THREAD_SENSOR) {
    // UI_THREAD_SENSOR is fixed per platform, so these hooks always run
    const rotationSensor = useAnimatedSensor(SensorType.ROTATION, {
      interval: 'auto',
    });
    useAnimatedReaction(
      () => {
        const { yaw, pitch, roll } = rotationSensor.sensor.value;
        return { yaw, pitch, roll };
      },
      ({ yaw, pitch, roll }) => {
        const axes = axesFromEuler(yaw, pitch, roll);
        uiUprightSV.value = nextIsUpright(axes, uiUprightSV.value);
        const raw = headingFromAxes(axes, uiUprightSV.value);
        const next =
          uiHeadingSV.value +
          angleDiff(raw, uiHeadingSV.value) * UI_SMOOTHING_ALPHA;
        uiHeadingSV.value = (next + 360) % 360;
      }
    );
  }

  // Fused Orientation Provider: update the dot on every sample
  useEffect(() => {
    if (HEADING_SOURCE !== 'fused-orientation') return;
    let upright = false;
    const sub = addOrientationListener(({ qx, qy, qz, qw }) => {
      const axes = axesFromQuaternion(qx, qy, qz, qw);
      upright = nextIsUpright(axes, upright);
      const raw = headingFromAxes(axes, upright);
      const next =
        uiHeadingSV.value +
        angleDiff(raw, uiHeadingSV.value) * UI_SMOOTHING_ALPHA;
      uiHeadingSV.value = (next + 360) % 360;
    });
    return () => sub?.remove();
  }, []);

  // iOS: unwrapped rotation so 359° -> 1° animates 2°, not -358°
  const propRotationSV = useSharedValue(targetRotation);
  useEffect(() => {
    if (directHeading) return;
    const next =
      propRotationSV.value + angleDiff(targetRotation, propRotationSV.value);
    propRotationSV.value = withTiming(next, {
      duration: ROTATION_ANIMATION_MS,
      easing: Easing.linear,
    });
  }, [targetRotation, directHeading]);

  const arcStyle = useAnimatedStyle(() => {
    const rotation = directSV.value
      ? targetSV.value - uiHeadingSV.value
      : propRotationSV.value;
    return { transform: [{ rotate: `${rotation}deg` }] };
  });

  // Debug: where the dot actually points on screen, so a mismatch with
  // "Target bearing" shows lag between the dot and the heading readout.
  const [renderedRotation, setRenderedRotation] = useState(targetRotation);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setRenderedRotation(
          directSV.value
            ? targetSV.value - uiHeadingSV.value
            : propRotationSV.value
        ),
      DEBUG_REFRESH_MS
    );
    return () => clearInterval(timer);
  }, []);

  // Debug (iOS): top-edge heading from Core Motion beside the system heading.
  // Held flat and not calibrated, they should agree within a few degrees. If
  // not, the DeviceAttitude conversion is wrong and so is pocket mode.
  const [attitudeHeading, setAttitudeHeading] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'ios' || AXES_SOURCE !== 'core-motion') return;
    let latest: number | null = null;
    const remove = addAxesListener((axes) => {
      latest = headingFromAxes(axes, false);
    });
    const timer = setInterval(() => setAttitudeHeading(latest), DEBUG_REFRESH_MS);
    return () => {
      remove();
      clearInterval(timer);
    };
  }, []);

  const isAligned = Math.abs(shortestDiff(targetAngle, heading)) <= deadband;

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

        {/* Target Arc: rotated on the UI thread so it moves smoothly */}
        <Animated.View style={[StyleSheet.absoluteFill, arcStyle]}>
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
        <Text style={{ color: 'white' }}>Source: {HEADING_SOURCE}</Text>
        <Text style={{ color: 'white' }}>Buzz: {BUZZ_BACKEND}</Text>
        <Text style={{ color: 'white' }}>Vibrator: {VIBRATOR_TEXT}</Text>
        <Text style={{ color: 'white' }}>Heading: {heading.toFixed(0)}°</Text>
        <Text style={{ color: 'white' }}>
          Calibration:{' '}
          {calibration
            ? `pocket, ${calibration.axis} axis, offset ${calibration.offset.toFixed(0)}°`
            : 'off (hand-held)'}
        </Text>
        {attitudeHeading !== null && (
          <Text style={{ color: 'white' }}>
            Core Motion top edge: {attitudeHeading.toFixed(0)}°
          </Text>
        )}
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
