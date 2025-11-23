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
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Get user's location first
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
          setUserLocation(coords);
        },
        (error) => {
          console.error('Error getting location:', error);
          setUserLocation([37.7749, -122.4194]);
        }
      );
    } else {
      setUserLocation([37.7749, -122.4194]);
    }
  }, []);

  // Create map once we have user location
  useEffect(() => {
    if (!mapContainerRef.current || !userLocation || mapRef.current) return;

    // Create map
    const map = L.map(mapContainerRef.current).setView(userLocation, 14);
    mapRef.current = map;

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add user location marker
    userMarkerRef.current = L.marker(userLocation, { icon: userIcon })
      .addTo(map)
      .bindPopup('Your Location');

    // Handle map clicks
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
  }, [userLocation, onLocationSelect]);

  if (!userLocation) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading map...</p>
      </div>
    );
  }

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
