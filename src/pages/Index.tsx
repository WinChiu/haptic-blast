import React, { useState } from 'react';
import Map from '@/components/Map';
import DirectionOverlay from '@/components/DirectionOverlay';
import RouteConfirmation from '@/components/RouteConfirmation';

const Index = () => {
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  const handleLocationSelect = (lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
    setIsNavigating(false);
  };

  const handleStartNavigation = () => {
    setIsNavigating(true);
  };

  const handleCloseOverlay = () => {
    setSelectedLocation(null);
    setIsNavigating(false);
  };

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Map 
        onLocationSelect={handleLocationSelect} 
        selectedLocation={selectedLocation}
      />
      {selectedLocation && !isNavigating && (
        <RouteConfirmation
          targetLat={selectedLocation.lat}
          targetLng={selectedLocation.lng}
          onStart={handleStartNavigation}
          onCancel={handleCloseOverlay}
        />
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
