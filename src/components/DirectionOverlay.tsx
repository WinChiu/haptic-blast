import React, { useEffect, useState, useCallback } from 'react';
import { Navigation, X, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface DirectionOverlayProps {
  targetLat: number;
  targetLng: number;
  onClose: () => void;
}

const DirectionOverlay: React.FC<DirectionOverlayProps> = ({ targetLat, targetLng, onClose }) => {
  const [heading, setHeading] = useState<number>(0);
  const [targetBearing, setTargetBearing] = useState<number>(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number>(0);

  // Calculate bearing between two coordinates
  const calculateBearing = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

    let bearing = (Math.atan2(y, x) * 180) / Math.PI;
    bearing = (bearing + 360) % 360;

    return bearing;
  }, []);

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }, []);

  // Get user's current location and update target bearing
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        
        const bearing = calculateBearing(latitude, longitude, targetLat, targetLng);
        setTargetBearing(bearing);
        
        const dist = calculateDistance(latitude, longitude, targetLat, targetLng);
        setDistance(dist);
      },
      (error) => console.error('Error watching position:', error),
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [targetLat, targetLng, calculateBearing, calculateDistance]);

  // Get device orientation
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null) {
        setHeading(360 - event.alpha);
      }
    };

    // Request permission for iOS devices
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission()
        .then((response: string) => {
          if (response === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  // Haptic feedback based on direction error
  useEffect(() => {
    if (!navigator.vibrate) return;

    const angleDiff = Math.abs(((targetBearing - heading + 180) % 360) - 180);
    
    // Vibrate if not pointing in the right direction
    if (angleDiff > 15) {
      const intensity = Math.min(angleDiff / 180, 1);
      const vibrationPattern = Math.floor(100 + intensity * 200);
      
      // Determine left or right vibration pattern
      const turnDirection = ((targetBearing - heading + 360) % 360) > 180 ? 'left' : 'right';
      
      if (turnDirection === 'left') {
        navigator.vibrate([vibrationPattern, 100, vibrationPattern * 0.5]);
      } else {
        navigator.vibrate([vibrationPattern * 0.5, 100, vibrationPattern]);
      }
    }
  }, [heading, targetBearing]);

  const angleDiff = Math.abs(((targetBearing - heading + 180) % 360) - 180);
  const isAligned = angleDiff < 15;
  const turnDirection = ((targetBearing - heading + 360) % 360) > 180 ? 'left' : 'right';

  const formatDistance = (meters: number) => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-md z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-xl font-bold text-foreground">Navigate to Destination</h2>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="icon">
                <MapPin className="w-5 h-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Change Destination?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will stop your current navigation and allow you to select a new destination on the map.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onClose}>Change Destination</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Main compass area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Distance display */}
        <div className="mb-8 text-center">
          <p className="text-sm text-muted-foreground mb-2">Distance to destination</p>
          <p className="text-4xl font-bold text-primary">{formatDistance(distance)}</p>
        </div>

        {/* Compass */}
        <div className="relative w-64 h-64 mb-8">
          {/* Background circle */}
          <div className="absolute inset-0 rounded-full border-4 border-muted bg-card"></div>
          
          {/* Direction indicator */}
          <div 
            className="absolute inset-0 flex items-center justify-center transition-transform duration-200"
            style={{ transform: `rotate(${targetBearing - heading}deg)` }}
          >
            <Navigation 
              className={`w-24 h-24 transition-colors duration-300 ${
                isAligned ? 'text-success fill-success' : 'text-primary'
              }`}
              style={{
                filter: isAligned ? 'drop-shadow(0 0 20px hsl(var(--success)))' : 'drop-shadow(0 0 10px hsl(var(--primary)))'
              }}
            />
          </div>

          {/* Cardinal directions */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-sm font-medium text-muted-foreground">N</div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-sm font-medium text-muted-foreground">S</div>
          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">W</div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">E</div>
        </div>

        {/* Status message */}
        <div className={`text-center p-4 rounded-lg border ${
          isAligned 
            ? 'bg-success/10 border-success text-success' 
            : 'bg-warning/10 border-warning text-warning'
        }`}>
          <p className="font-semibold text-lg">
            {isAligned 
              ? '✓ Pointing in the right direction!' 
              : `Turn ${turnDirection === 'left' ? '←' : '→'} ${turnDirection}`
            }
          </p>
          <p className="text-sm mt-1 opacity-80">
            {isAligned 
              ? 'Keep walking straight ahead' 
              : `${Math.round(angleDiff)}° off course`
            }
          </p>
        </div>

        {/* Haptic feedback indicator */}
        {!isAligned && (
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Vibration pattern indicates turn direction
          </p>
        )}
      </div>
    </div>
  );
};

export default DirectionOverlay;
