/**
 * ProjectStore — centralized project state with autosave, validation, and migration.
 *
 * Wraps the canonical project schema from schema.js. Owns referential
 * integrity between joints and walls: removing a joint cascades to any wall
 * referencing it; removing a wall prunes joints that no wall uses anymore
 * (unless keepOrphanJoints is set, e.g. during bulk operations).
 */

import { createEmptyProject, validateProject, migrateFromLocalStorage } from './schema.js';
import { migrateBuildItemsToJointModel } from './migration.js';

const STORAGE_KEY = 'house3d-project-v1';
const AUTOSAVE_DELAY_MS = 500;

let project = null;
let listeners = [];
let isModified = false;
let autosaveTimer = null;

/**
 * Initialize from localStorage, legacy ad-hoc keys, or an empty project.
 * Legacy placement-based walls are converted to the joint+wall model.
 *
 * @param {{ oldRenovationData?: Record<string, any>, oldBuildItems?: any[] }} legacy
 * @returns {object} The project object
 */
export function initProject(legacy = {}) {
  const fromStorage = loadFromStorage();
  if (fromStorage) {
    const validation = validateProject(fromStorage);
    if (validation.valid) {
      project = fromStorage;
    } else {
      console.warn('Stored project failed validation, migrating:', validation.errors);
      project = createEmptyProject();
    }
  } else if (legacy.oldRenovationData || legacy.oldBuildItems) {
    project = createEmptyProject();
    const migrated = migrateFromLocalStorage(legacy.oldRenovationData, legacy.oldBuildItems);
    if (migrated.renovation) project.renovation = migrated.renovation;
    if (migrated.stairs) project.stairs = migrated.stairs;
    // Convert placement-based legacy walls to the joint+wall model.
    const converted = migrateBuildItemsToJointModel(legacy.oldBuildItems);
    if (converted.walls.length) project.walls = converted.walls;
    if (converted.joints.length) project.joints = converted.joints;
    markModified();
  } else {
    project = createEmptyProject();
  }
  installUnloadFlush();
  return project;
}

/**
 * Get the current project object. Never mutate directly — use setter methods.
 * @returns {object}
 */
export function getProject() {
  return project;
}

/**
 * Replace the entire project state. Triggers autosave.
 */
export function setProject(next) {
  if (typeof next !== 'object' || next === null) {
    throw new Error('setProject expects an object');
  }
  project = next;
  scheduleAutosave();
}

/**
 * Update a top-level field: project[name] = fn(project[name]) or literal value.
 */
export function updateField(name, fn) {
  if (typeof fn === 'function') {
    project[name] = fn(project[name]);
  } else {
    project[name] = fn;
  }
  markModified();
}

// ===== Renovation CRUD =====

/**
 * Set the renovation record for a given key.
 * @param {string} key
 * @param {{ status: string, discipline: string, note: string }} record
 */
export function setRenovation(key, record) {
  if (!project.renovation) project.renovation = {};
  project.renovation[key] = {
    status: record.status || 'existing',
    discipline: record.discipline || 'architecture',
    note: record.note || '',
  };
  markModified();
}

/** Get renovation record for a key (defaults to existing/architecture). */
export function getRenovation(key) {
  return project.renovation?.[key] || { status: 'existing', discipline: 'architecture', note: '' };
}

/** Remove renovation record for a key. */
export function removeRenovation(key) {
  if (project.renovation && key in project.renovation) {
    delete project.renovation[key];
    markModified();
  }
}

/** Deep copy of the full renovation map. */
export function getRenovationMap() {
  return JSON.parse(JSON.stringify(project.renovation || {}));
}

/** Replace the full renovation map. */
export function setRenovationMap(map) {
  project.renovation = map || {};
  markModified();
}

/** Count renovation records by status. */
export function countRenovationStatuses() {
  let demolish = 0, proposed = 0, existing = 0;
  for (const record of Object.values(project.renovation || {})) {
    if (record?.status === 'demolish') demolish++;
    else if (record?.status === 'proposed') proposed++;
    else existing++;
  }
  return { demolish, proposed, existing };
}

// ===== Base model access =====

/**
 * Getter/setter for baseModel fields. Read-only access never mutates state.
 * baseModel()            → the (live) baseModel object
 * baseModel('fingerprint')            → a property value
 * baseModel('fingerprint', 'abc')     → set + autosave
 */
export function baseModel(prop, value) {
  if (!project) return undefined;
  if (!project.baseModel) {
    if (prop === undefined) return {};
    project.baseModel = {};
  }
  if (prop === undefined) return project.baseModel;
  if (value === undefined) return project.baseModel[prop];
  project.baseModel[prop] = value;
  markModified();
  return value;
}

// ===== Joints CRUD =====

/** @returns {Array<{id: string, position: number[]}>} */
export function getJoints() { return project?.joints || []; }

/** @returns {object|undefined} joint */
export function getJoint(id) {
  return getJoints().find(j => j.id === id);
}

/** Append a joint record. @returns {object} the joint */
export function addJoint(joint) {
  if (!project.joints) project.joints = [];
  project.joints.push(joint);
  markModified();
  return joint;
}

/**
 * Remove a joint and cascade: every wall referencing it is removed too.
 * @returns {boolean} false when no such joint existed.
 */
