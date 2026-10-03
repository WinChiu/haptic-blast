import { Coord, distanceMeters, distanceToSegmentMeters } from './geo';
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
