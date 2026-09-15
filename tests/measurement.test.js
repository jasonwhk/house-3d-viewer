import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  pointToPoint3D,
  horizontalDistance,
  verticalRise,
  polylineLength,
  polygonArea,
  pointInPolygon,
  pointToSegment,
} from '../src/interaction/measurement.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });
const V3 = (x, y = 0, z = 0) => new THREE.Vector3(x, y, z);

test('pointToPoint3D returns Euclidean distance', () => {
  assert.equal(pointToPoint3D(v(0, 0, 0), v(3, 4, 0)), 5);
  assert.equal(pointToPoint3D(v(0, 0, 0), v(1, 2, 2)), 3);
});

test('horizontalDistance ignores Y', () => {
  assert.equal(horizontalDistance(v(0, 5, 0), v(3, 9, 4)), 5);
});

test('verticalRise is signed difference in Y', () => {
  assert.equal(verticalRise(v(0, 2, 0), v(0, 5, 0)), 3);
  assert.equal(verticalRise(v(0, 5, 0), v(0, 2, 0)), -3);
});

test('polylineLength sums segment lengths', () => {
  assert.equal(polylineLength([v(0, 0, 0), v(3, 0, 4), v(3, 0, 8)]), 5 + 4);
  assert.equal(polylineLength([v(0, 0, 0)]), 0);
});

test('polygonArea computes shoelace area on XZ plane', () => {
  const square = [v(0, 0, 0), v(2, 0, 0), v(2, 0, 2), v(0, 0, 2)];
  assert.equal(polygonArea(square), 4);
  const tri = [v(0, 0, 0), v(3, 0, 0), v(0, 0, 4)];
  assert.equal(polygonArea(tri), 6);
});

test('pointInPolygon detects inside/outside', () => {
  const square = [v(0, 0, 0), v(2, 0, 0), v(2, 0, 2), v(0, 0, 2)];
  assert.equal(pointInPolygon(v(1, 0, 1), square), true);
  assert.equal(pointInPolygon(v(3, 0, 3), square), false);
});

test('pointToSegment returns closest point and distance', () => {
  const a = V3(0, 0, 0), b = V3(4, 0, 0);
  const { distance, closest } = pointToSegment(V3(2, 0, 3), a, b);
  assert.equal(distance, 3);
  assert.ok(Math.abs(closest.x - 2) < 1e-9);
});
