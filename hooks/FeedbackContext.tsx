import React, { createContext, useContext, useState, ReactNode } from 'react';

// tap: discrete impacts (original behavior)
// pulse: short continuous bursts, longer and more frequent with larger error
// continuous: uninterrupted buzz whose strength follows the error
export type HapticStyle = 'tap' | 'pulse' | 'continuous';

type FeedbackContextType = {
  hapticEnabled: boolean;
  soundEnabled: boolean;
  hapticStyle: HapticStyle;
  toggleHaptic: () => void;
  toggleSound: () => void;
  setHapticStyle: (style: HapticStyle) => void;
};

const FeedbackContext = createContext<FeedbackContextType | undefined>(undefined);

export const FeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [hapticEnabled, setHapticEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [hapticStyle, setHapticStyle] = useState<HapticStyle>('tap');

  const toggleHaptic = () => setHapticEnabled((prev) => !prev);
  const toggleSound = () => setSoundEnabled((prev) => !prev);

  return (
    <FeedbackContext.Provider
      value={{
        hapticEnabled,
        soundEnabled,
        hapticStyle,
        toggleHaptic,
        toggleSound,
        setHapticStyle,
      }}
    >
      {children}
    </FeedbackContext.Provider>
  );
};

// Custom hook to use feedback context
export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback must be used within FeedbackProvider');
  return context;
};
