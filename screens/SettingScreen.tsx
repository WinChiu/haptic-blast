import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useFeedback } from '../hooks/FeedbackContext';
import { useSelector, useDispatch } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateUserProfile, logout, setDebugMode } from '../util/store';

export default function SettingScreen() {
  const navigation = useNavigation();
  const { hapticEnabled, soundEnabled, toggleHaptic, toggleSound } =
    useFeedback();
  const dispatch = useDispatch();

  // Get data from Redux
  const currentUid = useSelector(
    (state: any) => state.userData.userProfile.Uid
  );
  const debugMode = useSelector(
    (state: any) => state.appSettings?.debugMode || false
  );

  const [username, setUsername] = useState('');

  const handleSaveUsername = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Username cannot be empty');
      return;
    }

    // Update Redux store with new Uid (this will trigger Firebase connection)
    dispatch(updateUserProfile({ Uid: username.trim() }));

    Alert.alert('Success', 'Username saved! Connecting to Firebase...');
    setUsername('');
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          // Clear AsyncStorage
          await AsyncStorage.removeItem('profileId');
          // Reset Redux store
          dispatch(logout());
          Alert.alert('Success', 'Logged out successfully');
        },
      },
    ]);
  };
  const cards = [
    {
      title: 'Haptic Feedback',
      description: 'Activate haptic vibrations to guide you while navigating.',
      isEnabled: hapticEnabled,
      onToggle: toggleHaptic,
    },
    {
      title: 'Audio Feedback',
      description: 'Activate audio cues to guide you while navigating.',
      isEnabled: soundEnabled,
      onToggle: toggleSound,
    },
    {
      title: 'Debug Mode',
      description: 'Enable mock location controls to simulate movement.',
      isEnabled: debugMode,
      onToggle: (val: boolean) => {
        dispatch(setDebugMode(val));
      },
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#d4d4d4" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Username Section */}
        <TouchableOpacity
          style={[
            styles.historyButton,
            { backgroundColor: '#333', marginTop: 12 },
          ]}
          onPress={() => (navigation as any).navigate('AllUsersData')}
        >
          <Text style={styles.historyButtonText}>All Users Data</Text>
        </TouchableOpacity>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Username</Text>
          {currentUid ? (
            // Show logged-in state
            <>
              <Text style={styles.cardText}>You are logged in as:</Text>
              <Text style={styles.usernameDisplay}>{currentUid}</Text>

              <TouchableOpacity
                style={styles.logoutButton}
                onPress={handleLogout}
              >
                <Text style={styles.logoutButtonText}>Logout</Text>
              </TouchableOpacity>
            </>
          ) : (
            // Show login form
            <>
              <Text style={styles.cardText}>
                Set your username to sync your progress and settings.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your username"
                placeholderTextColor="#737373"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveUsername}
              >
                <Text style={styles.saveButtonText}>Save Username</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

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
              <Text style={styles.toggleLabel}>
                {card.isEnabled ? 'ON' : 'OFF'}
              </Text>
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
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
  },
  toggleLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },
  saveButton: {
    backgroundColor: '#0ea5e9', // sky-500
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  usernameDisplay: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0ea5e9',
    textAlign: 'center',
    paddingVertical: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  historyButton: {
    flex: 1,
    backgroundColor: '#404040',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  logoutButton: {
    flex: 1,
    backgroundColor: '#ef4444', // red-500
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  currentUidText: {
    fontSize: 12,
    color: '#737373',
    textAlign: 'center',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#404040',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 16,
  },
});
