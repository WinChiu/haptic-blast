import {
  Coord,
  alongTrackMeters,
  bearingDegrees,
  bearingDifference,
  distanceMeters,
  distanceToSegmentMeters,
  interpolate,
} from './geo';
import { GlobalStore } from './globals';

// How far the user is from the nearest part of the route line, in metres.
export function distanceToRoute(user: Coord, route: Coord[]): number {
  if (route.length === 0) return Infinity;
  if (route.length === 1) return distanceMeters(user, route[0]);
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    best = Math.min(best, distanceToSegmentMeters(user, route[i - 1], route[i]));
  }
  return best;
}

// Has the user reached `current`? True when they are inside
// CHECKPOINT_THRESHOLD of it, or within CHECKPOINT_PASS_RADIUS and already past
// it (GPS drift can keep someone just outside the threshold while walking by).
//
// "Past it" is judged along the leg the user was walking, from `previous` to
// `current`. It must not be judged along the leg that comes next: at a corner
// that leg points sideways, so someone still walking up to the corner, with a
// metre of GPS wobble, would count as past it up to 12 m too early and be told
// to turn into the wall. The first checkpoint has no `previous`, so only the
// threshold applies.
export function isCheckpointReached(
  user: Coord,
  current: Coord,
  previous?: Coord
): boolean {
  const dist = distanceMeters(user, current);
  if (dist <= GlobalStore.CHECKPOINT_THRESHOLD) return true;
  if (!previous || dist > GlobalStore.CHECKPOINT_PASS_RADIUS) return false;

  // a point the same distance beyond `current` as `previous` is behind it
  const beyond: Coord = {
    latitude: 2 * current.latitude - previous.latitude,
    longitude: 2 * current.longitude - previous.longitude,
  };
  return alongTrackMeters(user, current, beyond) > 0;
}

// One step of route progress for a new position: skip ahead if the user has
// cut the corner, otherwise move on if the current checkpoint is reached.
// Returns null when nothing changes. Used by the map and by the tests.
export function checkpointStep(
  user: Coord,
  checkpoints: Coord[],
  index: number
): { index: number; reason: 'skip' | 'reached' } | null {
  if (index < 0 || index >= checkpoints.length) return null;
  const skip = findSkipTarget(user, checkpoints, index);
  if (skip !== null) return { index: skip, reason: 'skip' };
  const previous = index > 0 ? checkpoints[index - 1] : undefined;
  if (isCheckpointReached(user, checkpoints[index], previous)) {
    return { index: index + 1, reason: 'reached' };
  }
  return null;
}

// If the user has cut a corner or taken another way, the checkpoint they are
// "supposed" to be heading for can be behind them. This finds a checkpoint
// further along that they are already close to, so guidance can jump to it.
//
// Candidates are the next `lookahead` checkpoints plus the final one (so
// reaching the destination always counts, whatever was skipped). Returns the
// index to jump to, or null to stay on the current checkpoint.
export function findSkipTarget(
  user: Coord,
  checkpoints: Coord[],
  currentIndex: number,
  options: { lookahead: number; radius: number } = GlobalStore.CHECKPOINT_SKIP
): number | null {
  const last = checkpoints.length - 1;
  if (currentIndex >= last) return null;

  const candidates: number[] = [];
  const windowEnd = Math.min(currentIndex + options.lookahead, last);
  for (let j = currentIndex + 1; j <= windowEnd; j++) candidates.push(j);
  if (last > windowEnd) candidates.push(last);

  let bestIndex: number | null = null;
  let bestDist = Math.min(
    distanceMeters(user, checkpoints[currentIndex]),
    options.radius
  );
  for (const j of candidates) {
    const d = distanceMeters(user, checkpoints[j]);
    // `<=` so that on a tie the later checkpoint wins
    if (d <= bestDist) {
      bestDist = d;
      bestIndex = j;
    }
  }
  return bestIndex;
}

// The point to steer towards: `lookahead` metres ahead of the user along the
// path user -> current checkpoint -> following checkpoints. Aiming straight at
// the next checkpoint makes the direction swing sharply on curves and just
// before reaching a checkpoint; aiming a little further along smooths that.
// With lookahead 0 this is simply the current checkpoint.
export function aimPoint(
  user: Coord,
  checkpoints: Coord[],
  currentIndex: number,
  lookahead: number = GlobalStore.AIM_LOOKAHEAD
): Coord {
  const last = checkpoints.length - 1;
  if (lookahead <= 0 || currentIndex >= last) {
    return checkpoints[Math.min(currentIndex, last)];
  }

  let from = user;
  let remaining = lookahead;
  for (let i = currentIndex; i <= last; i++) {
    const d = distanceMeters(from, checkpoints[i]);
    if (d >= remaining) {
      return interpolate(from, checkpoints[i], remaining / Math.max(d, 1e-9));
    }
    // Aiming past a sharp corner would turn the guidance before the corner is
    // reached. Keep pointing at the corner itself; gentle curves still smooth.
    if (i < last && isSharpTurn(from, d, checkpoints, i)) return checkpoints[i];
    remaining -= d;
    from = checkpoints[i];
  }
  return checkpoints[last];
}

// Does the route turn by more than AIM_MAX_TURN at checkpoint `i`? The incoming
// direction is from `from` (the user, or the previous checkpoint).
function isSharpTurn(
  from: Coord,
  distanceFromHere: number,
  checkpoints: Coord[],
  i: number
): boolean {
  let incoming: number;
  if (distanceFromHere >= 3) incoming = bearingDegrees(from, checkpoints[i]);
  else if (i > 0) incoming = bearingDegrees(checkpoints[i - 1], checkpoints[i]);
  else return false; // standing on the first checkpoint: no direction to compare
  const outgoing = bearingDegrees(checkpoints[i], checkpoints[i + 1]);
  return bearingDifference(incoming, outgoing) > GlobalStore.AIM_MAX_TURN;
}
