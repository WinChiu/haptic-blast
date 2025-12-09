import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Alert, Text } from 'react-native';
import MapView, {
  Marker,
  Polyline,
  UrlTile,
  PROVIDER_DEFAULT,
} from 'react-native-maps';
import * as Location from 'expo-location';
import { API_ENDPOINTS } from '../util/config';
import { GlobalStore } from '../util/globals';

interface MapProps {
  onLocationSelect: (lat: number, lng: number) => void;
  selectedLocation: { lat: number; lng: number } | null;
  centerOnUserTrigger: number;
  onUserLocationUpdate?: (location: {
    latitude: number;
    longitude: number;
    heading: number | null;
    speed: number | null;
  }) => void;
  heading?: number;
  onNextCheckpointUpdate?: (
    checkpoint: {
      latitude: number;
      longitude: number;
    } | null,
    index?: number,
    total?: number
  ) => void;
  mockUserLocation?: {
    latitude: number;
    longitude: number;
    heading: number;
  } | null;
}

function getDistanceFromLatLonInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2 - lat1);
  var dLon = deg2rad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in km
  return d * 1000; // Distance in m
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

export default function Map({
  onLocationSelect,
  selectedLocation,
  centerOnUserTrigger,
  onUserLocationUpdate,
  heading = 0,
  onNextCheckpointUpdate,
  mockUserLocation = null,
}: MapProps & { heading?: number }) {
  const mapRef = useRef<MapView>(null);
  const lastLocationRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [lastFetchLocation, setLastFetchLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [routeCheckpoints, setRouteCheckpoints] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [currentCheckpointIndex, setCurrentCheckpointIndex] = useState(0);
  const [currentTotalCheckpoint, setCurrentTotalCheckpoint] = useState(0);
  const [previousTotalCheckpoint, setPreviousTotalCheckpoint] = useState(0);
  const [polylineWidth, setPolylineWidth] = useState(3.9);

  // Set polyline width to 4 when route is loaded to rerender the route
  useEffect(() => {
    if (routeCoordinates.length > 0) {
      setTimeout(() => {
        setPolylineWidth(4);
      }, 100);
    }
  }, [routeCoordinates]);

  // Reset index when route changes
  useEffect(() => {
    if (currentTotalCheckpoint && previousTotalCheckpoint) {
      if (currentTotalCheckpoint < previousTotalCheckpoint) {
        setCurrentCheckpointIndex(currentCheckpointIndex - 1);
      }
    }
    setPreviousTotalCheckpoint(currentTotalCheckpoint);
  }, [routeCheckpoints]);

  // Calculate Next Checkpoint
  useEffect(() => {
    if (
      !userLocation ||
      routeCheckpoints.length === 0 ||
      !onNextCheckpointUpdate
    )
      return;

    if (currentCheckpointIndex >= routeCheckpoints.length) {
      onNextCheckpointUpdate(null as any); // Or handle "finished" state
      return;
    }

    const currentTarget = routeCheckpoints[currentCheckpointIndex];
    if (!currentTarget) return;

    const dist = getDistanceFromLatLonInMeters(
      userLocation.latitude,
      userLocation.longitude,
      currentTarget.latitude,
      currentTarget.longitude
    );

    // Check if reached
    if (dist <= GlobalStore.CHECKPOINT_THRESHOLD) {
      // Reached! Move to next.
      const nextIndex = currentCheckpointIndex + 1;
      setCurrentCheckpointIndex(nextIndex);

      // If there is a next point, update target immediately
      if (nextIndex < routeCheckpoints.length) {
        onNextCheckpointUpdate(
          routeCheckpoints[nextIndex],
          nextIndex,
          routeCheckpoints.length
        );
      } else {
        // No more checkpoints, target final destination (handled by HomeScreen fallback)
        onNextCheckpointUpdate(null as any, nextIndex, routeCheckpoints.length);
      }
    } else {
      // Not reached yet, keep targeting this one
      onNextCheckpointUpdate(
        currentTarget,
        currentCheckpointIndex,
        routeCheckpoints.length
      );
    }
  }, [userLocation, routeCheckpoints, currentCheckpointIndex]);

  // Initial Location & Permissions
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission to access location was denied');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      // Initial location (no smoothing for first point)
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      lastLocationRef.current = coords;
      setUserLocation(coords);

      if (onUserLocationUpdate) {
        onUserLocationUpdate({
          latitude: coords.latitude,
          longitude: coords.longitude,
          heading: location.coords.heading,
          speed: location.coords.speed,
        });
      }

      // Initial center
      mapRef.current?.animateToRegion({
        ...coords,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    })();
  }, []);

  // Watch Position or Mock Position
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    if (mockUserLocation) {
      // USE MOCK LOCATION
      const { latitude, longitude, heading } = mockUserLocation;

      // ONLY update state if coordinates changed significantly (avoids re-fetch on rotation)
      if (
        !lastLocationRef.current ||
        Math.abs(lastLocationRef.current.latitude - latitude) > 0.000001 ||
        Math.abs(lastLocationRef.current.longitude - longitude) > 0.000001
      ) {
        const coords = { latitude, longitude };
        lastLocationRef.current = coords;
        setUserLocation(coords);

        // Notify parent (Heading updates are fine here, they don't trigger route fetch in parent)
        if (onUserLocationUpdate) {
          onUserLocationUpdate({
            latitude,
            longitude,
            heading, // Still pass heading for UI
            speed: 0,
          });
        }
      }
    } else {
      // USE REAL GPS
      (async () => {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 0,
            distanceInterval: 0,
          },
          (location) => {
            let { latitude, longitude } = location.coords;
            const { heading, speed } = location.coords;

            // Low-Pass Filter for Smoothing
            // alpha = 0.2 means 20% new data, 80% old data (very smooth, more lag)
            // alpha = 0.5 means 50% new data, 50% old data (balanced)
            const alpha = 0.5;

            if (lastLocationRef.current) {
              latitude =
                lastLocationRef.current.latitude * (1 - alpha) +
                latitude * alpha;
              longitude =
                lastLocationRef.current.longitude * (1 - alpha) +
                longitude * alpha;
            }

            const coords = { latitude, longitude };
            lastLocationRef.current = coords;
            setUserLocation(coords);

            if (onUserLocationUpdate) {
              onUserLocationUpdate({
                latitude,
                longitude,
                heading,
                speed,
              });
            }
          }
        );
      })();
    }

    return () => {
      if (subscription) subscription.remove();
    };
  }, [mockUserLocation]);

  // Recenter Trigger
  useEffect(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  }, [centerOnUserTrigger]);

  // Fetch Route (GraphHopper)
  useEffect(() => {
    if (!selectedLocation || !userLocation) {
      setRouteCoordinates([]);
      setRouteCheckpoints([]);
      setPolylineWidth(3.9);
      return;
    }

    // Throttle fetches: Only fetch if moved > 10m, OR if we have no route yet
    if (
      lastFetchLocation &&
      routeCoordinates.length > 0 &&
      getDistanceFromLatLonInMeters(
        lastFetchLocation.latitude,
        lastFetchLocation.longitude,
        userLocation.latitude,
        userLocation.longitude
      ) < GlobalStore.ROUTE_FETCH_THRESHOLD
    ) {
      return;
    }

    const fetchRoute = async () => {
      try {
        // Update last fetch location immediately
        setLastFetchLocation({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
        });

        // GraphHopper API URL
        // ADDED: profile=foot AND ch.disable=true (because CH is only enabled for car by default)
        const url = `${API_ENDPOINTS.ROUTING}?point=${userLocation.latitude},${userLocation.longitude}&point=${selectedLocation.lat},${selectedLocation.lng}&profile=foot&ch.disable=true&points_encoded=false`;
        const response = await fetch(url);

        if (!response.ok) {
          const text = await response.text();
          console.error('GraphHopper Error:', text);
          return;
        }

        const data = await response.json();

        if (data.paths && data.paths.length > 0) {
          const path = data.paths[0];

          // GraphHopper returns [lon, lat] in coordinates if points_encoded=false
          const coords = path.points.coordinates.map((c: number[]) => ({
            latitude: c[1],
            longitude: c[0],
          }));

          setRouteCoordinates(coords);

          // Extract maneuvers from instructions
          if (path.instructions) {
            const checkpoints = path.instructions
              .filter((inst: any) => inst.sign !== 5) // Allow sign 4 (Finish) to be a checkpoint
              .map((inst: any) => {
                // Instruction doesn't always have lat/lng directly in same format as OSRM steps
                // GraphHopper instructions usually point to an index in the points list
                const pointIndex = inst.interval[0];
                const coordinate = path.points.coordinates[pointIndex];
                return {
                  latitude: coordinate[1],
                  longitude: coordinate[0],
                };
              });

            // Pre-filter: If the first checkpoint is the start point (User Location), remove it immediately.
            // This prevents targeting "Start" (0m away) then immediately switching to "Next" (flashing).
            let initialCheckpoints = checkpoints;
            if (
              initialCheckpoints.length > 0 &&
              getDistanceFromLatLonInMeters(
                userLocation.latitude,
                userLocation.longitude,
                initialCheckpoints[0].latitude,
                initialCheckpoints[0].longitude
              ) < 10
            ) {
              initialCheckpoints = initialCheckpoints.slice(1);
            }

            setRouteCheckpoints(initialCheckpoints);
            setCurrentTotalCheckpoint(initialCheckpoints.length);
            setCurrentCheckpointIndex(0);
          }

          // Fit bounds
          if (mapRef.current) {
            mapRef.current.fitToCoordinates(coords, {
              edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
              animated: true,
            });
          }
        } else {
          Alert.alert('No Route', 'GraphHopper could not find a route.');
        }
      } catch (error) {
        console.error('Route fetch error:', error);
      }
    };
    fetchRoute();
  }, [selectedLocation, userLocation]);

  const handleMapPress = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    onLocationSelect(latitude, longitude);
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        showsUserLocation={!mockUserLocation} // Only show native blue dot if NOT mocking
        showsCompass={false}
        showsScale={false}
        showsBuildings={false}
        showsTraffic={false}
        showsPointsOfInterest={false}
        onPress={handleMapPress}
        mapType="none" // Hides Google/Apple default map
      >
        {/* Self-Hosted Tiles */}
        <UrlTile
          urlTemplate={API_ENDPOINTS.TILES}
          maximumZ={19}
          flipY={false}
          zIndex={-1}
        />

        {/* Route Polyline */}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#0EA5E9"
            strokeWidth={polylineWidth}
            zIndex={1000}
            style={{ zIndex: 1000 }}
          />
        )}
        {/* Route Checkpoints */}
        {routeCheckpoints.map((point, index) => {
          if (index < currentCheckpointIndex) return null; // Hide visited checkpoints

          return (
            <Marker
              key={`checkpoint-${index}`}
              coordinate={point}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.checkpointDot}>
                <Text style={styles.checkpointText}>
                  {index - currentCheckpointIndex + 1}
                </Text>
              </View>
            </Marker>
          );
        })}

        {/* Mock User Marker */}
        {mockUserLocation && (
          <Marker
            coordinate={mockUserLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={mockUserLocation.heading}
            flat={true} // Rotates with map/heading
          >
            <View style={styles.mockUserDot}></View>
          </Marker>
        )}

        {/* Destination Marker - Only show if NO route is loaded (otherwise the last checkpoint covers it) */}
        {selectedLocation && routeCoordinates.length === 0 && (
          <Marker
            coordinate={{
              latitude: selectedLocation.lat,
              longitude: selectedLocation.lng,
            }}
            title="Destination"
            pinColor="#0EA5E9"
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  map: {
    width: '100%',
    height: '100%',
  },

  checkpointDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0EA5E9', // sky-500
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkpointText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },

  mockUserDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#A855F7', // Purple-500 (Debug Color)
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockUserArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'white',
    transform: [{ translateY: -2 }],
  },
});
