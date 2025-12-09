import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';

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
    } | null
  ) => void;
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
}: MapProps & { heading?: number }) {
  const mapRef = useRef<MapView>(null);
  const lastLocationRef = useRef<{
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
    if (dist <= 5) {
      // Reached! Move to next.
      const nextIndex = currentCheckpointIndex + 1;
      setCurrentCheckpointIndex(nextIndex);

      // If there is a next point, update target immediately
      if (nextIndex < routeCheckpoints.length) {
        onNextCheckpointUpdate(routeCheckpoints[nextIndex]);
      } else {
        // No more checkpoints, target final destination (handled by HomeScreen fallback)
        onNextCheckpointUpdate(null as any);
      }
    } else {
      // Not reached yet, keep targeting this one
      onNextCheckpointUpdate(currentTarget);
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

  // Watch Position
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
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
              lastLocationRef.current.latitude * (1 - alpha) + latitude * alpha;
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

    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

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

  // Fetch Route
  useEffect(() => {
    if (!selectedLocation || !userLocation) {
      setRouteCoordinates([]);
      setRouteCheckpoints([]);
      setPolylineWidth(3.9);
      return;
    }
    const fetchRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/foot/${userLocation.longitude},${userLocation.latitude};${selectedLocation.lng},${selectedLocation.lat}?overview=full&geometries=geojson&steps=true`;
        const response = await fetch(url);
        const contentType = response.headers.get('content-type');
        if (
          !response.ok ||
          !contentType ||
          !contentType.includes('application/json')
        ) {
          const text = await response.text();
          console.error('OSRM Error:', text.substring(0, 100));
          Alert.alert('Route Error', 'Failed to fetch route from OSRM server.');
          return;
        }
        const data = await response.json();

        if (data.code === 'Ok' && data.routes.length > 0) {
          const route = data.routes[0];
          const coords = route.geometry.coordinates.map((c: number[]) => ({
            latitude: c[1],
            longitude: c[0],
          }));

          setRouteCoordinates(coords);
          // Extract steps (maneuvers)
          if (route.legs && route.legs.length > 0) {
            const steps = route.legs[0].steps;
            const checkpoints = steps.map((step: any) => ({
              latitude: step.maneuver.location[1],
              longitude: step.maneuver.location[0],
            }));
            setRouteCheckpoints(checkpoints);
            setCurrentTotalCheckpoint(checkpoints.length);
            setCurrentCheckpointIndex(0);
          }

          // Fit bounds
          mapRef.current?.fitToCoordinates(coords, {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: true,
          });
        } else {
          Alert.alert('No Route', 'OSRM could not find a route.');
        }
      } catch (error) {
        console.error('Route fetch error:', error);
        // Alert.alert('Error', 'An error occurred while fetching the route.');
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
        showsUserLocation={true} // We are rendering a custom marker
        showsCompass={false}
        showsScale={false}
        showsBuildings={false}
        showsTraffic={false}
        showsPointsOfInterest={false}
        onPress={handleMapPress}
        mapType="standard"
      >
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
          const isVisited = index < currentCheckpointIndex;
          return (
            <Marker
              key={`checkpoint-${index}`}
              coordinate={point}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.checkpointDot,
                  isVisited && styles.checkpointDotVisited,
                ]}
              />
            </Marker>
          );
        })}
        {/* Destination Marker */}
        {selectedLocation && (
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
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0EA5E9', // sky-500
    borderWidth: 2,
    borderColor: 'white',
  },
  checkpointDotVisited: {
    backgroundColor: '#EAB308', // yellow-500
  },
});
