/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alongTrackMeters,
  bearingDegrees,
  distanceMeters,
  distanceToSegmentMeters,
  interpolate,
} from '../util/geo';
import { offset } from './helpers';

const origin = { latitude: 59.35, longitude: 18.07 };

test('distanceMeters: one degree of latitude is about 111 km', () => {
  const d = distanceMeters(origin, { latitude: 60.35, longitude: 18.07 });
  assert.ok(Math.abs(d - 111195) < 200, `got ${d}`);
});

test('distanceMeters: zero for the same point, symmetric', () => {
  const b = offset(origin, 30, 40);
  assert.equal(distanceMeters(origin, origin), 0);
  assert.ok(Math.abs(distanceMeters(origin, b) - distanceMeters(b, origin)) < 1e-6);
  assert.ok(Math.abs(distanceMeters(origin, b) - 50) < 0.5); // 30-40-50 triangle
});

test('bearingDegrees: north 0, east 90, south 180, west 270', () => {
  const approx = (a: number, b: number) => Math.abs(a - b) < 0.5;
  assert.ok(approx(bearingDegrees(origin, offset(origin, 100, 0)), 0));
  assert.ok(approx(bearingDegrees(origin, offset(origin, 0, 100)), 90));
  assert.ok(approx(bearingDegrees(origin, offset(origin, -100, 0)), 180));
  assert.ok(approx(bearingDegrees(origin, offset(origin, 0, -100)), 270));
});

test('distanceToSegmentMeters: beside, and beyond the end of, a segment', () => {
  const a = origin;
  const b = offset(origin, 100, 0);
  // 10 m east of the middle of the segment
  assert.ok(Math.abs(distanceToSegmentMeters(offset(origin, 50, 10), a, b) - 10) < 0.2);
  // 20 m past the end: nearest point is the end itself
  assert.ok(Math.abs(distanceToSegmentMeters(offset(origin, 120, 0), a, b) - 20) < 0.2);
});

test('alongTrackMeters: negative behind a, positive past it', () => {
  const b = offset(origin, 50, 0);
  assert.ok(alongTrackMeters(offset(origin, -8, 0), origin, b) < 0);
  assert.ok(alongTrackMeters(offset(origin, 8, 5), origin, b) > 0);
  assert.equal(alongTrackMeters(offset(origin, 8, 0), origin, origin), 0); // a == b
});

test('interpolate: halfway between two points', () => {
  const b = offset(origin, 100, 0);
  const mid = interpolate(origin, b, 0.5);
  assert.ok(Math.abs(distanceMeters(origin, mid) - 50) < 0.5);
});
