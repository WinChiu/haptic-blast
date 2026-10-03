import { Coord, distanceMeters, distanceToSegmentMeters, interpolate } from './geo';
import { GlobalStore } from './globals';

export type CheckpointOptions = {
  simplifyTolerance: number; // metres a point may stray before it counts as a turn
  maxSpacing: number; // longest allowed gap between checkpoints, metres
  minSpacing: number; // checkpoints closer than this to the previous one are dropped
};

// Douglas-Peucker: keep only the points that bend the line by more than
// `tolerance` metres. Iterative so very long routes can't overflow the stack.
function simplify(points: Coord[], tolerance: number): Coord[] {
  if (points.length <= 2) return points;

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegmentMeters(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }
    if (maxIndex !== -1 && maxDist > tolerance) {
      keep[maxIndex] = true;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

// Turn a dense route from the routing server into a short list of checkpoints:
// one at every real turn, plus extra ones so no gap is longer than maxSpacing.
export function generateCheckpoints(
  route: Coord[],
  options: Partial<CheckpointOptions> = {}
): Coord[] {
  const { simplifyTolerance, maxSpacing, minSpacing } = {
    ...GlobalStore.CHECKPOINTS,
    ...options,
  };

  if (route.length <= 1) return route;

  const corners = simplify(route, simplifyTolerance);
  const last = corners[corners.length - 1];

  // Drop corners that sit too close to the previous kept checkpoint.
  // The final point is always kept, replacing a too-close neighbour.
  const spaced: Coord[] = [corners[0]];
  for (let i = 1; i < corners.length - 1; i++) {
    if (distanceMeters(spaced[spaced.length - 1], corners[i]) >= minSpacing) {
      spaced.push(corners[i]);
    }
  }
  if (
    spaced.length > 1 &&
    distanceMeters(spaced[spaced.length - 1], last) < minSpacing
  ) {
    spaced.pop();
  }
  spaced.push(last);

  // Fill long straight stretches with evenly spaced extra checkpoints.
  const result: Coord[] = [spaced[0]];
  for (let i = 1; i < spaced.length; i++) {
    const from = spaced[i - 1];
    const to = spaced[i];
    const parts = Math.ceil(distanceMeters(from, to) / maxSpacing);
    for (let p = 1; p < parts; p++) {
      result.push(interpolate(from, to, p / parts));
    }
    result.push(to);
  }

  return result;
}
