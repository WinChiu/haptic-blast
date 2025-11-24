import React, { useState } from 'react';
import Map from '@/components/Map';
import DirectionOverlay from '@/components/DirectionOverlay';
import RouteConfirmation from '@/components/RouteConfirmation';
import HapticCalibration from '@/components/HapticCalibration';

const Index = () => {
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);
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

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Map 
        onLocationSelect={handleLocationSelect} 
        selectedLocation={selectedLocation}
      />
      {selectedLocation && !isNavigating && !showCalibration && (
        <RouteConfirmation
          targetLat={selectedLocation.lat}
          targetLng={selectedLocation.lng}
          onStart={handleStartNavigation}
          onCancel={handleCloseOverlay}
        />
      )}
      {showCalibration && (
        <HapticCalibration onContinue={handleCalibrationComplete} />
      )}
      {selectedLocation && isNavigating && (
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
