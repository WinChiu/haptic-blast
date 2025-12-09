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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  RadarIcon,
  CurrentLocationIcon,
  SearchIcon,
} from '../components/Icons';
import Map from '../components/Map';
import HapticCompass from '../components/HapticCompass';

import { useCompass } from '../hooks/useCompass';
import { useHapticGuidance } from '../hooks/useHapticGuidance';
import { useSoundGuidance } from '../hooks/useSoundGuidance';
import { useFeedback } from '../hooks/FeedbackContext';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const navigation = useNavigation();
  const { hapticEnabled, soundEnabled } = useFeedback();
  const feedbackText = useMemo(() => {
    if (hapticEnabled && soundEnabled) return 'Hybrid Mode';
    if (hapticEnabled) return 'Haptic Mode';
    if (soundEnabled) return 'Audio Mode';
    return 'No Feedback';
  }, [hapticEnabled, soundEnabled]);

  const [selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showHapticOverlay, setShowHapticOverlay] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null
  );
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);

  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [centerTrigger, setCenterTrigger] = useState(0);
  const [nextCheckpoint, setNextCheckpoint] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const heading = useCompass(gpsHeading, speed);

  const targetBearing = useMemo(() => {
    if (!userLocation) return 0;

    // Target the next checkpoint if available, otherwise the final destination
    const target = nextCheckpoint
      ? { lat: nextCheckpoint.latitude, lng: nextCheckpoint.longitude }
      : selectedLocation;

    if (!target) return 0;

    const lat1 = (userLocation[0] * Math.PI) / 180;
    const lat2 = (target.lat * Math.PI) / 180;
    const dLon = ((target.lng - userLocation[1]) * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;

    return (bearing + 360) % 360;
  }, [userLocation, selectedLocation, nextCheckpoint]);

  // ✅ Enable guidance only if user toggled it ON
  useHapticGuidance(heading, targetBearing, isNavigating && hapticEnabled);
  useSoundGuidance(heading, targetBearing, isNavigating && soundEnabled);

  const handleLocationSelect = (lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
    setIsNavigating(false);
    setShowHapticOverlay(false);
  };

  const handleStartNavigation = () => {
    if (!selectedLocation) return;
    setIsNavigating(true);
    setCenterTrigger((c) => c + 1);
  };

  const handleCloseOverlay = () => {
    setSelectedLocation(null);
    setIsNavigating(false);
    setShowHapticOverlay(false);
    setNextCheckpoint(null);
  };

  const handleSearchSubmit = () => {
    // Expected format "lat, lng"
    const parts = searchQuery.split(',');
    if (parts.length !== 2) {
      Alert.alert('Invalid Format', 'Please enter "Latitude, Longitude"');
      return;
    }
    const lat = parseFloat(parts[0].trim());
    const lng = parseFloat(parts[1].trim());

    if (isNaN(lat) || isNaN(lng)) {
      Alert.alert('Invalid Coordinates', 'Please enter valid numbers.');
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      Alert.alert('Out of Range', 'Latitude or Longitude is out of bounds.');
      return;
    }

    setSelectedLocation({ lat, lng });
    setShowSearchModal(false);
    setSearchQuery('');
  };

  return (
    <View style={styles.container}>
      <Map
        onLocationSelect={handleLocationSelect}
        selectedLocation={selectedLocation}
        centerOnUserTrigger={centerTrigger}
        onUserLocationUpdate={(loc) => {
          setUserLocation([loc.latitude, loc.longitude]);
          setGpsHeading(loc.heading);
          setSpeed(loc.speed);
        }}
        heading={heading}
        onNextCheckpointUpdate={(checkpoint) => {
          setNextCheckpoint(checkpoint);
          if (checkpoint === null && isNavigating) {
            // Reached destination
            setShowCompletionModal(true);
            setIsNavigating(false);
            setShowHapticOverlay(false);
          }
        }}
      />

      <TouchableOpacity
        style={styles.feedbackTag}
        onPress={() => (navigation as any).navigate('Tutorial')}
      >
        <Text style={styles.feedbackText}>{feedbackText}</Text>
      </TouchableOpacity>

      {showHapticOverlay && (
        <View style={styles.hapticOverlay}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => setShowHapticOverlay(false)}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#d4d4d4" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Compass</Text>
          </View>
          <HapticCompass targetAngle={targetBearing} heading={heading} />
        </View>
      )}

      {!showHapticOverlay && (
        <>
          {!isNavigating && (
            <View style={styles.bottomNav}>
              {selectedLocation ? (
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
                    style={styles.searchButton}
                    onPress={() => setShowSearchModal(true)}
                  >
                    <SearchIcon width={30} height={30} color="#fff" />
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

      {/* Search Input Modal */}
      <Modal
        visible={showSearchModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSearchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter Destination</Text>
            <Text style={styles.modalSubtitle}>
              Format: Latitude, Longitude
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 37.7749, -122.4194"
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={setSearchQuery}
              keyboardType="numbers-and-punctuation"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => setShowSearchModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton]}
                onPress={handleSearchSubmit}
              >
                <Text style={styles.modalButtonText}>Search</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
            <TouchableOpacity
              style={[styles.modalButton, styles.confirmModalButton]}
              onPress={() => {
                setShowCompletionModal(false);
                setSelectedLocation(null);
                setNextCheckpoint(null);
              }}
            >
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  hapticOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
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
    flexDirection: 'column',
    alignItems: 'flex-end',
    width: '100%',
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
    position: 'absolute',
    top: 0,
    zIndex: 10,
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
});
