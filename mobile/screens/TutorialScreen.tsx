import React from 'react';
import { StyleSheet, Text, View, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useFeedback } from '../hooks/FeedbackContext';

export default function TutorialScreen() {
  const navigation = useNavigation();
  const { hapticEnabled, soundEnabled, toggleHaptic, toggleSound } = useFeedback();

  const cards = [
    {
      title: 'Haptic Feedback',
      description: 'Activate haptic vibrations to guide you while navigating.',
      isEnabled: hapticEnabled,
      onToggle: toggleHaptic,
    },
    {
      title: 'Sound Feedback',
      description: 'Activate audio cues to guide you while navigating.',
      isEnabled: soundEnabled,
      onToggle: toggleSound,
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#d4d4d4" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {cards.map((card, index) => (
          <View key={index} style={styles.card}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardText}>{card.description}</Text>
            <View style={styles.toggleContainer}>
              <Switch
                trackColor={{ false: '#404040', true: '#22c55e' }}
                thumbColor="#fff"
                ios_backgroundColor="#404040"
                onValueChange={card.onToggle}
                value={card.isEnabled}
              />
              <Text style={styles.toggleLabel}>{card.isEnabled ? 'ON' : 'OFF'}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#171717' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
  },
  backButton: { padding: 8, borderRadius: 20, marginRight: 8 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#fff' },
  content: { flex: 1 },
  scrollContent: { padding: 16, gap: 24 },
  card: {
    backgroundColor: 'rgba(38,38,38,0.6)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262626',
    gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#e5e5e5' },
  cardText: { fontSize: 14, color: '#a3a3a3', lineHeight: 20 },
  toggleContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  toggleLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
