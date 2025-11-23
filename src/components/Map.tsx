import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapProps {
  onLocationSelect: (lat: number, lng: number) => void;
  mapboxToken: string;
}

const Map: React.FC<MapProps> = ({ onLocationSelect, mapboxToken }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    // Get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.longitude, position.coords.latitude]);
        },
        (error) => {
          console.error('Error getting location:', error);
          // Default to San Francisco if location access denied
          setUserLocation([-122.4194, 37.7749]);
        }
      );
    } else {
      setUserLocation([-122.4194, 37.7749]);
    }
  }, []);

  useEffect(() => {
    if (!mapContainer.current || !userLocation || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: userLocation,
      zoom: 14,
    });

    // Add user location marker
    new mapboxgl.Marker({ color: '#00D9FF' })
      .setLngLat(userLocation)
      .addTo(map.current);

    // Add navigation controls
    map.current.addControl(
      new mapboxgl.NavigationControl(),
      'top-right'
    );

    // Handle map clicks to set destination
    map.current.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      
      // Remove existing marker if any
      if (marker.current) {
        marker.current.remove();
      }

      // Add new marker
      marker.current = new mapboxgl.Marker({ color: '#00FF94' })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      onLocationSelect(lat, lng);
    });

    return () => {
      map.current?.remove();
    };
  }, [userLocation, onLocationSelect, mapboxToken]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" />
      <div className="absolute top-4 left-4 bg-card/95 backdrop-blur-sm px-4 py-3 rounded-lg border border-primary/20 shadow-lg">
        <p className="text-sm font-medium text-foreground">Tap anywhere to set destination</p>
        <p className="text-xs text-muted-foreground mt-1">Your location is marked in blue</p>
      </div>
    </div>
  );
};

export default Map;
