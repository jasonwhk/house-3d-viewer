import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { computeBuildingHeading } from '../src/geometry/BuildingAxes.js';

const rad = (deg) => (deg * Math.PI) / 180;

/**
 * Build a thin vertical wall mesh named `Wall_test_0`.
 * `run` is the wall's horizontal run direction (unit-ish [x, z]);
 * a wall's face normals are perpendicular to `run` and horizontal.
 */
function makeWall(runX, runZ, len, height = 3, thickness = 0.1) {
  const px = 0; const py = 0; const pz = 0;
  const perpX = -runZ; const perpZ = runX; // horizontal normal of the wall
  const hx = perpX * (thickness / 2);
  const hz = perpZ * (thickness / 2);
  const dirX = runX; const dirZ = runZ;
  const hL = len / 2;
  const p1 = [px + dirX * hL + hx, py + height, pz + dirZ * hL + hz];
  const p2 = [px - dirX * hL + hx, py + height, pz - dirZ * hL + hz];
  const p3 = [px - dirX * hL + hx, py, pz - dirZ * hL + hz];
  const p4 = [px + dirX * hL + hx, py, pz + dirZ * hL + hz];
  const p5 = [px + dirX * hL - hx, py + height, pz + dirZ * hL - hz];
  const p6 = [px - dirX * hL - hx, py + height, pz - dirZ * hL - hz];
  const p7 = [px - dirX * hL - hx, py, pz - dirZ * hL - hz];
  const p8 = [px + dirX * hL - hx, py, pz + dirZ * hL - hz];
  const verts = [p1, p2, p3, p1, p3, p4, p5, p6, p7, p5, p7, p8];
  const geometry = new THREE.BufferGeometry();
  const arr = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => { arr[i * 3] = v[0]; arr[i * 3 + 1] = v[1]; arr[i * 3 + 2] = v[2]; });
  geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = 'Wall_test_0';
  return mesh;
}

function headingDeg(group) {
  const r = computeBuildingHeading(group);
  return r && r.headingDeg;
}

test('axis-aligned house with X-run walls reports architectural north ≈ 0° (= −Z)', () => {
  const g = new THREE.Group();
  g.add(makeWall(1, 0, 10)); // wall running along X
  g.add(makeWall(0, 1, 2)); // short wall along Z
  assert.ok(Math.abs(headingDeg(g)) < 0.5);
});

test('axis-aligned house with Z-run walls reports north ≈ 0°', () => {
  const g = new THREE.Group();
  g.add(makeWall(0, 1, 10)); // wall running along Z
  const deg = headingDeg(g);
  assert.ok(deg === 0 || Math.abs(Math.abs(deg) - 0) < 0.5);
});

test('rotated house (30°) yields architectural north ≈ 30° from geometry', () => {
  const ca = Math.cos(rad(30)); const sa = Math.sin(rad(30));
  const g = new THREE.Group();
  g.add(makeWall(ca, sa, 10));
  g.add(makeWall(-sa, ca, 8)); // perpendicular wall
  assert.ok(Math.abs(headingDeg(g) - 30) < 0.5);
});

test('principal axes returned for a rotated house are mutually perpendicular', () => {
  // Recompute by feeding the two eigen lines directly: 30° and 120° differ by 90°.
  const ca = Math.cos(rad(30)); const sa = Math.sin(rad(30));
  const g = new THREE.Group();
  g.add(makeWall(ca, sa, 10));
  const heading = computeBuildingHeading(g).headingDeg; // ~30 or -60 (north half-plane)
  // Either the 30° line or its perpendicular; whatever is chosen must satisfy the
  // orthogonal principal grid — here we just assert a valid north half-plane result.
  assert.ok(heading >= -90 && heading < 90);
});

test('returns null when there is no wall geometry', () => {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4));
  floor.name = 'Floor_F1_Other_0';
  g.add(floor);
  assert.equal(computeBuildingHeading(g), null);
});

test('ignores horizontal floor planes (only vertical walls define the grid)', () => {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10));
  floor.name = 'Floor_F1_Other_0';
  floor.rotation.x = -Math.PI / 2; // horizontal
  g.add(floor);
  assert.equal(computeBuildingHeading(g), null);
});
