import React, { useState } from "react";
import Map from "@/components/Map";
import HapticCalibration from "@/components/HapticCalibration";
import BottomNav from "@/components/BottomNav";
import NavigationBottomBar from "@/components/NavigationBottomBar";
import { Button } from "@/components/ui/button";
import { Waves } from "lucide-react";
import { useNavigate } from "react-router-dom";

const formatDistance = (meters: number | null): string => {
  if (!meters || meters <= 0) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

const formatDuration = (seconds: number | null): string => {
  if (!seconds || seconds <= 0) return "";
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "< 1 min";
  if (minutes === 1) return "1 min";
  return `${minutes} min`;
};

const Index = () => {
  const [selectedLocation, setSelectedLocation] = useState<LatLng>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showHapticOverlay, setShowHapticOverlay] = useState(false);
  const [hapticDelay, setHapticDelay] = useState(2.0);

  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);

  type LatLng = { lat: number; lng: number } | null;
  const [centerTrigger, setCenterTrigger] = useState(0);
  const navigate = useNavigate();

  const handleLocationSelect = (lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
    setIsNavigating(false);
    setShowHapticOverlay(false);
  };

  const handleStartNavigation = () => {
    if (!selectedLocation) return;
    setIsNavigating(true);

    setCenterTrigger(c => c + 1);
};

  const handleCloseOverlay = () => {
    setSelectedLocation(null);
    setIsNavigating(false);
    setShowHapticOverlay(false);
    setRouteDistance(null);
    setRouteDuration(null);
  };

  const handleToggleHapticOverlay = () => {
    setShowHapticOverlay((prev) => !prev);
  };

  const handleHapticOverlayClose = (delay: number) => {
    setHapticDelay(delay);
    setShowHapticOverlay(false);
  };

  const distanceLabel = formatDistance(routeDistance);
  const durationLabel = formatDuration(routeDuration*3); //manually added times 3 to make it more similair to actual walking time

  const hapticActive = isNavigating;

  const navTitle =
    isNavigating && selectedLocation
      ? "Follow the highlighted route"
      : undefined;

  const navSubtitle =
    isNavigating && (durationLabel || distanceLabel)
      ? [durationLabel, distanceLabel].filter(Boolean).join(" • ")
      : undefined;

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Map
        onLocationSelect={handleLocationSelect}
        selectedLocation={selectedLocation}
        onRouteInfo={(distance, duration) => {
          setRouteDistance(distance);
          setRouteDuration(duration);
        }}
        isNavigating={isNavigating}
        navTitle={navTitle}
        navSubtitle={navSubtitle}
        centerOnUserTrigger={centerTrigger} 
      />

      

      {/* Home mode bottom nav – shows Go button */}
      {!showHapticOverlay && !isNavigating && (
        <BottomNav
          hasRoute={!!selectedLocation}
          onGo={handleStartNavigation}
          onCenter={() => setCenterTrigger(c => c + 1)}
          onMenu={() => navigate("/tutorial")}
        />
      )}

      {/* Navigation mode: route overlay + ETA bar */}
      {selectedLocation && isNavigating && !showHapticOverlay && (
        <>
          <NavigationBottomBar
          duration={durationLabel || "Calculating..."}
          distance={distanceLabel || ""}
          onExit={handleCloseOverlay}
          onCenter={() => setCenterTrigger((c) => c + 1)}
    />
        </>
      )}

      {/* Haptic overlay – opened manually via wave button */}
      {showHapticOverlay && (
        <HapticCalibration onContinue={handleHapticOverlayClose} />
      )}

      {/* Floating haptic button */}
      {!showHapticOverlay && (
        <Button
          onClick={hapticActive ? handleToggleHapticOverlay : undefined}
          disabled={!hapticActive}
          className={
            "fixed bottom-28 right-6 z-[2000] h-14 w-14 rounded-full shadow-lg transition-colors " +
            (hapticActive
              ? "bg-sky-500 text-white"
              : "bg-neutral-700 text-neutral-400")
          }
          size="icon"
        >
          <Waves className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
};

export default Index;