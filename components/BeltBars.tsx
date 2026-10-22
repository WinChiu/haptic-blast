import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BeltState } from '../hooks/useBelt';

// Debug view of the three belt motors: how strongly each would vibrate now.
export default function BeltBars({ state }: { state: BeltState }) {
  const bars: [string, number][] = [
    ['Left', state.mix.left],
    ['Front', state.mix.main],
    ['Right', state.mix.right],
  ];
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Belt</Text>
      <View style={styles.row}>
        {bars.map(([label, value]) => (
          <View key={label} style={styles.col}>
            <View style={styles.track}>
              <View style={[styles.fill, { height: `${Math.round(value * 100)}%` }]} />
            </View>
            <Text style={styles.value}>{Math.round(value * 100)}%</Text>
            <Text style={styles.label}>{label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.status}>
        {state.active
          ? state.relative === null
            ? 'Junction ahead'
            : `Next stretch ${Math.round(state.relative)}° (${state.relative >= 0 ? 'right' : 'left'})`
          : state.distanceM === null
            ? 'No junction ahead (no route, or the last stretch)'
            : `Waiting: the next junction is ${state.distanceM} m away. The belt starts at ${state.triggerM} m.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { margin: 16, padding: 14, borderRadius: 16, backgroundColor: '#262626' },
  title: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-around' },
  col: { alignItems: 'center', width: 70 },
  track: {
    width: 36,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#404040',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: { width: '100%', backgroundColor: '#22c55e' },
  value: { color: '#fff', fontSize: 14, marginTop: 6 },
  label: { color: '#a3a3a3', fontSize: 12 },
  status: { color: '#d4d4d4', fontSize: 13, marginTop: 10, textAlign: 'center' },
});
