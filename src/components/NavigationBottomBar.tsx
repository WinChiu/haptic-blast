import React from "react";
import { Button } from "@/components/ui/button";
import { Navigation, ChevronLeft } from "lucide-react";

interface Props {
  duration: string;
  distance: string;
  onExit: () => void;
  onCenter: () => void;
}

const NavigationBottomBar: React.FC<Props> = ({
  duration,
  distance,
  onExit,
  onCenter,
}) => {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[1500] flex justify-center">
<div className="pointer-events-auto flex items-center justify-between gap-4 rounded-3xl bg-neutral-900/95 px-4 py-3 shadow-xl max-w-md w-[90%] h-16">        {/* Subtle back/exit control */}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={onExit}
        >
          <ChevronLeft className="h-5 w-5 text-neutral-200" />
        </Button>

        {/* Duration + distance in the middle */}
        <div className="flex flex-col items-center flex-1">
          <span className="text-sm font-medium text-white">
            {duration || "Calculating..."}
          </span>
          {distance && (
            <span className="text-xs text-neutral-400">
              {distance}
            </span>
          )}
        </div>

        {/* Paper plane – recenter on user */}
        <Button
  variant="ghost"
  size="icon"
  onClick={onCenter}
  className="
    h-10 w-10 text-neutral-200
    hover:bg-transparent 
    focus:bg-transparent 
    active:bg-transparent
    transition-all duration-100
    active:shadow-[0_0_12px_rgba(255,255,255,0.35)]
  "
>
  <Navigation className="h-10 w-10 text-neutral-200" />
</Button>
      </div>
    </div>
  );
};

export default NavigationBottomBar;