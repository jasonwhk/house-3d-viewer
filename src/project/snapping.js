/**
 * Snapping service.
 *
 * Pure helpers for aligning candidate positions to existing joints/floors.
 * Shared by joint placement, wall placement, and joint dragging.
 */

export const SNAP_TOLERANCE = 0.25; // world metres
export const FLOOR_SNAP_TOLERANCE = 0.3; // world metres

/**
 * @typedef {Object} SnapResult
 * @property {'joint'|'floorplane'} kind
 * @property {number[]} position [x, y, z]
 * @property {string?} id - jointId for kind 'joint'
 * @property {number} distance
 */

function dist(a, b) {
  return Math.hypot(a.x - b[0], a.y - b[1], a.z - b[2]);
}

/**
 * Find the nearest joint within SNAP_TOLERANCE of `candidate`.
 *
 * @param {{x,y,z}} candidate
 * @param {Array<{id: string, position: number[]}>} joints
 * @param {string?} excludeJointId
 * @returns {SnapResult|null}
 */
export function snapToJoints(candidate, joints, excludeJointId = null) {
  if (!joints || !joints.length) return null;

  let best = null;
  for (const joint of joints) {
    if (joint.id === excludeJointId) continue;
    const distance = dist(candidate, joint.position);
    if (distance <= SNAP_TOLERANCE && (!best || distance < best.distance)) {
      best = { kind: 'joint', position: [...joint.position], id: joint.id, distance };
    }
  }
  return best;
}

/**
 * Snap candidate vertically to a floor plane when within FLOOR_SNAP_TOLERANCE.
 *
 * @param {{x,y,z}} candidate
 * @param {number} floorY
 * @returns {SnapResult|null}
 */
export function snapToFloorPlane(candidate, floorY) {
  const distance = Math.abs(candidate.y - floorY);
  if (distance <= FLOOR_SNAP_TOLERANCE) {
    return { kind: 'floorplane', position: [candidate.x, floorY, candidate.z], id: null, distance };
  }
  return null;
}
