export const GlobalStore = {
  FEEDBACK: {
    MAX_INTERVAL: 1000,
    MIN_INTERVAL: 300,
    STEP: 15,
    MAX_DIFF: 90,
    MIN_DIFF: 15,
  },
  BUZZ: {
    // Pulsar frequency is 0..1. The amplitude comes from util/haptics.ts.
    FREQUENCY: 1, // sharpest; 0.5 was too soft to feel through a pocket
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
  // GPS quality (accuracy in metres, smaller is better). Measured on a real
  // walk: median 6.7 m, but 12 to 29 m in the first 30 s after standing still.
  GPS: {
    maxUsableAccuracy: 20, // worse fixes are ignored for route progress
    maxStartAccuracy: 10, // Preview Route and Start wait for a fix this good
    // For working out the direction, the position is pulled onto the planned path
    // when it is within this distance of it (see snapToRoute). The off-route check
    // keeps using the real GPS position.
    snapLimit: 20,
  },
  // The how-to reminder shown when a journey starts. In 'adaptive' mode the
  // full tip appears until the user has finished `fullUntilFinished` journeys,
  // then only a small reminder for `compactSeconds` seconds.
  GUIDANCE_TIP: {
    fullUntilFinished: 2,
    compactSeconds: 5,
  },
  // Steer towards a point this far ahead along the path instead of straight at
  // the next checkpoint, so curves don't make the guidance swing (0 = off)
  AIM_LOOKAHEAD: 25, //meters
  // The aim-ahead point stops at a checkpoint where the route turns by more than
  // this many degrees (a corner): the guidance keeps pointing at the corner until
  // it is reached instead of turning early and walking the user into a wall.
  AIM_MAX_TURN: 60, //degrees
  // Cutting a corner: jump to a checkpoint further along (one of the next
  // `lookahead`, or the final one) once the user is within `radius` metres of it
  CHECKPOINT_SKIP: {
    lookahead: 5,
    radius: 15, //meters
  },
  // Leaving the route: after being more than `distance` metres from the line
  // for `seconds`, ask for a new route from where the user is. At most one
  // new route per `cooldownSeconds`.
  OFF_ROUTE: {
    distance: 30, //meters
    seconds: 5,
    cooldownSeconds: 15,
  },
  // Pocket calibration: hold the phone pointing forward, tap, put it away.
  // The heading measured in the hand becomes "forward" for the pocket pose.
  CALIBRATION: {
    captureMs: 500, // forward heading is averaged over this long in the hand
    maxCaptureSpreadDeg: 10, // more spread than this means the hand moved
    minPlaceMs: 2000, // time to put the phone away before stillness counts
    stillMs: 3000, // the phone must then be still this long (3 s, from team feedback)
    stillRateDegPerS: 15, // slower rotation than this counts as still
    timeoutMs: 10000, // give up if the phone is not still by then
    // The locked heading axis must stay at least this horizontal (0..1,
    // 0.35 = about 20° from vertical); otherwise the phone has turned in the
    // pocket and the heading is not updated
    minHorizontal: 0.35,
    smoothingAlpha: 0.2, // heavier than hand-held: hides leg swing
  },
  // How a dense route from the server is reduced to checkpoints (metres)
  CHECKPOINTS: {
    simplifyTolerance: 8,
    maxSpacing: 50,
    minSpacing: 15,
  },
};
