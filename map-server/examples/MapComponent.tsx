import React, { useState } from 'react';
import { View, StyleSheet, Button } from 'react-native';
import MapView, { UrlTile, Polyline, Marker } from 'react-native-maps';

// Configuration
// REPLACE WITH YOUR PC'S LOCAL IP ADDRESS if testing on real device
const SERVER_IP = '192.168.1.100';
const TILE_URL = `http://${SERVER_IP}:8080/styles/basic/{z}/{x}/{y}.png`;
const ROUTE_API = `http://${SERVER_IP}:8989/route`;

export default function NativeMap() {
  const [routeCoords, setRouteCoords] = useState([]);

  // Example: Fetch route from Stockholm Central to Old Town
  const fetchRoute = async () => {
    try {
      const start = { lat: 59.33, lon: 18.058 }; // Stockholm Central
      const end = { lat: 59.325, lon: 18.07 }; // Old Town

      const url = `${ROUTE_API}?point=${start.lat},${start.lon}&point=${end.lat},${end.lon}&profile=car&points_encoded=false`;

      const response = await fetch(url);
      const json = await response.json();

      if (json.paths && json.paths.length > 0) {
        const points = json.paths[0].points.coordinates.map((coord) => ({
          latitude: coord[1],
          longitude: coord[0],
        }));
        setRouteCoords(points);
      }
    } catch (error) {
      console.error('Routing Error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 59.3293,
          longitude: 18.0686,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Render Self-Hosted Tiles */}
        <UrlTile urlTemplate={TILE_URL} maximumZ={19} flipY={false} />

        {/* Render Route Line */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#0000FF"
            strokeWidth={4}
          />
        )}
      </MapView>

      <View style={styles.buttonContainer}>
        <Button title="Get Route" onPress={fetchRoute} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  buttonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
  },
});
