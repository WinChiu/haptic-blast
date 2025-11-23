import React, { useState } from 'react';
import Map from '@/components/Map';
import DirectionOverlay from '@/components/DirectionOverlay';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';

const Index = () => {
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [isTokenSet, setIsTokenSet] = useState(false);

  const handleLocationSelect = (lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
  };

  const handleCloseOverlay = () => {
    setSelectedLocation(null);
  };

  const handleTokenSubmit = () => {
    if (mapboxToken.trim()) {
      setIsTokenSet(true);
    }
  };

  if (!isTokenSet) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <MapPin className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Haptic Navigator</h1>
            <p className="text-muted-foreground">Point & Navigate with Haptic Feedback</p>
          </div>
          
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Mapbox Access Token</label>
              <Input
                type="text"
                placeholder="pk.eyJ1Ij..."
                value={mapboxToken}
                onChange={(e) => setMapboxToken(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Get your token at{' '}
                <a 
                  href="https://account.mapbox.com/access-tokens/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  mapbox.com
                </a>
              </p>
            </div>
            <Button 
              onClick={handleTokenSubmit} 
              className="w-full"
              disabled={!mapboxToken.trim()}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Map onLocationSelect={handleLocationSelect} mapboxToken={mapboxToken} />
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
