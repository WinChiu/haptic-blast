import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

export default function HistoryScreen() {
  const navigation = useNavigation();
  const rounds = useSelector((state: any) => state.userData.round);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isFinished = item.timeSpent.finish > 0;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Round {index + 1}</Text>
          <View
            style={[
              styles.statusBadge,
              isFinished ? styles.statusFinished : styles.statusStopped,
            ]}
          >
            <Text style={styles.statusText}>
              {isFinished ? 'Completed' : 'Stopped'}
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={16} color="#a3a3a3" />
          <Text style={styles.infoText}>
            {formatTime(item.timeSpent.start)}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={16} color="#a3a3a3" />
          <Text style={styles.infoText}>
            Duration: {formatDuration(item.timeSpent.duration || 0)}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.modeText}>
            {item.timeSpent.hapticEnabled && item.timeSpent.soundEnabled
              ? '⚡ Hybrid (Haptic + Audio)'
              : item.timeSpent.hapticEnabled
              ? '📳 Haptic Only'
              : item.timeSpent.soundEnabled
              ? '🔊 Audio Only'
              : '👀 Visual Only'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#d4d4d4" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
      </View>

      {rounds && rounds.length > 0 ? (
        <FlatList
          data={[...rounds].reverse()} // Show newest first
          keyExtractor={(item, index) => index.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="list-outline" size={48} color="#404040" />
          <Text style={styles.emptyText}>No history available yet.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#171717',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
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
  listContent: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: 'rgba(38,38,38,0.6)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262626',
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusFinished: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)', // green-500/20
  },
  statusStopped: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)', // red-500/20
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    color: '#a3a3a3',
    fontSize: 14,
  },
  modeText: {
    color: '#d4d4d4',
    fontSize: 12,
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: '#737373',
    fontSize: 16,
  },
});
