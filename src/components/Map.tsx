import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom marker icons
const userIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="18" fill="#00D9FF" stroke="white" stroke-width="4"/>
      <circle cx="20" cy="20" r="8" fill="white"/>
    </svg>
  `),
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const destinationIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg width="40" height="50" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 0C11.163 0 4 7.163 4 16C4 28 20 50 20 50C20 50 36 28 36 16C36 7.163 28.837 0 20 0Z" fill="#00FF94"/>
      <circle cx="20" cy="16" r="8" fill="white"/>
    </svg>
  `),
  iconSize: [40, 50],
  iconAnchor: [20, 50],
});

interface MapProps {
  onLocationSelect: (lat: number, lng: number) => void;
}

const Map: React.FC<MapProps> = ({ onLocationSelect }) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);

  // Start with a sensible default (San Francisco) so we never block on geolocation
  const [userLocation, setUserLocation] = useState<[number, number]>([37.7749, -122.4194]);

  // Create map once on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView(userLocation, 14);
    mapRef.current = map;

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Add initial user marker at default location
    userMarkerRef.current = L.marker(userLocation, { icon: userIcon })
      .addTo(map)
      .bindPopup('Your Location');

    // Try to update with real geolocation asynchronously, but don't block rendering
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
          setUserLocation(coords);

          // Update map view and marker if map still exists
          if (mapRef.current) {
            mapRef.current.setView(coords, 15);
          }
          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng(coords);
          }
        },
        (error) => {
          console.warn('Geolocation unavailable, using default location:', error);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    // Handle map clicks for destination
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      // Remove existing destination marker
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.remove();
      }

      // Add new destination marker
      destinationMarkerRef.current = L.marker([lat, lng], { icon: destinationIcon })
        .addTo(map)
        .bindPopup('Destination');

      onLocationSelect(lat, lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      <div className="absolute top-4 left-4 bg-card/95 backdrop-blur-sm px-4 py-3 rounded-lg border border-primary/20 shadow-lg z-[1000]">
        <p className="text-sm font-medium text-foreground">Tap anywhere to set destination</p>
        <p className="text-xs text-muted-foreground mt-1">Your location is marked in blue</p>
      </div>
    </div>
  );
};

export default Map;
