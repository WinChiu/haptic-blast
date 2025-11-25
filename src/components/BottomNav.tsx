import React from 'react';
import { Menu, Heart, Navigation, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BottomNav = () => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[1500] bg-card/95 backdrop-blur-sm border-t border-border">
      <div className="flex items-center justify-around h-16 px-4 max-w-md mx-auto">
        <Button variant="ghost" size="icon" className="h-12 w-12">
          <Menu className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-12 w-12">
          <Heart className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-12 w-12">
          <Navigation className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-12 w-12">
          <Share2 className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

export default BottomNav;
