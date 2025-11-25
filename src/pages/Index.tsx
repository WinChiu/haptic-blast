import React, { useState } from 'react';
import Map from '@/components/Map';
import DirectionOverlay from '@/components/DirectionOverlay';
import RouteConfirmation from '@/components/RouteConfirmation';
import HapticCalibration from '@/components/HapticCalibration';
import { Button } from '@/components/ui/button';
import { Waves } from 'lucide-react';

const Index = () => {
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);
  const [showHapticOverlay, setShowHapticOverlay] = useState(false);
  const [hapticDelay, setHapticDelay] = useState(2.0);

  const handleLocationSelect = (lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
    setIsNavigating(false);
  };

  const handleStartNavigation = () => {
    setShowCalibration(true);
  };

  const handleCalibrationComplete = (delay: number) => {
    setHapticDelay(delay);
    setShowCalibration(false);
    setIsNavigating(true);
  };

  const handleCloseOverlay = () => {
    setSelectedLocation(null);
    setIsNavigating(false);
    setShowCalibration(false);
  };

  const handleToggleHapticOverlay = () => {
    setShowHapticOverlay(!showHapticOverlay);
  };

  const handleHapticOverlayClose = (delay: number) => {
    setHapticDelay(delay);
    setShowHapticOverlay(false);
  };

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Map 
        onLocationSelect={handleLocationSelect} 
        selectedLocation={selectedLocation}
      />
      
      {/* Floating Haptic Sensor Button - always visible */}
      {!showHapticOverlay && !showCalibration && (
        <Button
          onClick={selectedLocation ? handleToggleHapticOverlay : undefined}
          disabled={!selectedLocation}
          className="fixed bottom-6 right-6 z-[2000] h-14 w-14 rounded-full shadow-lg"
          size="icon"
        >
          <Waves className="h-6 w-6" />
        </Button>
      )}

      {/* Haptic Overlay - toggleable anytime */}
      {showHapticOverlay && (
        <HapticCalibration onContinue={handleHapticOverlayClose} />
      )}

      {selectedLocation && !isNavigating && !showCalibration && !showHapticOverlay && (
        <RouteConfirmation
          targetLat={selectedLocation.lat}
          targetLng={selectedLocation.lng}
          onStart={handleStartNavigation}
          onCancel={handleCloseOverlay}
        />
      )}
      {showCalibration && !showHapticOverlay && (
        <HapticCalibration onContinue={handleCalibrationComplete} />
      )}
      {selectedLocation && isNavigating && !showHapticOverlay && (
        <DirectionOverlay
          targetLat={selectedLocation.lat}
          targetLng={selectedLocation.lng}
          onClose={handleCloseOverlay}
        />
      )}
    </div>
  );
};

export default Index;
