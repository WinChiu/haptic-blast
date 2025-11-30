import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

export default function TutorialScreen() {
  const navigation = useNavigation();

  const cards = [
    {
      title: 'Preemptive title',
      button: 'Something here',
    },
    {
      title: 'Preemptive title',
      button: 'And then here',
    },
    {
      title: 'Preemptive title',
      button: 'And lastly here',
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#d4d4d4" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Haptics Tutorial</Text>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
      >
        {cards.map((card, index) => (
          <View key={index} style={styles.card}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardText}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis
              tempor, lorem vel viverra cursus, justo leo pretium orci, eu
              rhoncus dui mi a lorem. Integer posuere erat a ante.
            </Text>
            <TouchableOpacity style={styles.cardButton}>
              <Text style={styles.cardButtonText}>{card.button}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#171717', // neutral-900
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60, // Safe area top approx
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262626', // neutral-800
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 24,
  },
  card: {
    backgroundColor: 'rgba(38, 38, 38, 0.6)', // neutral-800/60
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262626',
    gap: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e5e5', // neutral-200
  },
  cardText: {
    fontSize: 12,
    color: '#a3a3a3', // neutral-400
    lineHeight: 18,
  },
  cardButton: {
    backgroundColor: '#404040', // neutral-700
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#525252',
  },
  cardButtonText: {
    color: '#e5e5e5',
    fontSize: 14,
    fontWeight: '500',
  },
});
