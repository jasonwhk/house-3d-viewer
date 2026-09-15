/**
 * JointGraph — joint record creation/reuse and connected-wall updates.
 *
 * Thin coordination layer over ProjectStore: creates joints with shared ID
 * generation, reuses joints within the shared snap tolerance, and moves
 * joints so callers can refresh connected wall visuals.
 */

import { getJoints, addJoint, getJoint, setJointPosition, getWallsForJoint } from '../project/ProjectStore.js';
import { nextId } from '../shared/id.js';
import { SNAP_TOLERANCE } from '../project/snapping.js';

/**
 * @typedef {Object} JointRecord
 * @property {string} id
 * @property {number[]} position [x, y, z]
 */

/**
 * Add a joint at [x, y, z] and return it.
 *
 * @param {number[]} position
 * @returns {JointRecord}
 */
export function addJointRecord(position) {
  return addJoint({ id: nextId('j'), position: [...position] });
}

/**
 * Move a joint and return IDs of walls that need a visual refresh.
 *
 * @param {string} id
 * @param {number[]|{x,y,z}} newPosition
 * @returns {string[]} affected wall IDs
 */
export function moveJointGraph(id, newPosition) {
  if (!setJointPosition(id, newPosition)) return [];
  return getWallsForJoint(id).map(w => w.id);
}

/**
 * Create or reuse a joint at `position` (within SNAP_TOLERANCE).
 *
 * @param {{x: number, y: number, z: number}} position
 * @param {string?} excludeJointId - joint to never reuse (the one being dragged)
 * @returns {{ isNew: boolean, joint: JointRecord }}
 */
export function getOrCreateJoint(position, excludeJointId = null) {
  for (const j of getJoints()) {
    if (j.id === excludeJointId) continue;
    const dx = j.position[0] - position.x;
    const dy = j.position[1] - position.y;
    const dz = j.position[2] - position.z;
    if (Math.hypot(dx, dy, dz) <= SNAP_TOLERANCE) {
      return { isNew: false, joint: j };
    }
  }
  return { isNew: true, joint: addJointRecord([position.x, position.y, position.z]) };
}
