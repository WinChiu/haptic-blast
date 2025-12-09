import React, { useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, Animated } from 'react-native';

interface JoystickProps {
  onMove: (angle: number, intensity: number) => void;
  onStop: () => void;
  size?: number;
  color?: string;
}

export default function Joystick({
  onMove,
  onStop,
  size = 150,
  color = 'rgba(255, 255, 255, 0.2)',
}: JoystickProps) {
  const pan = useRef(new Animated.ValueXY()).current;
  const radius = size / 2;
  const knobRadius = size / 5;
  const maxDistance = radius - knobRadius;

  // Refs to store current state for the loop
  const activeRef = useRef(false);
  const angleRef = useRef(0);
  const intensityRef = useRef(0);
  const loopRef = useRef<number | null>(null);

  const startLoop = () => {
    if (activeRef.current) return;
    activeRef.current = true;

    const tick = () => {
      if (!activeRef.current) return;

      // Call onMove with most recent values
      if (intensityRef.current > 0) {
        onMove(angleRef.current, intensityRef.current);
      }

      // Request next frame
      loopRef.current = requestAnimationFrame(tick);
    };

    tick();
  };

  const stopLoop = () => {
    activeRef.current = false;
    if (loopRef.current !== null) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
        startLoop();
      },
      onPanResponderMove: (_, gesture) => {
        // Calculate distance from center
        const dx = gesture.dx;
        const dy = gesture.dy;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Calculate angle
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        let heading = angle + 90;
        if (heading < 0) heading += 360;

        // Limit distance to circle radius
        let limitX = dx;
        let limitY = dy;

        if (distance > maxDistance) {
          const ratio = maxDistance / distance;
          limitX = dx * ratio;
          limitY = dy * ratio;
        }

        pan.setValue({ x: limitX, y: limitY });

        // Normalize intensity (0 to 1)
        const intensity = Math.min(distance / maxDistance, 1);

        // Update refs for the loop
        angleRef.current = heading;
        intensityRef.current = intensity;
      },
      onPanResponderRelease: () => {
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
          friction: 5,
        }).start();
        stopLoop();
        onStop();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
          friction: 5,
        }).start();
        stopLoop();
        onStop();
      },
    })
  ).current;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: color,
        },
      ]}
    >
      <Animated.View
        style={{
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        }}
        {...panResponder.panHandlers}
      >
        <View
          style={[
            styles.knob,
            {
              width: knobRadius * 2,
              height: knobRadius * 2,
              borderRadius: knobRadius,
            },
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  knob: {
    backgroundColor: '#fff',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
});
