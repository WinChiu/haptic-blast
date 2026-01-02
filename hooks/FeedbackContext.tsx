import React, { createContext, useContext, useState, ReactNode } from 'react';

type FeedbackContextType = {
  hapticEnabled: boolean;
  soundEnabled: boolean;
  toggleHaptic: () => void;
  toggleSound: () => void;
};

const FeedbackContext = createContext<FeedbackContextType | undefined>(undefined);

export const FeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [hapticEnabled, setHapticEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const toggleHaptic = () => setHapticEnabled((prev) => !prev);
  const toggleSound = () => setSoundEnabled((prev) => !prev);

  return (
    <FeedbackContext.Provider value={{ hapticEnabled, soundEnabled, toggleHaptic, toggleSound }}>
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
