import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { RadarIcon, CurrentLocationIcon } from '../components/Icons';
import Map from '../components/Map';
import HapticCompass from '../components/HapticCompass';
import Joystick from '../components/Joystick';
import GuidanceTip from '../components/GuidanceTip';
import GuidanceReminder from '../components/GuidanceReminder';
import {
  loadGuidancePrefs,
  saveReminderPreference,
  recordJourneyFinished,
} from '../util/guidancePrefs';
import { chooseTipMode, TipMode } from '../util/tipMode';
import { Recording, Sample, motionRow } from '../util/recorder';
import { DeviceMotion } from 'expo-sensors';
import { isFixGoodToStart } from '../util/gps';
import { loadRecordingPrefs, saveRecording } from '../util/recordingStorage';

import { useCompass } from '../hooks/useCompass';
import { useGuidance } from '../hooks/useGuidance';
import { BUZZ_BACKEND } from '../hooks/useBuzz';
import { useHapticSettings } from '../util/hapticSettings';
import { effectiveDeadband, hapticStyleOf } from '../util/haptics';
import { useFeedback } from '../hooks/FeedbackContext';
import { GlobalStore } from '../util/globals';
import { addRound, updateRoundTiming } from '../util/store';
import { fetchRoute, Coord, RouteError } from '../util/routing';
import { distanceMeters } from '../util/geo';

import { useAudioPlayer } from 'expo-audio';

