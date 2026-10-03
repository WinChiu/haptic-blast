import React, { useState, useMemo } from 'react';
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

import { useCompass } from '../hooks/useCompass';
import { useGuidance, HAPTIC_STYLE } from '../hooks/useGuidance';
import { useFeedback } from '../hooks/FeedbackContext';
import { GlobalStore } from '../util/globals';
import { addRound, updateRoundTiming } from '../util/store';
import { fetchRoute, Coord } from '../util/routing';
import { DESTINATION } from '../util/config';

import { useAudioPlayer } from 'expo-audio';

const ENDING_SOURCE = require('../assets/Ending.m4a');

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const rounds = (useSelector as any)((state: any) => state.userData.round);
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const endingPlayer = useAudioPlayer(ENDING_SOURCE);
  const { hapticEnabled, soundEnabled } = useFeedback();
  const feedbackText = useMemo(() => {
    if (hapticEnabled && soundEnabled) return 'Hybrid Mode';
    if (hapticEnabled) return 'Haptic Mode';
    if (soundEnabled) return 'Audio Mode';
    return 'No Feedback';
  }, [hapticEnabled, soundEnabled]);

  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [route, setRoute] = useState<Coord[] | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  const [centerTrigger, setCenterTrigger] = useState(0);
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
  const [showHapticOverlay, setShowHapticOverlay] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null
  );
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);

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

  const targetBearing = useMemo(() => {
    if (!userLocation) return 0;

    // Target the next checkpoint if available, otherwise the final destination
    if (!nextCheckpoint) return 0;

    const target = {
      lat: nextCheckpoint.latitude,
      lng: nextCheckpoint.longitude,
    };

    const lat1 = (userLocation[0] * Math.PI) / 180;
    const lat2 = (target.lat * Math.PI) / 180;
    const dLon = ((target.lng - userLocation[1]) * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;

    return (bearing + 360) % 360;
  }, [userLocation, nextCheckpoint]);

  // ✅ Unified Guidance Hook
  useGuidance(
    heading,
    targetBearing,
    isNavigating,
    hapticEnabled,
    soundEnabled
  );

  const handleCheckpointUpdate = (
    checkpoint: { latitude: number; longitude: number } | null
  ) => {
    setNextCheckpoint(checkpoint);
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
              hapticStyle: HAPTIC_STYLE,
            })
          );
        }
      }

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

    setIsLoadingRoute(true);
    try {
      setRoute(await fetchRoute(start, DESTINATION));
      setIsPreviewMode(true);
    } catch (e: any) {
      Alert.alert('Could not get route', e?.message ?? 'Unknown error');
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const handleStartNavigation = () => {
    if (!isPreviewMode) return;

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
            hapticStyle: HAPTIC_STYLE,
          },
          mistake: [],
        })
      );
    }

    setIsNavigating(true);
    setCenterTrigger((c) => c + 1);
  };

  const handleCloseOverlay = () => {
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
            hapticStyle: HAPTIC_STYLE,
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
          // Prevent infinite loop by checking if values actually changed
          const newLoc: [number, number] = [loc.latitude, loc.longitude];
          setUserLocation((prev) => {
            if (!prev || prev[0] !== newLoc[0] || prev[1] !== newLoc[1]) {
              return newLoc;
            }
            return prev;
          });

          setGpsHeading((prev) => (prev !== loc.heading ? loc.heading : prev));
        }}
        heading={heading}
        onNextCheckpointUpdate={handleCheckpointUpdate}
        mockUserLocation={finalMockLocation}
        route={isPreviewMode ? route : null}
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
                    style={styles.startButton}
                    onPress={handleStartNavigation}
                  >
                    <Text style={styles.startButtonText}>Start</Text>
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
                  <TouchableOpacity
                    style={[styles.startButton, { backgroundColor: '#333' }]} // Reuse start button style for Preview
                    onPress={handlePreviewRoute}
                    disabled={isLoadingRoute}
                  >
                    {isLoadingRoute ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.startButtonText}>Preview Route</Text>
                    )}
                  </TouchableOpacity>

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
