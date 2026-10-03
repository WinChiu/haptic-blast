import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Alert, Text } from 'react-native';
import MapView, {
  Marker,
  Polyline,
  UrlTile,
  PROVIDER_DEFAULT,
} from 'react-native-maps';
import * as Location from 'expo-location';
import { API_ENDPOINTS, USE_SELF_HOSTED_TILES } from '../util/config';
import { GlobalStore } from '../util/globals';
import { distanceMeters } from '../util/geo';
import { generateCheckpoints } from '../util/checkpoints';
import { isFixUsable } from '../util/gps';
import {
  distanceToRoute,
  findSkipTarget,
  aimPoint,
  isCheckpointReached,
} from '../util/progress';

interface MapProps {
  route: { latitude: number; longitude: number }[] | null;
  // Where the user wants to go. Shown as a pin until a route is drawn.
  destination?: { latitude: number; longitude: number } | null;
  // Called when the user has been off the route for a while (while navigating).
  // The parent should fetch a new route from this position. Omit to disable.
  onOffRoute?: (location: { latitude: number; longitude: number }) => void;
  // Long-press on the map picks a destination. Omit to disable picking.
  onDestinationSelect?: (coordinate: {
    latitude: number;
    longitude: number;
  }) => void;
  centerOnUserTrigger: number;
  onUserLocationUpdate?: (location: {
    latitude: number;
    longitude: number;
    heading: number | null;
    speed: number | null;
    accuracy?: number | null; // GPS accuracy in metres (absent for mock locations)
    // false when the fix is too inaccurate to use for route progress; it is
    // still reported (for the GPS indicator and recordings)
    usable?: boolean;
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

export default function Map({
  route,
  destination = null,
  onOffRoute,
  onDestinationSelect,
  centerOnUserTrigger,
  onUserLocationUpdate,
  heading = 0,
  onNextCheckpointUpdate,
  mockUserLocation = null,
}: MapProps) {
  const mapRef = useRef<MapView>(null);
  const hasRouteRef = useRef(false); // is a route already on screen?
  const offRouteSinceRef = useRef<number | null>(null);
  const lastRerouteRef = useRef(0);
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
  const [polylineWidth, setPolylineWidth] = useState(3.9);

  // Initialize Route
  useEffect(() => {
    if (route && route.length > 0) {
      setRouteCoordinates(route);
      // Draw the whole line, but only steer between a few meaningful points
      let checkpoints = generateCheckpoints(route);
      // A route starts where the user is standing, so that first checkpoint is
      // already reached. Dropping it makes the numbering start at the first
      // point to walk to (matters after re-routing mid-walk).
      if (
        checkpoints.length > 1 &&
        userLocation &&
        distanceMeters(userLocation, checkpoints[0]) <=
          GlobalStore.CHECKPOINT_PASS_RADIUS
      ) {
        checkpoints = checkpoints.slice(1);
      }
      console.log(
        `[route] ${route.length} route points -> ${checkpoints.length} checkpoints`
      );
      setRouteCheckpoints(checkpoints);
      setCurrentTotalCheckpoint(checkpoints.length);
      setCurrentCheckpointIndex(0);

      // Fit bounds, but not when a new route replaces the one being followed
      // (re-routing while navigating shouldn't make the map jump)
      if (mapRef.current && !hasRouteRef.current) {
        mapRef.current.fitToCoordinates(route, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
      hasRouteRef.current = true;
    } else {
      hasRouteRef.current = false;
      offRouteSinceRef.current = null;
      setRouteCoordinates([]);
      setRouteCheckpoints([]);
      setCurrentTotalCheckpoint(0);
      setCurrentCheckpointIndex(0);
    }
  }, [route]);

  // Set polyline width to 4 when route is loaded to rerender the route
  useEffect(() => {
    if (routeCoordinates.length > 0) {
      setTimeout(() => {
        setPolylineWidth(4);
      }, 100);
    }
  }, [routeCoordinates]);

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

    // Cut a corner or took another way? Jump to a checkpoint further along
    // that the user is already close to, instead of pointing back at one
    // they will never walk to.
    const skipTo = findSkipTarget(
      userLocation,
      routeCheckpoints,
      currentCheckpointIndex
    );
    if (skipTo !== null) {
      console.log(
        `[nav] skipped ahead from checkpoint ${currentCheckpointIndex} to ${skipTo}`
      );
      setCurrentCheckpointIndex(skipTo);
      return;
    }

    const dist = distanceMeters(userLocation, currentTarget);

    if (
      isCheckpointReached(
        userLocation,
        currentTarget,
        routeCheckpoints[currentCheckpointIndex + 1]
      )
    ) {
      // Reached! Move to next.
      console.log(
        'Reached checkpoint',
        currentCheckpointIndex,
        dist <= GlobalStore.CHECKPOINT_THRESHOLD
          ? `(within ${dist.toFixed(1)} m)`
          : `(walked past, ${dist.toFixed(1)} m away)`
      );
      const nextIndex = currentCheckpointIndex + 1;
      setCurrentCheckpointIndex(nextIndex);

      // If there is a next point, update target immediately
      if (nextIndex < routeCheckpoints.length) {
        onNextCheckpointUpdate(
          aimPoint(userLocation, routeCheckpoints, nextIndex),
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
        aimPoint(userLocation, routeCheckpoints, currentCheckpointIndex),
        currentCheckpointIndex,
        routeCheckpoints.length
      );
    }
  }, [userLocation, routeCheckpoints, currentCheckpointIndex]);

  // Off route for a while? Ask the parent for a new route from here.
  useEffect(() => {
    if (!onOffRoute || !userLocation || routeCoordinates.length < 2) {
      offRouteSinceRef.current = null;
      return;
    }

    const { distance, seconds, cooldownSeconds } = GlobalStore.OFF_ROUTE;
    if (distanceToRoute(userLocation, routeCoordinates) <= distance) {
      offRouteSinceRef.current = null;
      return;
    }

    const now = Date.now();
    if (offRouteSinceRef.current === null) offRouteSinceRef.current = now;

    const offLongEnough = now - offRouteSinceRef.current >= seconds * 1000;
    const cooledDown = now - lastRerouteRef.current >= cooldownSeconds * 1000;
    if (offLongEnough && cooledDown) {
      lastRerouteRef.current = now;
      offRouteSinceRef.current = null;
      console.log(`[route] off route by more than ${distance} m, re-routing`);
      onOffRoute(userLocation);
    }
  }, [userLocation, routeCoordinates]);

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
    let cancelled = false;

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
        // Wait for the permission answer first. On a first launch the
        // prompt is still open here, and watching without permission throws.
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 500,
            distanceInterval: 0,
          },
          (location) => {
            let { latitude, longitude } = location.coords;
            const { heading, speed, accuracy } = location.coords;
            const usable = isFixUsable(accuracy);

            if (usable) {
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
            }

            if (onUserLocationUpdate) {
              onUserLocationUpdate({
                latitude,
                longitude,
                heading,
                speed,
                accuracy,
                usable,
              });
            }
          }
        );
        // The effect may have been cleaned up while we were starting
        if (cancelled) sub.remove();
        else subscription = sub;
      })();
    }

    return () => {
      cancelled = true;
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

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        showsUserLocation={!mockUserLocation} // Only show native blue dot if NOT mocking
        onLongPress={
          onDestinationSelect
            ? (e) => onDestinationSelect(e.nativeEvent.coordinate)
            : undefined
        }
        showsCompass={false}
        showsScale={false}
        showsBuildings={false}
        showsTraffic={false}
        showsPointsOfInterests={false}
        mapType={USE_SELF_HOSTED_TILES ? 'none' : 'standard'} // none hides the platform map so our tiles show instead
      >
        {/* Self-Hosted Tiles. Off by default: there is no tile server yet, so
            every request would fail. See "Map background" in the README. */}
        {USE_SELF_HOSTED_TILES && (
          <UrlTile
            urlTemplate={API_ENDPOINTS.TILES}
            maximumZ={19}
            flipY={false}
            zIndex={-1}
          />
        )}

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
                <Text style={styles.checkpointText}>{index + 1}</Text>
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
        {destination && routeCoordinates.length === 0 && (
          <Marker coordinate={destination} pinColor="#EF4444" />
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
