/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Coord } from '../util/geo';

const METERS_PER_DEGREE_LAT = 111320;

// A point `north` / `east` metres away from `from` (small distances only)
export function offset(from: Coord, north: number, east: number): Coord {
  return {
    latitude: from.latitude + north / METERS_PER_DEGREE_LAT,
    longitude:
      from.longitude +
      east / (METERS_PER_DEGREE_LAT * Math.cos((from.latitude * Math.PI) / 180)),
  };
}

// The real 3.1 km Stockholm route saved from the routing server
export function loadStockholmRoute(): Coord[] {
  const file = join(__dirname, 'fixtures', 'stockholm-walk.json');
  const { coordinates } = JSON.parse(readFileSync(file, 'utf8')) as {
    coordinates: [number, number][];
  };
  return coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}
