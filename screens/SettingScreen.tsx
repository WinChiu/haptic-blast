import React, { useEffect, useRef, useState } from 'react';
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
import { useBuzz, BUZZ_BACKEND } from '../hooks/useBuzz';
import { useBeltSettings, updateBeltSettings } from '../util/beltSettings';
import { BELT_LIMITS, BeltTrigger } from '../util/belt';
import {
  HAPTIC_LIMITS,
  HAPTIC_SHAPE,
  HapticMode,
  exponentialIntensity,
  shapeFor,
  planPulse,
} from '../util/haptics';
import {
  resetHapticSettings,
  updateHapticSettings,
  useHapticSettings,
} from '../util/hapticSettings';
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
    motion: false,
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
  // Haptic tuning: how the phone vibrates (util/haptics.ts, from the team's guide)
  const haptics = useHapticSettings();
  const { pulse: pulseBuzz, start: startBuzz, stop: stopBuzz } = useBuzz();
  const demoTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [demoRunning, setDemoRunning] = useState(false);
  const stopDemo = () => {
    demoTimers.current.forEach(clearTimeout);
    demoTimers.current = [];
    stopBuzz();
    setDemoRunning(false);
  };
  useEffect(() => () => stopDemo(), []);
  // Plays what the current settings feel like: three levels of "far off", from
  // slightly to a lot, and then (pulsed mode) the click for lining up.
  const playDemo = () => {
    stopDemo();
    setDemoRunning(true);
    const at = (ms: number, fn: () => void) =>
      demoTimers.current.push(setTimeout(fn, ms));
    let t = 0;
    for (const error of [25, 50, 90]) {
      if (haptics.mode !== 'continuous') {
        const plan = planPulse(error, haptics)!;
        at(t, () => pulseBuzz(plan.amplitude, plan.pulseMs));
        t += plan.pulseMs + plan.pauseMs;
      } else {
        at(t, () => startBuzz(exponentialIntensity(error, haptics.deadband, shapeFor(haptics))));
        t += 900;
      }
    }
    if (haptics.mode !== 'continuous') {
      at(t, () => pulseBuzz(HAPTIC_SHAPE.confirmIntensity, haptics.confirmMs));
      t += haptics.confirmMs + 100;
    } else {
      at(t, stopBuzz);
    }
    at(t + 100, () => setDemoRunning(false));
  };
  const Stepper = ({
    label,
    value,
    unit,
    min,
    max,
    step,
    onChange,
  }: {
    label: string;
    value: number;
    unit: string;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
  }) => (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity
          style={[styles.stepperButton, value <= min && { opacity: 0.4 }]}
          onPress={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
        >
          <Text style={styles.stepperButtonText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>
          {value}
          {unit}
        </Text>
        <TouchableOpacity
          style={[styles.stepperButton, value >= max && { opacity: 0.4 }]}
          onPress={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
        >
          <Text style={styles.stepperButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const belt = useBeltSettings();
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
        {cards.filter((c) => c.title !== 'Debug Mode').map((card, index) => (
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
          <Text style={styles.cardTitle}>How to follow the guidance</Text>
          {GUIDANCE_STEPS.map((step, i) => (
            <Text key={i} style={styles.cardText}>
              {i + 1}. {step}
            </Text>
          ))}
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

        <TouchableOpacity
          style={[styles.historyButton, { backgroundColor: '#333' }]}
          onPress={() => setAdvancedOpen((v) => !v)}
        >
          <Text style={styles.historyButtonText}>
            {advancedOpen ? 'Hide' : 'Show'} advanced and research settings
          </Text>
        </TouchableOpacity>
        {advancedOpen && (
          <>
        <TouchableOpacity
          style={[
            styles.historyButton,
            { backgroundColor: '#333' },
          ]}
          onPress={() => (navigation as any).navigate('AllUsersData')}
        >
          <Text style={styles.historyButtonText}>All Users Data</Text>
        </TouchableOpacity>
        {cards.filter((c) => c.title === 'Debug Mode').map((card) => (
          <View key={card.title} style={styles.card}>
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
          <View style={styles.toggleContainer}>
            <Switch
              trackColor={{ false: '#404040', true: '#22c55e' }}
              thumbColor="#fff"
              ios_backgroundColor="#404040"
              onValueChange={(value) => updateRecPrefs({ motion: value })}
              value={recPrefs.motion}
            />
            <Text style={[styles.toggleLabel, { flex: 1, fontWeight: '400' }]}>
              Also record the motion sensors (about 20 a second). Makes the file
              about 2 MB per half hour; share it as a .csv file.
            </Text>
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
          <Text style={styles.cardTitle}>Haptic belt</Text>
          <Text style={styles.cardText}>
            Belt mode: the phone does not vibrate itself. Three motors (left,
            front, right) tell you which way the next stretch of the route
            goes, starting a little before each junction.
          </Text>
          <View style={styles.toggleContainer}>
            <Switch
              trackColor={{ false: '#404040', true: '#22c55e' }}
              thumbColor="#fff"
              ios_backgroundColor="#404040"
              onValueChange={(enabled) => {
                updateBeltSettings({ enabled });
              }}
              value={belt.enabled}
            />
            <Text style={styles.toggleLabel}>{belt.enabled ? 'ON' : 'OFF'}</Text>
          </View>
          <Text style={styles.cardText}>When the belt starts before a junction:</Text>
          <View style={styles.optionRow}>
            {(
              [
                ['fixed', 'Fixed distance'],
                ['speed', 'By speed'],
              ] as [BeltTrigger, string][]
            ).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                style={[styles.optionChip, belt.trigger === value && styles.optionChipActive]}
                onPress={() => updateBeltSettings({ trigger: value })}
              >
                <Text style={[styles.optionText, belt.trigger === value && styles.optionTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {belt.trigger === 'fixed' ? (
            <Stepper
              label="Start this far before the junction"
              value={belt.lookAheadM}
              unit=" m"
              min={BELT_LIMITS.lookAheadM.min}
              max={BELT_LIMITS.lookAheadM.max}
              step={5}
              onChange={(lookAheadM) => updateBeltSettings({ lookAheadM })}
            />
          ) : (
            <Stepper
              label="Start this long before the junction"
              value={belt.secondsAhead}
              unit=" s"
              min={BELT_LIMITS.secondsAhead.min}
              max={BELT_LIMITS.secondsAhead.max}
              step={1}
              onChange={(secondsAhead) => updateBeltSettings({ secondsAhead })}
            />
          )}
          <Text style={styles.cardText}>
            Once it has started for a junction it stays on until you pass it.
            By speed never starts closer than 15 m or further than 60 m.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Haptic tuning</Text>
          <Text style={styles.cardText}>
            How the phone vibrates when you point away from the target. The
            ranges come from the team's Vibration Design Guide; try the values to
            feel which suit you best. They are saved with every recording.
          </Text>
          {BUZZ_BACKEND === 'none' && (
            <Text style={[styles.cardText, { color: '#eab308' }]}>
              This build cannot vibrate (Expo Go on iPhone), so these only change
              the compass and the timing of taps.
            </Text>
          )}
          <View style={styles.optionRow}>
            {(
              [
                ['pulsed', 'Pulsed'],
                ['steady', 'Steady pulse'],
                ['continuous', 'Continuous'],
              ] as [HapticMode, string][]
            ).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.optionChip,
                  haptics.mode === value && styles.optionChipActive,
                ]}
                onPress={() => updateHapticSettings({ mode: value })}
              >
                <Text
                  style={[
                    styles.optionText,
                    haptics.mode === value && styles.optionTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Stepper
            label="Silent zone (± degrees)"
            value={haptics.deadband}
            unit="°"
            min={HAPTIC_LIMITS.deadband.min}
            max={HAPTIC_LIMITS.deadband.max}
            step={1}
            onChange={(deadband) => updateHapticSettings({ deadband })}
          />
          <Stepper
            label="Sharpness (0 soft, 100 crisp)"
            value={haptics.sharpness}
            unit="%"
            min={HAPTIC_LIMITS.sharpness.min}
            max={HAPTIC_LIMITS.sharpness.max}
            step={10}
            onChange={(sharpness) => updateHapticSettings({ sharpness })}
          />
          <Stepper
            label="Weakest buzz (just outside the zone)"
            value={haptics.minStrength}
            unit="%"
            min={HAPTIC_LIMITS.minStrength.min}
            max={HAPTIC_LIMITS.minStrength.max}
            step={5}
            onChange={(minStrength) => updateHapticSettings({ minStrength })}
          />
          {haptics.mode !== 'continuous' && (
            <>
              <Stepper
                label="Pulse length"
                value={haptics.pulseMs}
                unit=" ms"
                min={HAPTIC_LIMITS.pulseMs.min}
                max={HAPTIC_LIMITS.pulseMs.max}
                step={50}
                onChange={(pulseMs) => updateHapticSettings({ pulseMs })}
              />
              <Stepper
                label="Lined-up click"
                value={haptics.confirmMs}
                unit=" ms"
                min={HAPTIC_LIMITS.confirmMs.min}
                max={HAPTIC_LIMITS.confirmMs.max}
                step={10}
                onChange={(confirmMs) => updateHapticSettings({ confirmMs })}
              />
            </>
          )}
          <Text style={styles.cardText}>
            Silent while you point within the silent zone of the target; outside
            it the vibration gets stronger the further off you are
            {haptics.mode === 'pulsed'
              ? ', with shorter pauses (600 ms down to 200 ms), and a light click tells you when you line up.'
              : haptics.mode === 'steady'
                ? ', with every pulse and every pause the same length (only the strength changes), and a light click tells you when you line up.'
                : ' (one continuous buzz).'}
          </Text>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={demoRunning ? stopDemo : playDemo}
          >
            <Text style={styles.saveButtonText}>
              {demoRunning ? 'Stop' : 'Feel it: slightly, more, far off'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { stopDemo(); resetHapticSettings(); }}>
            <Text style={styles.linkText}>Reset to the guide's defaults</Text>
          </TouchableOpacity>
        </View>

          </>
        )}

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
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stepperLabel: { flex: 1, color: '#e5e5e5', fontSize: 14 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#404040',
  },
  stepperButtonText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  stepperValue: {
    minWidth: 72,
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
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
