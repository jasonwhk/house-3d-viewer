import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapToJoints, snapToFloorPlane, SNAP_TOLERANCE } from '../src/project/snapping.js';

const joints = [
  { id: 'j1', position: [0, 0, 0] },
  { id: 'j2', position: [5, 0, 5] },
];

test('snapToJoints returns null when nothing within tolerance', () => {
  assert.equal(snapToJoints({ x: 3, y: 0, z: 3 }, joints), null);
});

test('snapToJoints snaps to nearest joint within tolerance', () => {
  const result = snapToJoints({ x: 0.1, y: 0, z: 0.05 }, joints);
  assert.ok(result);
  assert.equal(result.kind, 'joint');
  assert.equal(result.id, 'j1');
  assert.equal(result.position[0], 0);
});

test('snapToJoints excludes a given joint id', () => {
  assert.equal(snapToJoints({ x: 0.1, y: 0, z: 0.05 }, joints, 'j1'), null);
});

test('snapToFloorPlane snaps vertically within tolerance', () => {
  const result = snapToFloorPlane({ x: 1, y: 0.2, z: 1 }, 0);
  assert.ok(result);
  assert.equal(result.kind, 'floorplane');
  assert.equal(result.position[1], 0);
});

test('SNAP_TOLERANCE is a sane world-metre constant', () => {
  assert.ok(SNAP_TOLERANCE > 0 && SNAP_TOLERANCE < 1);
});
