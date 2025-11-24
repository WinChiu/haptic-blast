import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Navigation, X } from 'lucide-react';

interface RouteConfirmationProps {
  targetLat: number;
  targetLng: number;
  onStart: () => void;
  onCancel: () => void;
}

const RouteConfirmation: React.FC<RouteConfirmationProps> = ({
  targetLat,
  targetLng,
  onStart,
  onCancel,
}) => {
  const distance = useMemo(() => {
    if (navigator.geolocation) {
      // We'll calculate this based on current position
      return null;
    }
    return null;
  }, [targetLat, targetLng]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const [userLocation, setUserLocation] = React.useState<{ lat: number; lng: number } | null>(null);

  React.useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      });
    }
  }, []);

  const distanceText = useMemo(() => {
    if (!userLocation) return '...';
    const dist = calculateDistance(userLocation.lat, userLocation.lng, targetLat, targetLng);
    if (dist < 1000) {
      return `${Math.round(dist)}m`;
    }
    return `${(dist / 1000).toFixed(1)}km`;
  }, [userLocation, targetLat, targetLng]);

  return (
    <div className="absolute inset-0 z-[2000] pointer-events-none">
      <div className="absolute bottom-0 left-0 right-0 pointer-events-auto">
        <div className="bg-card/95 backdrop-blur-sm border-t border-border shadow-lg p-6 rounded-t-3xl">
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-2 hover:bg-accent rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>

          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Start Navigation</h2>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-primary">{distanceText}</span>
                <span className="text-muted-foreground">away</span>
              </div>
            </div>

            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <p className="text-sm text-foreground">
                A route has been sketched on the map. Tap <strong>Start Navigation</strong> to begin haptic guidance.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={onCancel}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={onStart}
                className="flex-1 gap-2"
              >
                <Navigation className="w-5 h-5" />
                Start Navigation
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteConfirmation;
