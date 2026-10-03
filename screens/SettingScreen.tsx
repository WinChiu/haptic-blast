import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  Share,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useFeedback } from '../hooks/FeedbackContext';
import { useSelector, useDispatch } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateUserProfile, logout, setDebugMode } from '../util/store';
import { GUIDANCE_STEPS } from '../components/GuidanceTip';
import {
  loadGuidancePrefs,
  saveReminderPreference,
} from '../util/guidancePrefs';
import { ReminderPreference } from '../util/tipMode';
import {
  PHONE_POSITIONS,
  PhonePosition,
  RecordingPrefs,
  clearRecordings,
  loadRecordingPrefs,
  loadRecordings,
  recordingsAsText,
  recordingsSummaryText,
  shareRecordingsAsFile,
  saveRecordingPrefs,
} from '../util/recordingStorage';

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

  // How the how-to reminder behaves when a journey starts
  const [reminder, setReminder] = useState<ReminderPreference>('adaptive');
  useEffect(() => {
    loadGuidancePrefs().then((prefs) => setReminder(prefs.reminder));
  }, []);
  // Walk recording: sensor data for working out hands-free guidance
  const [recPrefs, setRecPrefs] = useState<RecordingPrefs>({
    enabled: false,
    phonePosition: 'pocket',
    label: '',
  });
  const [recCount, setRecCount] = useState(0);
  const [recSamples, setRecSamples] = useState(0);
  const refreshRecordings = async () => {
    const all = await loadRecordings();
    setRecCount(all.length);
    setRecSamples(all.reduce((n, r) => n + r.samples.length, 0));
  };
  useEffect(() => {
    loadRecordingPrefs().then(setRecPrefs);
    refreshRecordings();
  }, []);
  const updateRecPrefs = (change: Partial<RecordingPrefs>) => {
    const next = { ...recPrefs, ...change };
    setRecPrefs(next);
    saveRecordingPrefs(next);
  };
  const shareRecordings = async () => {
    const text = await recordingsAsText();
    if (!text) {
      Alert.alert('Nothing to share', 'No journey has been recorded yet.');
      return;
    }
    // Preferred: a real .csv file. Falls back to plain text if the file
    // sharing modules are not in this build.
    if (await shareRecordingsAsFile()) return;
    try {
      await Share.share({ message: text, title: 'Haptic Blast recordings' });
    } catch (e: any) {
      Alert.alert('Could not share', e?.message ?? 'Unknown error');
    }
  };
  const shareSummary = async () => {
    const text = await recordingsSummaryText();
    if (!text) {
      Alert.alert('Nothing to share', 'No journey has been recorded yet.');
      return;
    }
    try {
      await Share.share({ message: text, title: 'Haptic Blast recording summary' });
    } catch (e: any) {
      Alert.alert('Could not share', e?.message ?? 'Unknown error');
    }
  };
  const confirmClearRecordings = () => {
    Alert.alert(
      'Delete recordings?',
      'This deletes the recordings stored on this phone. Share them first if you need them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await clearRecordings();
            refreshRecordings();
          },
        },
      ]
    );
  };
  const chooseReminder = (value: ReminderPreference) => {
    setReminder(value);
    saveReminderPreference(value);
  };

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

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Walk recording (research)</Text>
          <Text style={styles.cardText}>
            Records time, position, GPS direction, speed and the phone's heading
            about twice a second during a journey. It stays on this phone until
            you share it, and it contains your location trace. Deleting the app
            deletes it.
          </Text>
          <View style={styles.toggleContainer}>
            <Switch
              trackColor={{ false: '#404040', true: '#22c55e' }}
              thumbColor="#fff"
              ios_backgroundColor="#404040"
              onValueChange={(value) => updateRecPrefs({ enabled: value })}
              value={recPrefs.enabled}
            />
            <Text style={styles.toggleLabel}>
              {recPrefs.enabled ? 'ON' : 'OFF'}
            </Text>
          </View>
          <Text style={styles.cardText}>Where is the phone carried?</Text>
          <View style={[styles.optionRow, { flexWrap: 'wrap' }]}>
            {PHONE_POSITIONS.map(({ value, label }) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.optionChip,
                  { flexGrow: 1, flexBasis: '30%' },
                  recPrefs.phonePosition === value && styles.optionChipActive,
                ]}
                onPress={() =>
                  updateRecPrefs({ phonePosition: value as PhonePosition })
                }
              >
                <Text
                  style={[
                    styles.optionText,
                    recPrefs.phonePosition === value && styles.optionTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.cardText}>
            Label for the next walks (person, route, condition, repeat):
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. angel-lappis-pocket-1"
            placeholderTextColor="#737373"
            value={recPrefs.label}
            onChangeText={(label) => updateRecPrefs({ label })}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.cardText}>
            Saved on this phone: {recCount} recording{recCount === 1 ? '' : 's'},{' '}
            {recSamples} samples (the last 5 are kept).
          </Text>
          <TouchableOpacity style={styles.saveButton} onPress={shareSummary}>
            <Text style={styles.saveButtonText}>Share short summary (paste-able)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={shareRecordings}>
            <Text style={styles.saveButtonText}>Share full data (.csv file)</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmClearRecordings}>
            <Text style={styles.linkText}>Delete recordings</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Journey reminder</Text>
          <Text style={styles.cardText}>
            Adaptive shows the full tip for your first journeys, then a small
            reminder. Always shows the full tip every time (use this for
            studies). Off shows nothing.
          </Text>
          <View style={styles.optionRow}>
            {(
              [
                ['adaptive', 'Adaptive'],
                ['always', 'Always'],
                ['off', 'Off'],
              ] as [ReminderPreference, string][]
            ).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.optionChip,
                  reminder === value && styles.optionChipActive,
                ]}
                onPress={() => chooseReminder(value)}
              >
                <Text
                  style={[
                    styles.optionText,
                    reminder === value && styles.optionTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How to follow the guidance</Text>
          {GUIDANCE_STEPS.map((step, i) => (
            <Text key={i} style={styles.cardText}>
              {i + 1}. {step}
            </Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Map data</Text>
          <Text style={styles.cardText}>
            Routes are calculated with GraphHopper using map data © OpenStreetMap
            contributors, available under the Open Database License. The map
            you see is Apple Maps.
          </Text>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL('https://www.openstreetmap.org/copyright')
            }
          >
            <Text style={styles.linkText}>openstreetmap.org/copyright</Text>
          </TouchableOpacity>
        </View>
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
  linkText: { color: '#0ea5e9', fontSize: 14, fontWeight: '600' },
  optionRow: { flexDirection: 'row', gap: 10 },
  optionChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#404040',
  },
  optionChipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  optionText: { color: '#a3a3a3', fontWeight: '600', fontSize: 14 },
  optionTextActive: { color: '#fff' },
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
