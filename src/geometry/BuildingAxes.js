/**
 * BuildingAxes — architectural heading detection.
 *
 * Provides a reusable "architectural north" / buildingHeading concept so POV,
 * future wall snapping, construction and dimensioning all share one coordinate
 * frame: the horizontal orientation of the imported house, derived from its own
 * geometry instead of a manual model rotation.
 *
 * Coordinate frame conventions (kept consistent with the rest of the app):
 *   - World Y is exactly vertical (up).
 *   - "Heading" / compass style: 0 rad faces world −Z, +X is +90° (east),
 *     measured clockwise when viewed from above (the same convention used by the
 *     minimap player-marker, see main.js renderMinimap).
 *   - A camera yaw `θ` (YXZ Euler) makes the camera face compass heading `−θ`.
 *
 * The principal axis is found with a small 2x2 covariance / eigen analysis of
 * the vertical (wall) faces' horizontal run directions, folded modulo 180° so a
 * wall and its reverse count once. Of the two principal lines we expose the one
 * whose orientation lands in the northern half-plane, which is the intuitive
 * "architectural north" for an axis-aligned house.
 */

import * as THREE from 'three';

// A face is treated as vertical (a wall) when its world normal's |Y| is below this.
const VERTICAL_NORMAL_LIMIT = 0.35;
// Meshes whose own name, or an ancestor's name, starts with "Wall" are the
// architectural wall geometry that defines the building grid.
const WALL_NAME_RE = /^Wall/i;

function isWallNode(mesh, houseRoot) {
  let node = mesh;
  while (node && node !== houseRoot) {
    if (WALL_NAME_RE.test(node.name || '')) return true;
    node = node.parent;
  }
  return false;
}

/**
 * Solve the symmetric 2x2 eigen problem C = [a b; b c].
 * Returns the primary (max-energy) eigenvector as [x, z] and its eigenvalue.
 */
function primaryEigen2x2(a, b, c) {
  const trace = a + c;
  const delta = Math.sqrt(((a - c) / 2) ** 2 + b * b);
  const lambdaMax = trace / 2 + delta;
  const eps = 1e-12;
  let vx;
  let vz;
  if (Math.abs(b) < eps) {
    vx = a >= c ? 1 : 0;
    vz = a >= c ? 0 : 1;
  } else {
    vx = b;
    vz = lambdaMax - a;
  }
  const len = Math.hypot(vx, vz);
  if (len > eps) {
    vx /= len;
    vz /= len;
  } else {
    vx = 1;
    vz = 0;
  }
  return { lambdaMax, vx, vz };
}

function wrapDeg(deg) {
  return ((deg % 180) + 180) % 180;
}

/**
 * Compute the architectural heading of a house from its wall geometry.
 *
 * @param {THREE.Object3D} house - the loaded house root (mesh world transforms
 *   must be current; call `house.updateMatrixWorld(true)` first).
 * @returns {{heading: number, headingDeg: number}|null} `heading` is the
 *   architectural-north compass angle in radians (0 = −Z, +X = +90°, clockwise
 *   from above), normalised into the northern half-plane [−90°, +90°); or null
 *   when no wall geometry is present.
 */
export function computeBuildingHeading(house) {
  if (!house) return null;

  // Covariance matrix C of wall run directions, weighted by horizontal edge length.
  let a = 0;
  let b = 0;
  let c = 0;
  let foundWall = false;

  const dir = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  house.traverse((mesh) => {
    if (!mesh.isMesh || !isWallNode(mesh, house)) return;
    const position = mesh.geometry?.attributes?.position;
    if (!position) return;
    foundWall = true;
    const index = mesh.geometry.index ? mesh.geometry.index.array : null;
    const vertexCount = index ? index.length : position.count;
    const triCount = Math.floor(vertexCount / 3);
    for (let t = 0; t < triCount; t += 1) {
      const i0 = index ? index[t * 3] : t * 3;
      const i1 = index ? index[t * 3 + 1] : t * 3 + 1;
      const i2 = index ? index[t * 3 + 2] : t * 3 + 2;
      vA.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld);
      vB.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
      vC.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
      e1.subVectors(vB, vA);
      e2.subVectors(vC, vA);
      dir.crossVectors(e1, e2);
      if (dir.lengthSq() < 1e-12) continue;
      dir.normalize();
      if (Math.abs(dir.y) >= VERTICAL_NORMAL_LIMIT) continue; // not a vertical face
      // Wall run direction = face normal rotated 90° in the horizontal plane.
      const rx = dir.z;
      const rz = -dir.x;
      // Outer products auto-fold the ±180° symmetry (d⊗d === −d⊗−d).
      const w = Math.hypot(e1.x, e1.z);
      a += w * rx * rx;
      b += w * rx * rz;
      c += w * rz * rz;
    }
  });

  if (!foundWall) return null;

  const { vx, vz } = primaryEigen2x2(a, b, c);
  // Compass heading of the primary principal line (mod 180°).
  const h1 = wrapDeg((Math.atan2(vx, -vz) * 180) / Math.PI);
  const h2 = wrapDeg(h1 + 90); // perpendicular principal line

  const northDistance = (h) => Math.min(Math.abs(h), Math.abs(h - 180));
  let chosen = northDistance(h1) <= northDistance(h2) ? h1 : h2;

  // Normalise "architectural north" into the northern half-plane [−90°, +90°).
  while (chosen >= 90) chosen -= 180;
  while (chosen < -90) chosen += 180;

  const headingDeg = chosen;
  const heading = (headingDeg * Math.PI) / 180;
  return { heading, headingDeg };
}
