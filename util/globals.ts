export const GlobalStore = {
  COMPASS_ANGLE_TOLERANCE: 25,
  FEEDBACK: {
    MAX_INTERVAL: 1000,
    MIN_INTERVAL: 300,
    STEP: 15,
    MAX_DIFF: 90,
    MIN_DIFF: 15,
  },
  BUZZ: {
    // Pulsar amplitude/frequency are 0..1. Strength (0..1) maps to amplitude
    // linearly between MIN_AMPLITUDE and MAX_AMPLITUDE.
    MIN_AMPLITUDE: 0.2,
    MAX_AMPLITUDE: 1,
    FREQUENCY: 0.5,
    // Pulse mode: each burst lasts between these (ms), longer for larger error.
    // Bursts repeat on the same interval as tap mode (FEEDBACK.MIN/MAX_INTERVAL).
    PULSE_MIN_ON: 120,
    PULSE_MAX_ON: 250,
  },
  DEBUG_MODE: {
    STEP: 0.000001,
    SPEED_MULTIPLIER: 0.8,
  },
  CHECKPOINT_THRESHOLD: 4, //meters
};