export function removeJoint(id) {
  const joints = getJoints();
  if (!joints.some(j => j.id === id)) return false;
  project.joints = joints.filter(j => j.id !== id);
  project.walls = getWalls().filter(
    w => w.startJointId !== id && w.endJointId !== id
  );
  markModified();
  return true;
}

/** Move a joint. position: {x,y,z} or [x,y,z]. */
export function setJointPosition(id, position) {
  const joint = getJoint(id);
  if (!joint) return false;
  joint.position = Array.isArray(position)
    ? [position[0], position[1], position[2]]
    : [position.x, position.y, position.z];
  markModified();
  return true;
}

/** All walls referencing this joint at either end. */
export function getWallsForJoint(jointId) {
  return getWalls().filter(w => w.startJointId === jointId || w.endJointId === jointId);
}

// ===== Walls CRUD =====

/** @returns {Array} walls */
export function getWalls() { return project?.walls || []; }

/** @returns {object|undefined} wall */
export function getWall(id) {
  return getWalls().find(w => w.id === id);
}

/** Append a wall record. @returns {object} the wall */
export function addWall(wall) {
  if (!project.walls) project.walls = [];
  project.walls.push(wall);
  markModified();
  return wall;
}

/**
 * Remove a wall; prunes joints left without any wall connection
 * unless keepOrphanJoints is true.
 * @returns {boolean} false when no such wall existed.
 */
export function removeWall(id, keepOrphanJoints = false) {
  const walls = getWalls();
  const wall = walls.find(w => w.id === id);
  if (!wall) return false;
  project.walls = walls.filter(w => w.id !== id);
  if (!keepOrphanJoints) pruneOrphanJoints();
  markModified();
  return true;
}

/** Patch supported wall fields. @returns {boolean} false when no such wall. */
export function updateWall(id, updates) {
  const wall = getWall(id);
  if (!wall) return false;
  if (updates.startJointId !== undefined) wall.startJointId = updates.startJointId;
  if (updates.endJointId !== undefined) wall.endJointId = updates.endJointId;
  if (updates.baseY !== undefined) wall.baseY = updates.baseY;
  if (updates.height !== undefined) wall.height = updates.height;
  if (updates.thickness !== undefined) wall.thickness = updates.thickness;
  markModified();
  return true;
}

/** Remove every joint not referenced by any wall. */
export function pruneOrphanJoints() {
  if (!project.joints || !project.joints.length) return;
  const used = new Set();
  for (const w of getWalls()) {
    if (w.startJointId) used.add(w.startJointId);
    if (w.endJointId) used.add(w.endJointId);
  }
  const kept = project.joints.filter(j => used.has(j.id));
  if (kept.length !== project.joints.length) project.joints = kept;
}

// ===== Stairs CRUD =====

/** @returns {Array} stairs */
export function getStairs() { return project?.stairs || []; }

/** Append a stair record. @returns {object} the stair */
export function addStair(stair) {
  if (!project.stairs) project.stairs = [];
  project.stairs.push(stair);
  markModified();
  return stair;
}

/** @returns {boolean} false when no such stair existed. */
export function removeStair(id) {
  const stairs = getStairs();
  if (!stairs.some(s => s.id === id)) return false;
  project.stairs = stairs.filter(s => s.id !== id);
  markModified();
  return true;
}

// ===== History snapshot/restore =====

/**
 * Serialize the undoable slice of project state (string, JSON-safe).
 * View/camera/navigation intentionally excluded.
 */
export function snapshotProjectData() {
  return JSON.stringify({
    renovation: project.renovation || {},
    walls: project.walls || [],
    stairs: project.stairs || [],
    joints: project.joints || [],
  });
}

/** Restore the undoable slice of project state from a snapshot object. */
export function replaceProjectData(data) {
  if (data) {
    if (data.renovation !== undefined) project.renovation = data.renovation;
    if (data.walls !== undefined) project.walls = data.walls;
    if (data.stairs !== undefined) project.stairs = data.stairs;
    if (data.joints !== undefined) project.joints = data.joints;
  }
  markModified();
}

// ===== Subscription =====

/** Subscribe to persisted-state notifications. Returns an unsubscribe fn. */
export function subscribe(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

// --- private helpers ---

function markModified() {
  if (project?.project) project.project.updatedAt = new Date().toISOString();
  isModified = true;
  scheduleAutosave();
}

function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveToStorage, AUTOSAVE_DELAY_MS);
}

function saveToStorage() {
  autosaveTimer = null;
  if (!project) return;
  try {
    if (project.project) project.project.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    isModified = false;
    notifyListeners();
  } catch (error) {
    console.warn('ProjectStore autosave failed', error);
  }
}

/** Flush pending changes synchronously (used on unload / tab hide). */
export function flushSave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  if (isModified) saveToStorage();
}

let unloadFlushInstalled = false;
function installUnloadFlush() {
  if (unloadFlushInstalled || typeof window === 'undefined') return;
  unloadFlushInstalled = true;
  window.addEventListener('beforeunload', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function notifyListeners() {
  for (const fn of listeners) {
    try { fn(); } catch (error) { console.warn('ProjectStore listener failed', error); }
  }
}