const ENDING_SOURCE = require('../assets/Ending.m4a');

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const rounds = (useSelector as any)((state: any) => state.userData.round);
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const endingPlayer = useAudioPlayer(ENDING_SOURCE);
  const { hapticEnabled, soundEnabled } = useFeedback();
  // How the phone vibrates now (Settings -> Haptic tuning); recorded with every round
  const hapticSettings = useHapticSettings();
  const hapticStyle = hapticStyleOf(BUZZ_BACKEND !== 'none', hapticSettings.mode);
  const feedbackText = useMemo(() => {
    if (hapticEnabled && soundEnabled) return 'Hybrid Mode';
    if (hapticEnabled) return 'Haptic Mode';
    if (soundEnabled) return 'Audio Mode';
    return 'No Feedback';
  }, [hapticEnabled, soundEnabled]);

  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [route, setRoute] = useState<Coord[] | null>(null);
  const [destination, setDestination] = useState<Coord | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  // "How to follow the guidance": a full tip before the journey, or a small
  // reminder during its first seconds (see chooseTipMode)
  const [showTip, setShowTip] = useState(false);
  // 'start' = the tip gates the journey; 'info' = opened from the small reminder
  const [tipPurpose, setTipPurpose] = useState<'start' | 'info'>('start');
  const [showReminder, setShowReminder] = useState(false);
  const reminderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (reminderTimerRef.current) clearTimeout(reminderTimerRef.current);
  }, []);
  const hideReminder = () => {
    if (reminderTimerRef.current) clearTimeout(reminderTimerRef.current);
    setShowReminder(false);
  };

  const [centerTrigger, setCenterTrigger] = useState(0);
  // Where the guidance measures from: the GPS position pulled onto the planned
  // path when the user is near it (see snapToRoute), reported by the map
  const [guide, setGuide] = useState<{
    position: Coord;
    snapped: boolean;
    snapDistance: number | null;
  } | null>(null);
  const [nextCheckpoint, setNextCheckpoint] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  /* New State for Compass Visibility */
  const [showCompassContent, setShowCompassContent] = useState(true);
  const userUid = (useSelector as any)(
    (state: any) => state.userData.userProfile.Uid
  );
  const userName = (useSelector as any)(
    (state: any) => state.userData.userProfile.Name
  );

  const [isNavigating, setIsNavigating] = useState(false);

  // Keep the screen on during a journey. A locked screen suspends the app (no
  // GPS, compass, guidance or recording) and haptics do not play in the
  // background. Loaded lazily and wrapped in try/catch so a build without the
  // native module (made before expo-keep-awake was added) keeps working.
  useEffect(() => {
    if (!isNavigating) return;
    let keepAwake: typeof import('expo-keep-awake') | null = null;
    try {
      keepAwake = require('expo-keep-awake');
      keepAwake?.activateKeepAwakeAsync('journey').catch(() => {});
      console.log('[nav] screen kept awake for the journey');
    } catch {
      console.log('[nav] keep-awake not available in this build; screen may lock');
    }
    return () => {
      try {
        keepAwake?.deactivateKeepAwake('journey').catch(() => {});
      } catch {}
    };
  }, [isNavigating]);
  const [showHapticOverlay, setShowHapticOverlay] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null
  );
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  // Accuracy (metres) of the latest GPS fix. A route starts at the GPS position,
  // so Preview Route and Start wait for a good fix (see util/gps.ts).
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  /* Debug Mode State - Moved to Redux */
  const isDebugMode = (useSelector as any)(
    (state: any) => state.appSettings?.debugMode || false
  );
  const [mockLocation, setMockLocation] = useState<{
    latitude: number;
    longitude: number;
    heading: number;
  } | null>(null);

  // Initialize mock location when debug mode is enabled
  React.useEffect(() => {
    if (isDebugMode && !mockLocation && userLocation) {
      setMockLocation({
        latitude: userLocation[0],
        longitude: userLocation[1],
        heading: gpsHeading || 0,
      });
    } else if (!isDebugMode) {
      setMockLocation(null);
    }
  }, [isDebugMode]);

  const heading = useCompass();

  // Journey recording (Settings -> Walk recording). The refs hold the latest
  // values so the location callback can read them without re-rendering.
  const headingRef = useRef(0);
  headingRef.current = heading;
  const checkpointIndexRef = useRef<number | null>(null);
  const snapDistanceRef = useRef<number | null>(null);
  snapDistanceRef.current = guide?.snapDistance ?? null;
  const recordingRef = useRef<{
    recording: Recording;
    startedAtMs: number;
    lastSavedMs: number;
  } | null>(null);
  const SAVE_EVERY_MS = 60_000; // so little is lost if the app is killed mid-walk
  const MIN_SAMPLE_GAP_MS = 450; // about 2 samples a second, whatever the update rate
  const lastSampleMsRef = useRef(0);

  // Optional raw motion readings (accelerometer + gyroscope) for the recording
  const MOTION_INTERVAL_MS = 50; // 20 a second
  const motionSubRef = useRef<{ remove: () => void } | null>(null);
  const stopMotionCapture = () => {
    motionSubRef.current?.remove();
    motionSubRef.current = null;
  };
  const startMotionCapture = async () => {
    try {
      if (!(await DeviceMotion.isAvailableAsync())) return;
      if (!recordingRef.current) return; // the journey ended while we were checking
      DeviceMotion.setUpdateInterval(MOTION_INTERVAL_MS);
      motionSubRef.current = DeviceMotion.addListener((reading) => {
        const active = recordingRef.current;
        if (!active) return;
        (active.recording.motion ??= []).push(
          motionRow(Date.now() - active.startedAtMs, reading)
        );
      });
    } catch {
      // no motion sensors: the recording simply has none
    }
  };
  useEffect(() => stopMotionCapture, []);

  const startRecording = async (tipShown: TipMode) => {
    const prefs = await loadRecordingPrefs();
    if (!prefs.enabled) return;
    const now = Date.now();
    recordingRef.current = {
      startedAtMs: now,
      lastSavedMs: now,
      recording: {
        meta: {
          started: new Date(now).toISOString(),
          phone_position: prefs.phonePosition,
          label: prefs.label.replace(/[\r\n=]/g, ' ').trim() || 'unlabelled',
          haptic: String(hapticEnabled),
          sound: String(soundEnabled),
          haptic_style: hapticStyle,
          haptic_mode: hapticSettings.mode,
          deadband_deg: String(hapticSettings.deadband),
          pulse_ms: String(hapticSettings.pulseMs),
          confirm_ms: String(hapticSettings.confirmMs),
          tip: tipShown,
          debug_mode: String(isDebugMode),
          dev_build: String(__DEV__),
          heading_reference: 'true-north-preferred', // recordings made before this are magnetic north
        },
        samples: [],
      },
    };
    if (prefs.motion) {
      recordingRef.current.recording.meta.motion_hz = String(1000 / MOTION_INTERVAL_MS);
      startMotionCapture();
    }
    console.log(
      `[rec] started (phone position: ${prefs.phonePosition}${prefs.motion ? ', with motion sensors' : ''})`
    );
  };

  const stopRecording = (reason: 'finished' | 'cancelled') => {
    const active = recordingRef.current;
    if (!active) return;
    recordingRef.current = null;
    stopMotionCapture();
    active.recording.meta.ended = reason;
    saveRecording(active.recording);
    console.log(`[rec] saved (${reason}, ${active.recording.samples.length} samples)`);
  };

  const recordSample = (loc: {
    latitude: number;
    longitude: number;
    heading: number | null;
    speed: number | null;
    accuracy?: number | null;
  }) => {
    const active = recordingRef.current;
    if (!active) return;
    const now = Date.now();
    if (now - lastSampleMsRef.current < MIN_SAMPLE_GAP_MS) return;
    lastSampleMsRef.current = now;
    const sample: Sample = {
      t: now - active.startedAtMs,
      lat: loc.latitude,
      lng: loc.longitude,
      accuracy: loc.accuracy ?? null,
      speed: loc.speed !== null && loc.speed >= 0 ? loc.speed : null,
      course: loc.heading !== null && loc.heading >= 0 ? loc.heading : null, // iOS gives -1 when unknown
      phoneHeading: headingRef.current,
      targetBearing: targetBearingRef.current,
      checkpoint: checkpointIndexRef.current,
      snapM: snapDistanceRef.current,
      zone: zoneRef.current,
    };
    active.recording.samples.push(sample);
    if (now - active.lastSavedMs >= SAVE_EVERY_MS) {
      active.lastSavedMs = now;
      saveRecording(active.recording);
    }
  };

  const targetBearing = useMemo(() => {
    if (!userLocation) return 0;

    // Target the next checkpoint if available, otherwise the final destination
    if (!nextCheckpoint) return 0;

    const target = {
      lat: nextCheckpoint.latitude,
      lng: nextCheckpoint.longitude,
    };

    const fromLat = guide ? guide.position.latitude : userLocation[0];
    const fromLng = guide ? guide.position.longitude : userLocation[1];
    const lat1 = (fromLat * Math.PI) / 180;
    const lat2 = (target.lat * Math.PI) / 180;
    const dLon = ((target.lng - fromLng) * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;

    return (bearing + 360) % 360;
  }, [userLocation, nextCheckpoint, guide]);

  const targetBearingRef = useRef<number | null>(null);
  targetBearingRef.current = nextCheckpoint ? targetBearing : null;

  // ✅ Unified Guidance Hook
  // The silent zone widens when GPS is poor, so the phone does not buzz at errors
  // that are only position noise (see effectiveDeadband in util/haptics.ts).
  const zoneDegrees = useMemo(() => {
    if (!userLocation || !nextCheckpoint) return hapticSettings.deadband;
    const from = guide ? guide.position : { latitude: userLocation[0], longitude: userLocation[1] };
    return effectiveDeadband(
      hapticSettings.deadband,
      gpsAccuracy,
      !!guide?.snapped,
      distanceMeters(from, nextCheckpoint)
    );
  }, [userLocation, nextCheckpoint, guide, gpsAccuracy, hapticSettings.deadband]);
  const zoneRef = useRef<number | null>(null);
  zoneRef.current = zoneDegrees;

  useGuidance(
    heading,
    targetBearing,
    isNavigating,
    hapticEnabled,
    soundEnabled,
    zoneDegrees
  );

  const handleCheckpointUpdate = (
    checkpoint: { latitude: number; longitude: number } | null,
    index?: number,
    _total?: number,
    guideInfo?: {
      position: Coord;
      snapped: boolean;
      snapDistance: number | null;
    }
  ) => {
    checkpointIndexRef.current = index ?? null;
    setNextCheckpoint(checkpoint);
    if (guideInfo) setGuide(guideInfo);
    if (checkpoint === null && isNavigating) {
      // Reached destination

      // Only update round timing if user is logged in
      if (userUid) {
        const finishTime = Date.now();
        const currentRoundIndex = rounds.length - 1;

        if (currentRoundIndex >= 0 && rounds[currentRoundIndex]) {
          const startTime = rounds[currentRoundIndex].timeSpent.start;
          const duration = finishTime - startTime;

          dispatch(
            updateRoundTiming(currentRoundIndex, {
              finish: finishTime,
              duration: duration,
              hapticEnabled,
              soundEnabled,
              hapticStyle,
            })
          );
        }
      }

      console.log('[nav] finished: destination reached, showing completion');
      hideReminder();
      recordJourneyFinished();
      stopRecording('finished');
      endingPlayer.seekTo(0);
      endingPlayer.play();
      setShowCompletionModal(true);

      setIsNavigating(false);
      setShowHapticOverlay(false);
      setIsPreviewMode(false); // Reset preview mode on finish
    }
  };

  const handlePreviewRoute = async () => {
    // In debug mode the joystick position is the start point
    const start = finalMockLocation
      ? {
          latitude: finalMockLocation.latitude,
          longitude: finalMockLocation.longitude,
        }
      : userLocation
        ? { latitude: userLocation[0], longitude: userLocation[1] }
        : null;

    if (!start) {
      Alert.alert('No location yet', 'Waiting for your GPS position.');
      return;
    }
    if (!destination) {
      Alert.alert('No destination', 'Long-press the map to choose where to go.');
      return;
    }
    if (!gpsGood) {
      Alert.alert('GPS not accurate yet', 'Wait a moment for a better GPS signal.');
      return;
    }

    if (distanceMeters(start, destination) < 15) {
      Alert.alert('Already there', 'The destination is right next to you.');
      return;
    }

    setIsLoadingRoute(true);
    try {
      const fetched = await fetchRoute(start, destination);
      console.log(
        `[route] loaded ${fetched.length} points, ${distanceMeters(start, destination).toFixed(0)} m straight line`
      );
      setRoute(fetched);
      setIsPreviewMode(true);
    } catch (e: any) {
      const routeError = e instanceof RouteError ? e : null;
      console.log(`[route] failed: ${routeError?.kind ?? 'unknown'} - ${e?.message}`);
      const title =
        routeError?.kind === 'out-of-area'
          ? 'Outside the map area'
          : routeError?.kind === 'server-unreachable' ||
              routeError?.kind === 'timeout'
            ? 'Server not reachable'
            : 'Could not get route';
      const buttons = routeError?.retryable
        ? [
            { text: 'Cancel', style: 'cancel' as const },
            { text: 'Retry', onPress: handlePreviewRoute },
          ]
        : [{ text: 'OK' }];
      Alert.alert(title, e?.message ?? 'Unknown error', buttons);
    } finally {
      setIsLoadingRoute(false);
    }
  };

  // Called by the map when the user has left the route while navigating
  const isReroutingRef = useRef(false);
  const handleOffRoute = async (location: Coord) => {
    if (!destination || isReroutingRef.current) return;
    isReroutingRef.current = true;
    try {
      const fresh = await fetchRoute(location, destination);
      console.log(`[route] re-routed: ${fresh.length} new points`);
      setRoute(fresh);
    } catch (e: any) {
      // Keep the old route; the map will try again after its cooldown
      console.log(`[route] re-route failed: ${e?.message}`);
    } finally {
      isReroutingRef.current = false;
    }
  };

  const startingRef = useRef(false);
  const handleStartNavigation = async () => {
    if (!isPreviewMode || isNavigating || startingRef.current) return;
    if (!gpsGood) return; // the Start button is disabled meanwhile
    startingRef.current = true; // ignore a second tap while preferences load
    const prefs = await loadGuidancePrefs();
    startingRef.current = false;
    const mode = chooseTipMode(prefs.reminder, prefs.journeysFinished);
    console.log(
      `[tip] mode=${mode} (reminder=${prefs.reminder}, journeys finished=${prefs.journeysFinished})`
    );

    if (mode === 'full') {
      setTipPurpose('start');
      setShowTip(true); // the journey begins when the tip is dismissed
      return;
    }

    beginNavigation(mode);
    if (mode === 'compact') {
      setShowReminder(true);
      reminderTimerRef.current = setTimeout(
        () => setShowReminder(false),
        GlobalStore.GUIDANCE_TIP.compactSeconds * 1000
      );
    }
  };

  const handleTipDismissed = () => {
    setShowTip(false);
    if (tipPurpose === 'start') beginNavigation('full');
  };

  const handleTipOptOut = () => {
    console.log('[tip] user chose not to be reminded again');
    saveReminderPreference('off');
    handleTipDismissed();
  };

  const beginNavigation = (tipShown: TipMode) => {
    // Only track rounds if user is logged in
    if (userUid) {
      const startTime = Date.now();
      dispatch(
        addRound({
          timeSpent: {
            start: startTime,
            finish: 0,
            duration: 0,
            stop: 0,
            hapticEnabled,
            soundEnabled,
            hapticStyle,
            guidanceTip: tipShown,
          },
          mistake: [],
        })
      );
    }

    console.log(
      `[nav] started (haptic=${hapticEnabled}, sound=${soundEnabled}, logged in=${!!userUid}, tip=${tipShown})`
    );
    startRecording(tipShown);
    setIsNavigating(true);
    setCenterTrigger((c) => c + 1);
  };

  const handleCloseOverlay = () => {
    console.log(`[nav] cancelled (was navigating=${isNavigating})`);
    setGuide(null);
    hideReminder();
    stopRecording('cancelled');
    // Update stop time if user is logged in and navigating
    if (userUid && isNavigating) {
      const stopTime = Date.now();

      const currentRoundIndex = rounds.length - 1;

      if (currentRoundIndex >= 0 && rounds[currentRoundIndex]) {
        const startTime = rounds[currentRoundIndex].timeSpent.start;
        const duration = stopTime - startTime;

        dispatch(
          updateRoundTiming(currentRoundIndex, {
            stop: stopTime,
            duration: duration,
            hapticEnabled,
            soundEnabled,
            hapticStyle,
          })
        );
      }
    }

    setIsNavigating(false);
    setShowHapticOverlay(false);
    setNextCheckpoint(null);
    setIsPreviewMode(false);
  };

  const finalMockLocation = useMemo(() => {
    return isDebugMode && mockLocation
      ? { ...mockLocation, heading: heading }
      : null;
  }, [isDebugMode, mockLocation, heading]);

  // The joystick position (debug mode) has no GPS accuracy, so it never waits
  const gpsGood = finalMockLocation ? true : isFixGoodToStart(gpsAccuracy);
  // Plain words for the walker; the accuracy number is only for research mode
const gpsWaitLabel = isDebugMode
    ? `Waiting for GPS (±${Math.round(gpsAccuracy ?? 0)} m)`
    : 'Finding your location…';

  const handleMockMove = (direction: 'up' | 'down' | 'left' | 'right') => {
    setMockLocation((prev) => {
      // Initialize if null
      let current = prev;
      if (!current) {
        current = {
          latitude: userLocation ? userLocation[0] : 37.78825,
          longitude: userLocation ? userLocation[1] : -122.4324,
          heading: gpsHeading || 0,
        };
      }

      const STEP = GlobalStore.DEBUG_MODE.STEP;
      let { latitude, longitude, heading } = current;

      switch (direction) {
        case 'up':
          latitude += STEP;
          heading = 0;
          break;
        case 'down':
          latitude -= STEP;
          heading = 180;
          break;
        case 'left':
          longitude -= STEP;
          heading = 270;
          break;
        case 'right':
          longitude += STEP;
          heading = 90;
          break;
      }

      return { latitude, longitude, heading };
    });
  };

  return (
    <View style={styles.container}>
      <Map
        // selectedLocation prop removed from Map
        centerOnUserTrigger={centerTrigger}
        onUserLocationUpdate={(loc) => {
          setGpsAccuracy(loc.accuracy ?? null);

          // Fixes that are too inaccurate must not move the position the
          // route logic uses (they are still recorded below)
          if (loc.usable !== false) {
            // Prevent infinite loop by checking if values actually changed
            const newLoc: [number, number] = [loc.latitude, loc.longitude];
            setUserLocation((prev) => {
              if (!prev || prev[0] !== newLoc[0] || prev[1] !== newLoc[1]) {
                return newLoc;
              }
              return prev;
            });

            setGpsHeading((prev) =>
              prev !== loc.heading ? loc.heading : prev
            );
          }
          recordSample(loc);
        }}
        heading={heading}
        onNextCheckpointUpdate={handleCheckpointUpdate}
        mockUserLocation={finalMockLocation}
        route={isPreviewMode ? route : null}
        destination={destination}
        onOffRoute={isNavigating && destination ? handleOffRoute : undefined}
        onDestinationSelect={
          isPreviewMode || isNavigating ? undefined : setDestination
        }
      />

      <TouchableOpacity
        style={[
          styles.feedbackTag,
          isDebugMode && { backgroundColor: '#A855F7' },
        ]}
        onPress={() => (navigation as any).navigate('Tutorial')}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {isDebugMode && (
            <Ionicons
              name="bug-outline"
              size={18}
              color="white"
              style={{ marginRight: 8 }}
            />
          )}
          <Text style={styles.feedbackText}>
            {userUid ? userUid : 'Not login'} • {feedbackText}
          </Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={showHapticOverlay}
        animationType="none"
        onRequestClose={() => setShowHapticOverlay(false)}
      >
        <View style={styles.hapticOverlay}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => setShowHapticOverlay(false)}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#d4d4d4" />
            </TouchableOpacity>

            <View style={{ flex: 1, paddingLeft: 8 }}>
              <Text style={styles.headerTitle}>Compass</Text>
            </View>

            {/* TOGGLE BUTTON */}
            <TouchableOpacity
              onPress={() => setShowCompassContent(!showCompassContent)}
              style={styles.toggleButton}
            >
              <Ionicons
                name={showCompassContent ? 'eye' : 'eye-off'}
                size={24}
                color="#d4d4d4"
              />
            </TouchableOpacity>
          </View>
          {showCompassContent ? (
            <HapticCompass targetAngle={targetBearing} heading={heading} />
          ) : (
            <View style={styles.hiddenCompassContainer}>
              <Text style={styles.hiddenCompassText}>
                Compass is hidden. Click the eye icon to reveal.
              </Text>
            </View>
          )}
        </View>
      </Modal>

      {!showHapticOverlay && (
        <>
          {!isNavigating && (
            <View style={styles.bottomNav}>
              {isPreviewMode ? (
                <View style={styles.selectedLocationContainer}>
                  <TouchableOpacity
                    style={[styles.startButton, !gpsGood && { opacity: 0.6 }]}
                    onPress={handleStartNavigation}
                    disabled={!gpsGood}
                  >
                    <Text
                      style={styles.startButtonText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {gpsGood ? 'Start' : gpsWaitLabel}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCloseOverlay}
                  >
                    <Ionicons name="close" size={24} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.locateButton}
                    onPress={() => setCenterTrigger((c) => c + 1)}
                  >
                    <CurrentLocationIcon width={30} height={30} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.menuBar}>
                  {!destination ? (
                    // Step 1: choose where to go. No button yet, just what to do.
                    <View style={styles.stepPrompt}>
                      <Text style={styles.stepPromptTitle}>
                        Where do you want to go?
                      </Text>
                      <Text style={styles.stepPromptText}>
                        Press and hold on the map to choose a place.
                      </Text>
                    </View>
                  ) : (
                    // Step 2: a place is chosen; now the route can be previewed.
                    <TouchableOpacity
                      style={[
                        styles.startButton,
                        { backgroundColor: '#333' },
                        !gpsGood && { opacity: 0.6 },
                      ]}
                      onPress={handlePreviewRoute}
                      disabled={isLoadingRoute || !gpsGood}
                    >
                      {isLoadingRoute ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text
                          style={styles.startButtonText}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                        >
                          {gpsGood ? 'Preview Route' : gpsWaitLabel}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.locateButton}
                    onPress={() => setCenterTrigger((c) => c + 1)}
                  >
                    <CurrentLocationIcon width={30} height={30} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {isNavigating && (
            <>
              <View style={styles.bottomNav}>
                <View style={styles.selectedLocationContainer}>
                  <TouchableOpacity
                    style={styles.stopButton}
                    onPress={handleCloseOverlay}
                  >
                    <Text style={styles.stopButtonText}>Stop</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.compassButton}
                    onPress={() => setShowHapticOverlay(true)}
                  >
                    <RadarIcon width={30} height={30} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.locateButton}
                    onPress={() => setCenterTrigger((c) => c + 1)}
                  >
                    <CurrentLocationIcon width={30} height={30} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </>
      )}

      {/* Search Modal Removed */}

      {/* Completion Modal */}
      <GuidanceTip
        visible={showTip}
        onClose={handleTipDismissed}
        primaryLabel={tipPurpose === 'start' ? 'Got it, start' : 'Close'}
        onOptOut={tipPurpose === 'start' ? handleTipOptOut : undefined}
      />
      {showReminder && (
        <GuidanceReminder
          onShowSteps={() => {
            hideReminder();
            setTipPurpose('info');
            setShowTip(true);
          }}
        />
      )}

      <Modal
        visible={showCompletionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCompletionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons
              name="checkmark-circle"
              size={60}
              color="#13b028ff"
              style={{ marginBottom: 15 }}
            />
            <Text style={styles.modalTitle}>Complete!</Text>
            <Text style={styles.modalSubtitle}>
              You have reached your destination.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton]}
                onPress={() => {
                  setShowCompletionModal(false);
                  setNextCheckpoint(null);
                  setIsPreviewMode(false);
                }}
              >
                <Text style={styles.modalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Debug Controls */}
      <View style={styles.debugContainer}>
        {isDebugMode && (
          <View style={styles.joystickContainer}>
            <Joystick
              size={120}
              onMove={(angle, intensity) => {
                setMockLocation((prev) => {
                  if (!prev) return prev;
                  // Calculate movement vector
                  // 0 deg = North (Lat increase)
                  // 90 deg = East (Lng increase)

                  const speedMultiplier =
                    GlobalStore.DEBUG_MODE.STEP *
                    GlobalStore.DEBUG_MODE.SPEED_MULTIPLIER *
                    intensity;
                  const rad = (angle - 90) * (Math.PI / 180); // Convert back to Math angle (0=East) for cos/sin

                  // angle 0 (North) -> should be dy +
                  // angle 90 (East) -> should be dx +
                  // standard math: 0 deg = East (x+), 90 deg = South (y+) in screen coords?
                  // Let's stick to Map logic:
                  // Lat + is North. Lng + is East.

                  // Heading 0 (North) -> Lat +
                  // Heading 90 (East) -> Lng +
                  // Heading 180 (South) -> Lat -
                  // Heading 270 (West) -> Lng -

                  // dx = sin(heading) * speed
                  // dy = cos(heading) * speed

                  const hRad = angle * (Math.PI / 180);
                  const dLat = Math.cos(hRad) * speedMultiplier;
                  const dLng = Math.sin(hRad) * speedMultiplier;

                  return {
                    latitude: prev.latitude + dLat,
                    longitude: prev.longitude + dLng,
                    heading: angle,
                  };
                });
              }}
              onStop={() => {}}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  hapticOverlay: {
    flex: 1,
    backgroundColor: '#171717',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  menuBar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 15,
  },
  selectedLocationContainer: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    gap: 15,
  },
  startButton: {
    flex: 1,
    backgroundColor: '#13b028ff',
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  stepPrompt: {
    flex: 1,
    backgroundColor: '#262626',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 24,
  },
  stepPromptTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  stepPromptText: { color: '#d4d4d4', fontSize: 15, marginTop: 2 },
  startButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },

  locateButton: {
    backgroundColor: '#333',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3.84,
    elevation: 8,
  },
  cancelButton: {
    backgroundColor: '#ef4444',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3.84,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#ef4444',
  },

  stopButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  stopButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  compassButton: {
    backgroundColor: '#333',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  feedbackTag: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3.84,
    elevation: 8,
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'white',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    width: '100%',
    backgroundColor: '#171717',
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

  toggleButton: {
    padding: 8,
    borderRadius: 20,
    marginLeft: 'auto', // Pushes it to the right
  },
  hiddenCompassContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hiddenCompassText: {
    color: '#a3a3a3',
    fontSize: 16,
    textAlign: 'center',
    maxWidth: '80%',
  },
  searchButton: {
    backgroundColor: '#333',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3.84,
    elevation: 8,
    marginBottom: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#262626',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#a3a3a3',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    backgroundColor: '#404040',
    borderRadius: 10,
    padding: 15,
    color: 'white',
    fontSize: 16,
    marginBottom: 20,
  },
  defaultButton: {
    backgroundColor: '#333',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 15,
    alignSelf: 'flex-start',
  },
  defaultButtonText: {
    color: '#0EA5E9', // Sky blue to indicate action
    fontSize: 14,
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 15,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelModalButton: {
    backgroundColor: '#ef4444',
  },
  confirmModalButton: {
    backgroundColor: '#0EA5E9',
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  debugContainer: {
    position: 'absolute',
    bottom: 140,
    right: 26,
    alignItems: 'flex-end',
    gap: 10,
  },
  debugButton: {
    width: 46,
    height: 46,
    borderRadius: 25,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3.84,
    elevation: 8,
  },
  debugButtonActive: {
    backgroundColor: '#A855F7',
  },
  joystickContainer: {
    marginVertical: 10,
    marginRight: 10,
  },
  // REMOVED old dpad styles
});
