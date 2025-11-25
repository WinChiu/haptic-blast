import React from "react";
import { Menu, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BottomNavProps {
  hasRoute: boolean;
  onGo: () => void;
  onMenu: () => void;
  onCenter: () => void;
}

const BottomNav: React.FC<BottomNavProps> = ({
  hasRoute,
  onGo,
  onMenu,
  onCenter,
}) => {
  const iconClasses = "h-10 w-10 text-neutral-200";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[1500] flex justify-center">
<div className="pointer-events-auto flex items-center justify-between gap-4 rounded-3xl bg-neutral-900/90 px-4 py-3 shadow-xl max-w-md w-[90%] h-16">        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onMenu}>
          <Menu className={iconClasses} />
        </Button>

        <Button
          onClick={hasRoute ? onGo : undefined}
          disabled={!hasRoute}
          className={
            "h-12 px-7 rounded-full font-semibold shadow-md transition-colors " +
            (hasRoute
              ? "bg-sky-500 text-white"
              : "bg-neutral-800 text-neutral-400")
          }
        >
          Go
        </Button>

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

export default BottomNav;