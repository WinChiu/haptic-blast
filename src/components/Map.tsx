import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom user marker
const userIcon = new L.Icon({
  iconUrl:
    'data:image/svg+xml;base64,' +
    btoa(`
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="18" fill="#00D9FF" stroke="white" stroke-width="4"/>
      <circle cx="20" cy="20" r="8" fill="white"/>
    </svg>
  `),
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

// Custom destination marker
const destinationIcon = new L.Icon({
  iconUrl:
    'data:image/svg+xml;base64,' +
    btoa(`
    <svg width="40" height="50" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 0C11.163 0 4 7.163 4 16C4 28 20 50 20 50C20 50 36 28 36 16C36 7.163 28.837 0 20 0Z" fill="#0EA5E9"/>
      <circle cx="20" cy="16" r="8" fill="white"/>
    </svg>
  `),
  iconSize: [40, 50],
  iconAnchor: [20, 50],
});

interface MapProps {
  onLocationSelect: (lat: number, lng: number) => void;
  selectedLocation: { lat: number; lng: number } | null;
  onRouteInfo?: (distanceMeters: number, durationSeconds: number) => void;
  isNavigating: boolean;
  navTitle?: string;
  navSubtitle?: string;
  centerOnUserTrigger: number;
  onUserLocationUpdate?: (location: [number, number]) => void;
}

const Map: React.FC<MapProps> = ({
  onLocationSelect,
  selectedLocation,
  onRouteInfo,
  isNavigating,
  navTitle,
  navSubtitle,
  centerOnUserTrigger,
  onUserLocationUpdate,
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [userLocation, setUserLocation] = useState<[number, number]>([
    37.7749, -122.4194,
  ]);
  const watchIdRef = useRef<number | null>(null);

  // Recenter map on user when triggered (paper plane button)
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView(userLocation, 16, { animate: true });
  }, [centerOnUserTrigger, userLocation]);
  
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
    }).setView(userLocation, 14);
    mapRef.current = map;

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
      },
    ).addTo(map);

    userMarkerRef.current = L.marker(userLocation, { icon: userIcon })
      .addTo(map)
      .bindPopup('Your Location');

    // Start watching position for live updates
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const coords: [number, number] = [
            position.coords.latitude,
            position.coords.longitude,
          ];
          setUserLocation(coords);
          onUserLocationUpdate?.(coords);

          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng(coords);
          }
        },
        (error) => console.warn('Geolocation error:', error),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    }

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.remove();
      }

      destinationMarkerRef.current = L.marker([lat, lng], {
        icon: destinationIcon,
      })
        .addTo(map)
        .bindPopup('Destination');

      onLocationSelect(lat, lng);
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old route line
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }
    

    // If destination cleared → clear route info
      if (!selectedLocation) {
    if (destinationMarkerRef.current) {
      destinationMarkerRef.current.remove();
      destinationMarkerRef.current = null;
    }
    if (typeof onRouteInfo === "function") onRouteInfo(0, 0);
    return;
  }

    const fetchRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/foot/${userLocation[1]},${userLocation[0]};${selectedLocation.lng},${selectedLocation.lat}?overview=full&geometries=geojson`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.code === 'Ok' && data.routes.length > 0) {
          const route = data.routes[0];
          const coords: [number, number][] = route.geometry.coordinates.map(
            (c: [number, number]) => [c[1], c[0]],
          );

          if (typeof onRouteInfo === 'function') {
            onRouteInfo(route.distance, route.duration);
          }

          const routeLine = L.polyline(coords, {
            color: '#0EA5E9',
            weight: 5,
            opacity: 0.8,
          }).addTo(mapRef.current!);

          routeLineRef.current = routeLine;
          mapRef.current!.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
        } else {
          drawStraightLine();
        }
      } catch {
        drawStraightLine();
      }
    };

    const drawStraightLine = () => {
      const routeLine = L.polyline(
        [userLocation, [selectedLocation.lat, selectedLocation.lng]],
        {
          color: '#0EA5E9',
          weight: 4,
          opacity: 0.8,
          dashArray: '10, 10',
        },
      ).addTo(mapRef.current!);

      routeLineRef.current = routeLine;

      mapRef.current!.fitBounds(
        [userLocation, [selectedLocation.lat, selectedLocation.lng]],
        { padding: [50, 50] },
      );

      const dist = mapRef.current!.distance(
        userLocation,
        [selectedLocation.lat, selectedLocation.lng],
      );

      const duration = dist / 1.4; // ~1.4 m/s walking

      if (typeof onRouteInfo === 'function') {
        onRouteInfo(dist, duration);
      }
    };

    fetchRoute();
  }, [selectedLocation, userLocation]);

  // Search handler
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery,
        )}&limit=1`,
      );
      const d = await r.json();

      if (d.length > 0) {
        const lat = parseFloat(d[0].lat);
        const lng = parseFloat(d[0].lon);

        if (mapRef.current) mapRef.current.setView([lat, lng], 15);

        if (destinationMarkerRef.current) destinationMarkerRef.current.remove();

        destinationMarkerRef.current = L.marker([lat, lng], {
          icon: destinationIcon,
        })
          .addTo(mapRef.current!)
          .bindPopup(d[0].display_name);

        onLocationSelect(lat, lng);
        setSearchQuery('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Top overlay: search bar (not navigating) OR nav banner (navigating) */}
      {!isNavigating ? (
        <div className="pointer-events-none absolute inset-x-0 top-6 z-[1200] flex justify-center">
          <form
            onSubmit={handleSearch}
            className="pointer-events-auto flex w-[90%] max-w-md items-center gap-3 rounded-2xl bg-neutral-900/90 px-4 py-2.5 shadow-lg"
          >
            <Search className="h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search Maps"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 border-0 bg-transparent p-0 text-sm text-neutral-100 placeholder:text-neutral-400 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </form>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 top-6 z-[1200] flex justify-center">
 
        </div>
      )}
    </div>
  );
};

export default Map;