import React, { useState } from 'react';
import Map from '@/components/Map';
import DirectionOverlay from '@/components/DirectionOverlay';

const Index = () => {
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);

  const handleLocationSelect = (lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
  };

  const handleCloseOverlay = () => {
    setSelectedLocation(null);
  };

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Map onLocationSelect={handleLocationSelect} />
      {selectedLocation && (
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
