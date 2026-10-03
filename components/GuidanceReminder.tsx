import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  onShowSteps: () => void;
};

// A small, non-blocking reminder shown for a few seconds when a journey
// starts, for people who have already seen the full tip. The wrapper lets
// touches through to the map; only the "Steps" link is tappable.
export default function GuidanceReminder({ onShowSteps }: Props) {
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.pill}>
        <Text style={styles.text}>Phone flat, top edge forward</Text>
        <TouchableOpacity onPress={onShowSteps} hitSlop={12}>
          <Text style={styles.link}>Steps</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 140,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(23,23,23,0.92)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#262626',
  },
  text: { color: '#e5e5e5', fontSize: 14 },
  link: { color: '#0ea5e9', fontSize: 14, fontWeight: '700' },
});
