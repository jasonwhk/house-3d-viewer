import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateBuildItemsToJointModel } from '../src/project/migration.js';

test('migrateBuildItemsToJointModel converts placement walls to joint model', () => {
  const old = [
    { id: 'w1', type: 'wall', a: [0, 0, 0], b: [0, 0, 3], baseY: 0, height: 2.5, thickness: 0.12 },
    { id: 'w2', type: 'wall', a: [0, 0, 3], b: [4, 0, 3], baseY: 0, height: 2.5, thickness: 0.12 },
  ];
  const { walls, joints } = migrateBuildItemsToJointModel(old);
  assert.equal(walls.length, 2);
  assert.equal(joints.length, 3);
  // Shared endpoint [0,0,3] dedupes into a single joint.
  assert.equal(walls[0].endJointId, walls[1].startJointId);
});

test('migrateBuildItemsToJointModel ignores stairs and non-wall items', () => {
  const old = [{ type: 'stairs', a: [0, 0, 0], b: [1, 0, 1] }];
  const { walls, joints } = migrateBuildItemsToJointModel(old);
  assert.equal(walls.length, 0);
  assert.equal(joints.length, 0);
});

test('migrateBuildItemsToJointModel assigns stable string ids', () => {
  const { walls, joints } = migrateBuildItemsToJointModel([{ type: 'wall', a: [0, 0, 0], b: [1, 0, 0] }]);
  assert.equal(walls.length, 1);
  assert.match(walls[0].id, /^w_/);
  assert.match(joints[0].id, /^j_/);
});
