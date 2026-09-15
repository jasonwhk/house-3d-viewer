/**
 * ProjectStore — centralized project state with autosave, validation, and migration.
 *
 * Wraps the canonical project schema from schema.js.
 * Designed to replace ad-hoc localStorage access from main.js.
 */

import {
  createEmptyProject,
  validateProject,
  migrateFromLocalStorage,
} from './schema.js';

const STORAGE_KEY = 'house3d-project-v1';

let project = null;
let listeners = [];
let isModified = false;
let autosaveTimer = null;

/**
 * Initialize from project schema or migrate from legacy localStorage.
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
    if (migrated.walls) project.walls = migrated.walls;
    if (migrated.stairs) project.stairs = migrated.stairs;
    markModified();
  } else {
    project = createEmptyProject();
  }

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
 * Update a top-level field: project[name](value).
 */
export function updateField(name, fn) {
  if (typeof fn !== 'function') {
    project[name] = fn;
  } else {
    project[name] = fn(project[name]);
  }
  markModified();
}

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

/**
 * Get renovation record for a key.
 * @param {string} key
 */
export function getRenovation(key) {
  return project.renovation?.[key] || { status: 'existing', discipline: 'architecture', note: '' };
}

/**
 * Remove renovation record for a key.
 * @param {string} key
 */
export function removeRenovation(key) {
  if (project.renovation && key in project.renovation) {
    delete project.renovation[key];
    markModified();
  }
}

/**
 * Get a copy of the full renovation map.
 * @returns {Record<string, { status: string, discipline: string, note: string }>}
 */
export function getRenovationMap() {
  return JSON.parse(JSON.stringify(project.renovation || {}));
}

/**
 * Replace the full renovation map.
 * @param {Record<string, any>} map
 */
export function setRenovationMap(map) {
  project.renovation = map || {};
  markModified();
}

/**
 * Replace the editable semantic data used by history restore,
 * without touching metadata like `project` or `baseModel`.
 *
 * @param {{ renovation?: object, walls?: any[], stairs?: any[] }} data
 */
export function replaceProjectData(data) {
  if (data && data.renovation !== undefined) project.renovation = data.renovation;
  if (data && data.walls !== undefined) project.walls = data.walls;
  if (data && data.stairs !== undefined) project.stairs = data.stairs;
  markModified();
}

/**
 * Capture the editable semantic state as a JSON string (snapshot for history).
 * @returns {string}
 */
export function snapshotProjectData() {
  return JSON.stringify({
    renovation: project.renovation || {},
    walls: project.walls || [],
    stairs: project.stairs || [],
  });
}

/**
 * Count records by status.
 * @returns {{ demolish: number, proposed: number, existing: number }}
 */
export function countRenovationStatuses() {
  let demolish = 0;
  let proposed = 0;
  let existing = 0;
  for (const record of Object.values(project.renovation || {})) {
    if (record?.status === 'demolish') demolish++;
    else if (record?.status === 'proposed') proposed++;
    else existing++;
  }
  return { demolish, proposed, existing };
}

/**
 * Access the baseModel field.
 * @param {string} [prop] - optional property key (e.g. 'fingerprint')
 * @param {*} [value] - if provided, set the property
 * @returns {*|void}
 */
export function baseModel(prop, value) {
  if (!project.baseModel) project.baseModel = {};
  if (prop === undefined) return project.baseModel;
  if (value === undefined) return project.baseModel[prop];
  project.baseModel[prop] = value;
  markModified();
}

/**
 * Get build/wall items from the placement sub-records.
 * @returns {Array}
 */
export function getBuildItems() {
  const items = [];
  for (const wall of project.walls || []) {
    if (wall.placement) items.push(wall.placement);
  }
  for (const stair of project.stairs || []) {
    if (stair.placement) items.push(stair.placement);
  }
  return items;
}

/**
 * Subscribe to project changes.
 * @param {() => void} fn
 * @returns {function()} unsubscribe
 */
export function subscribe(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}

// --- private helpers ---

function markModified() {
  project.project.updatedAt = new Date().toISOString();
  isModified = true;
  scheduleAutosave();
}

function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveToStorage, 500);
}

function saveToStorage() {
  if (!project) return;
  try {
    project.project.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    isModified = false;
    notifyListeners();
  } catch (error) {
    console.warn('ProjectStore autosave failed', error);
  }
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
    try { fn(); } catch {}
  }
}
