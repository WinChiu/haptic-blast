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
  },
  DEBUG_MODE: {
    STEP: 0.000001,
    SPEED_MULTIPLIER: 0.8,
  },
  CHECKPOINT_THRESHOLD: 4, //meters
  // A checkpoint also counts as reached if the user is within this distance
  // and has already gone past it towards the next one (GPS drift can keep
  // someone just outside CHECKPOINT_THRESHOLD while walking by).
  CHECKPOINT_PASS_RADIUS: 12, //meters
  // How a dense route from the server is reduced to checkpoints (metres)
  CHECKPOINTS: {
    simplifyTolerance: 8,
    maxSpacing: 50,
    minSpacing: 15,
  },
};
