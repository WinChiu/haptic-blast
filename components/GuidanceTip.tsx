import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Shown before the first Start, and listed in Settings. Keep in sync with
// "How to use the app" in the README.
export const GUIDANCE_STEPS = [
  'Hold the phone flat in front of you, screen up, with the top edge pointing forward.',
  'Turn slowly until the buzz or beeping stops. You are now facing the way to walk.',
  'Walk that way, keeping the phone pointing the same way. At a turn the buzz starts again: turn until it stops.',
  'The stronger and faster it is, the further off you are.',
];

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function GuidanceTip({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Ionicons
            name="phone-portrait-outline"
            size={44}
            color="#0ea5e9"
            style={styles.icon}
          />
          <Text style={styles.title}>How to follow the guidance</Text>
          {GUIDANCE_STEPS.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={styles.stepNumber}>{i + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Got it, start</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#171717',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#262626',
    gap: 14,
  },
  icon: { alignSelf: 'center' },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0ea5e9',
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
  },
  stepText: { flex: 1, color: '#d4d4d4', fontSize: 15, lineHeight: 21 },
  button: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
