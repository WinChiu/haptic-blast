import React, { useState, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Map from '../components/Map';
import HapticCompass from '../components/HapticCompass';

import { useCompass } from '../hooks/useCompass';
import { useHapticGuidance } from '../hooks/useHapticGuidance';
import { useSoundGuidance } from '../hooks/useSoundGuidance';
import { useFeedback } from '../hooks/FeedbackContext';

const { width } = Dimensions.get('window');

const formatDistance = (meters: number | null) => {
  if (!meters || meters <= 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

const formatDuration = (seconds: number | null) => {
  if (!seconds || seconds <= 0) return '';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '< 1 min';
  if (minutes === 1) return '1 min';
  return `${minutes} min`;
};

export default function HomeScreen() {
  const navigation = useNavigation();

  const { hapticEnabled, soundEnabled } = useFeedback();

  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showHapticOverlay, setShowHapticOverlay] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [centerTrigger, setCenterTrigger] = useState(0);
  const [nextCheckpoint, setNextCheckpoint] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const heading = useCompass();

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
    setRouteDistance(null);
    setRouteDuration(null);
  };

  const distanceLabel = formatDistance(routeDistance);
  const durationLabel = formatDuration(routeDuration ? routeDuration * 3 : 0);

  return (
    <View style={styles.container}>
      <Map
        onLocationSelect={handleLocationSelect}
        selectedLocation={selectedLocation}
        onRouteInfo={(dist, dur) => {
          setRouteDistance(dist);
          setRouteDuration(dur);
        }}
        isNavigating={isNavigating}
        centerOnUserTrigger={centerTrigger}
        onUserLocationUpdate={setUserLocation}
        heading={heading}
        onNextCheckpointUpdate={setNextCheckpoint}
      />

      {showHapticOverlay && (
        <View style={styles.hapticOverlay}>
          <HapticCompass targetAngle={targetBearing} heading={heading} />
          <TouchableOpacity
            style={styles.closeHapticButton}
            onPress={() => setShowHapticOverlay(false)}
          >
            <Text style={styles.closeHapticText}>Close Haptics</Text>
          </TouchableOpacity>
        </View>
      )}

      {!showHapticOverlay && (
        <>
          {!isNavigating && (
            <View style={styles.bottomNav}>
              {selectedLocation ? (
                <TouchableOpacity style={styles.goButton} onPress={handleStartNavigation}>
                  <Text style={styles.goButtonText}>GO</Text>
                  <Text style={styles.goButtonSubText}>{durationLabel} • {distanceLabel}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.menuBar}>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => (navigation as any).navigate('Tutorial')}
                  >
                    <Ionicons name="menu" size={24} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => setCenterTrigger((c) => c + 1)}
                  >
                    <Ionicons name="locate" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {isNavigating && (
            <View style={styles.navBar}>
              <View style={styles.navInfo}>
                <Text style={styles.navDuration}>{durationLabel}</Text>
                <Text style={styles.navDistance}>{distanceLabel}</Text>
              </View>

              <View style={styles.navActions}>
                <TouchableOpacity style={[styles.iconButton, { backgroundColor: '#ef4444' }]} onPress={handleCloseOverlay}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => setCenterTrigger((c) => c + 1)}>
                  <Ionicons name="locate" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {isNavigating && (
            <TouchableOpacity style={styles.fab} onPress={() => setShowHapticOverlay(true)}>
              <MaterialCommunityIcons name="waves" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </>
      )}
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
  closeHapticButton: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    padding: 15,
    backgroundColor: '#333',
    borderRadius: 30,
  },
  closeHapticText: {
    color: '#fff',
    fontWeight: '600',
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
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
  },
  goButton: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  goButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  goButtonSubText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  iconButton: {
    backgroundColor: '#333',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  navBar: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#171717',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  navInfo: {
    flex: 1,
  },
  navDuration: {
    color: '#22c55e',
    fontSize: 24,
    fontWeight: 'bold',
  },
  navDistance: {
    color: '#a3a3a3',
    fontSize: 14,
  },
  navActions: {
    flexDirection: 'row',
    gap: 10,
  },
  fab: {
    position: 'absolute',
    bottom: 110,
    right: 20,
    backgroundColor: '#0ea5e9',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
});
