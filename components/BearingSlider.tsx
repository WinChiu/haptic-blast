import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// A slider for a bearing from -180 to +180 degrees (positive = to the right),
// like the one in the vibration simulator. Tap or drag anywhere on the bar.
// The darker ends are behind the wearer (beyond 90 degrees: no response) and
// the shaded middle is the silent zone.
export default function BearingSlider({
  value,
  zone,
  onChange,
}: {
  value: number;
  zone: number;
  onChange: (deg: number) => void;
}) {
  const [width, setWidth] = useState(1);
  const toX = (deg: number) => ((deg + 180) / 360) * width;
  const set = (x: number) => {
    const deg = Math.round(((x / width) * 360 - 180) * 2) / 2;
    onChange(Math.max(-180, Math.min(180, deg)));
  };
  return (
    <View>
      <View
        style={styles.track}
        onLayout={(e) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => set(e.nativeEvent.locationX)}
        onResponderMove={(e) => set(e.nativeEvent.locationX)}
      >
        <View pointerEvents="none" style={[styles.behind, { left: 0, width: toX(-90) }]} />
        <View pointerEvents="none" style={[styles.behind, { left: toX(90), width: width - toX(90) }]} />
        <View pointerEvents="none" style={[styles.zone, { left: toX(-zone), width: toX(zone) - toX(-zone) }]} />
        <View pointerEvents="none" style={[styles.centre, { left: toX(0) - 1 }]} />
        <View pointerEvents="none" style={[styles.marker, { left: toX(value) - 9 }]} />
      </View>
      <View style={styles.labels}>
        <Text style={styles.label}>-180°</Text>
        <Text style={styles.label}>-90°</Text>
        <Text style={styles.label}>0°</Text>
        <Text style={styles.label}>+90°</Text>
        <Text style={styles.label}>+180°</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 44, borderRadius: 8, backgroundColor: '#404040', overflow: 'hidden', justifyContent: 'center' },
  behind: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#262626' },
  zone: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#525252' },
  centre: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#737373' },
  marker: { position: 'absolute', top: 13, width: 18, height: 18, borderRadius: 9, backgroundColor: '#22c55e' },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  label: { color: '#a3a3a3', fontSize: 11 },
});
