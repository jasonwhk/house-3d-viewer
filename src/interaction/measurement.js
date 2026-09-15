/**
 * Measure engine — pure math functions for 3D measurement.
 *
 * Each function operates on raw THREE.Vector3 coordinates.
 * No dependencies on project state.
 */

import * as THREE from 'three';

export function pointToPoint3D(a, b) {
  return new THREE.Vector3().subVectors(b, a).length();
}

export function horizontalDistance(a, b) {
  const v = new THREE.Vector3().subVectors(b, a);
  v.y = 0;
  return v.length();
}

export function verticalRise(a, b) {
  return b.y - a.y;
}

export function polylineLength(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += new THREE.Vector3().subVectors(points[i], points[i - 1]).length();
  }
  return total;
}

export function polygonArea(points) {
  if (!points || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].z;
    area -= points[j].x * points[i].z;
  }
  return Math.abs(area / 2);
}

export function pointInPolygon(point, points) {
  if (!points || !points.length) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, zi = points[i].z;
    const xj = points[j].x, zj = points[j].z;
    if (((zi > point.z) !== (zj > point.z)) &&
        (point.x < (xj - xi) * (point.z - zi) / (zj - zi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Distance from point to line segment.
 *
 * @param {THREE.Vector3} point
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @returns {{ distance: number, closest: THREE.Vector3 }}
 */
export function pointToSegment(point, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ap = new THREE.Vector3().subVectors(point, a);
  const lenSq = ab.lengthSq();
  if (lenSq === 0) return { distance: point.distanceTo(a), closest: a.clone() };

  let t = ap.dot(ab) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closest = new THREE.Vector3().copy(a).addScaledVector(ab, t);
  return { distance: point.distanceTo(closest), closest };
}

export function vectorDot(a, b) {
  return a.dot(b);
}

export function normalizeVector(v) {
  return new THREE.Vector3().copy(v).normalize();
}
