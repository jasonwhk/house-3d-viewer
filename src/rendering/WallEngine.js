/**
 * WallEngine — renders joint+wall records as 3D meshes.
 *
 * Walls are defined by startJointId + endJointId, height, thickness, baseY.
 * Meshes are created here and placed into a caller-provided THREE.Group.
 * The engine is stateless w.r.t. the scene: main.js owns the group and the
 * mesh<->wall id mapping (via mesh.userData.wallId).
 */

import * as THREE from 'three';
import { getJoint } from '../project/ProjectStore.js';

const DEFAULT_HEIGHT = 2.5;
const DEFAULT_THICKNESS = 0.12;
const MIN_LENGTH = 0.05;

/**
 * Build wall metrics (positions, length, rotation) from a wall record.
 * Pure — no THREE object creation besides math helpers.
 *
 * @param {object} wallDef
 * @returns {{start: THREE.Vector3, end: THREE.Vector3, center: THREE.Vector3,
 *            length: number, yaw: number, height: number, thickness: number}|null}
 */
export function computeWallTransform(wallDef) {
  if (!wallDef) return null;
  const startJoint = getJoint(wallDef.startJointId);
  const endJoint = getJoint(wallDef.endJointId);
  if (!startJoint || !endJoint) return null;

  const start = new THREE.Vector3(...startJoint.position);
  const end = new THREE.Vector3(...endJoint.position);

  const direction = new THREE.Vector3().subVectors(end, start);
  direction.y = 0; // walls are vertical extrusions along the XZ plane
  const length = Math.max(direction.length(), MIN_LENGTH);

  const height = wallDef.height || DEFAULT_HEIGHT;
  const thickness = wallDef.thickness || DEFAULT_THICKNESS;
  const baseY = wallDef.baseY ?? Math.min(start.y, end.y);

  const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  center.y = baseY + height / 2;

  return { start, end, center, length, height, thickness, yaw: -Math.atan2(direction.z, direction.x) };
}

/**
 * Create the visual mesh for a wall record.
 *
 * @param {object} wallDef - wall record
 * @param {THREE.Material} [material]
 * @returns {{ mesh: THREE.Mesh, length: number }|null} null when joints are missing
 */
export function createWallMesh(wallDef, material = null) {
  const t = computeWallTransform(wallDef);
  if (!t) return null;

  const geometry = new THREE.BoxGeometry(t.length, t.height, t.thickness);
  const mesh = new THREE.Mesh(geometry, material || new THREE.MeshStandardMaterial({
    color: 0x4f9a8d, roughness: 0.72, metalness: 0, transparent: true, opacity: 0.82,
  }));
  mesh.name = `Wall_${wallDef.id}`;
  mesh.position.copy(t.center);
  mesh.rotation.y = t.yaw;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.localBuild = true;
  mesh.userData.wallId = wallDef.id;

  return { mesh, length: t.length };
}

/**
 * Re-apply a wall record's transform to an existing mesh (used after a joint
 * move). Rebuilds geometry when length changed, updates position + rotation.
 *
 * @param {THREE.Mesh} mesh - a mesh previously produced by createWallMesh/makeWallMesh
 * @param {object} wallDef
 * @returns {boolean} false when joints are missing
 */
export function applyWallTransform(mesh, wallDef) {
  const t = computeWallTransform(wallDef);
  if (!t) return false;

  const old = mesh.geometry.parameters || {};
  if (Math.abs((old.width || 0) - t.length) > 1e-6 ||
      Math.abs((old.height || 0) - t.height) > 1e-6 ||
      Math.abs((old.depth || 0) - t.thickness) > 1e-6) {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BoxGeometry(t.length, t.height, t.thickness);
  }
  mesh.position.copy(t.center);
  mesh.rotation.y = t.yaw;
  return true;
}

/**
 * Derived quantities for a wall record.
 *
 * @param {object} wallDef
 * @returns {{ centrelineLength: number, grossArea: number, volume: number }}
 */
export function calculateWallQuantities(wallDef) {
  const t = computeWallTransform(wallDef);
  if (!t) return { centrelineLength: 0, grossArea: 0, volume: 0 };
  return {
    centrelineLength: t.length,
    grossArea: t.length * t.height,
    volume: t.length * t.height * t.thickness,
  };
}
