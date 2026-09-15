/**
 * Migrate old build-items format (placement-based) to the joint+wall model.
 *
 * Old format: `{ id, type: 'wall', a: [x,y,z], b: [x,y,z], baseY, height, thickness }`
 * New format: joint records + wall records referencing startJointId/endJointId.
 *
 * Endpoint positions are deduplicated via a quantized coordinate key, so
 * touching old walls share joints in the new model.
 */

import { nextId } from '../shared/id.js';

/**
 * @param {Array} oldItems - array of { id, type, a[], b[], baseY, height, thickness, ... }
 * @returns {{ walls: Array, joints: Array }}
 */
export function migrateBuildItemsToJointModel(oldItems) {
  const walls = [];
  const joints = [];
  const jointMap = new Map(); // quantized "x,y,z" -> jointId

  function jointIdFor(pos) {
    const key = `${pos[0].toFixed(4)},${pos[1].toFixed(4)},${pos[2].toFixed(4)}`;
    if (!jointMap.has(key)) {
      const jointId = nextId('j');
      jointMap.set(key, jointId);
      joints.push({ id: jointId, position: [pos[0], pos[1], pos[2]] });
    }
    return jointMap.get(key);
  }

  for (const item of oldItems || []) {
    if (item.type !== 'wall') continue;
    const startPos = item.a ? [item.a[0], item.a[1], item.a[2]] : [0, item.baseY || 0, 0];
    const endPos = item.b ? [item.b[0], item.b[1], item.b[2]] : [1, item.baseY || 0, 0];

    walls.push({
      id: item.id || nextId('w'),
      startJointId: jointIdFor(startPos),
      endJointId: jointIdFor(endPos),
      baseY: item.baseY ?? startPos[1],
      height: item.height || 2.5,
      thickness: item.thickness || 0.12,
    });
  }

  // Stairs remain in their own format (no joint model yet) — handled by
  // schema.migrateFromLocalStorage.
  return { walls, joints };
}
