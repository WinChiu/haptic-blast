import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BeltState } from '../hooks/useBelt';
import { relativeBearing } from '../util/belt';

// Debug view of the three belt motors: how strongly each would vibrate now.
export default function BeltBars({ state, facing }: { state: BeltState; facing?: number }) {
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
      {(() => {
        // The angle is worked out here from the live heading, so it is never stale
        const angle =
          state.target !== null && facing !== undefined ? relativeBearing(state.target, facing) : null;
        return (
          <>
            <Text style={styles.status}>
              {state.phase === 'none'
                ? 'No target yet (no route or journey)'
                : `${state.phase === 'junction' ? 'Junction ahead: pointing at the next stretch' : 'Following the route'}`}
            </Text>
            {angle !== null && facing !== undefined && state.target !== null && (
              <Text style={styles.status}>
                You face {Math.round(facing)}°, target {Math.round(state.target)}°, angle{' '}
                {angle > 0 ? '+' : ''}
                {Math.round(angle * 10) / 10}° ({angle >= 0 ? 'right' : 'left'}){Math.abs(angle) > 90 ? ', behind you: silent' : ''}
              </Text>
            )}
            {state.distanceM !== null && (
              <Text style={styles.status}>
                Next junction {state.distanceM} m away; the turn direction takes over at {state.triggerM} m
              </Text>
            )}
          </>
        );
      })()}
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
