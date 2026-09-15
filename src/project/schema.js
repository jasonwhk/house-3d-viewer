/**
 * Canonical project schema definitions.
 *
 * Versioned JSON schema for the house-3d-viewer project state.
 * All IDs are stable string identifiers; no Three.js UUIDs.
 */

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Expected top-level shape of a project JSON:
 * {
 *   schemaVersion: number,
 *   project: { id, name, createdAt, updatedAt },
 *   baseModel: { asset, fingerprint, units, upAxis },
 *   floors: FloorRecord[],
 *   joints: JointRecord[],
 *   walls: WallRecord[],
 *   surfaces: SurfaceRecord[],
 *   openings: OpeningRecord[],
 *   stairs: StairRecord[],
 *   devices: DeviceRecord[],
 *   routes: RouteRecord[],
 *   renovation: Record<string, RenovationEntry>,
 *   measurements: MeasurementRecord[],
 *   view: ViewRecord
 * }
 *
 * Floor records and geometric data are added iteratively.
 * For M1 we only populate renovation, build items, and basic view data.
 */

export function createEmptyProject() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    project: {
      id: nanoid(),
      name: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    baseModel: {
      asset: 'house-existing.glb.dat',
      fingerprint: null,
      units: 'm',
      upAxis: 'Y',
    },
    floors: [],
    joints: [],
    walls: [],
    surfaces: [],
    openings: [],
    stairs: [],
    devices: [],
    routes: [],
    renovation: {},
    measurements: [],
    view: {},
  };
}

/**
 * Validate a parsed project JSON against the current schema.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 */
export function validateProject(data) {
  const errors = [];

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Root must be an object'] };
  }

  if (data.schemaVersion === undefined) {
    errors.push('Missing schemaVersion');
  } else if (typeof data.schemaVersion !== 'number') {
    errors.push('schemaVersion must be a number');
  } else if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    errors.push(
      `Schema version ${data.schemaVersion} is newer than supported ${CURRENT_SCHEMA_VERSION}`
    );
  }

  if (data.project) {
    if (typeof data.project !== 'object') errors.push('project must be an object');
  } else {
    errors.push('Missing project object');
  }

  if (data.baseModel) {
    if (typeof data.baseModel !== 'object') errors.push('baseModel must be an object');
    if (data.baseModel.units && data.baseModel.units !== 'm') {
      errors.push(`Unsupported units: ${data.baseModel.units} (expected "m")`);
    }
  }

  // Arrays must be arrays or absent
  for (const key of [
    'floors',
    'joints',
    'walls',
    'surfaces',
    'openings',
    'stairs',
    'devices',
    'routes',
    'measurements',
  ]) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      errors.push(`${key} must be an array`);
    }
  }

  // renovation: object or absent
  if (data.renovation !== undefined) {
    if (typeof data.renovation !== 'object' || data.renovation === null || Array.isArray(data.renovation)) {
      errors.push('renovation must be an object');
    }
  }

  // view: object or absent
  if (data.view !== undefined) {
    if (typeof data.view !== 'object' || data.view === null) {
      errors.push('view must be an object');
    }
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

/**
 * Migrate old localStorage format into project schema where possible.
 *
 * @param {Record<string, { status?: string, discipline?: string, note?: string }>} oldRenovationData
 * @param {Array} oldBuildItems
 * @returns {object} Partial project state ready for merging
 */
export function migrateFromLocalStorage(oldRenovationData, oldBuildItems = []) {
  const renovation = {};
  for (const [key, entry] of Object.entries(oldRenovationData || {})) {
    renovation[key] = {
      status: entry.status || 'existing',
      discipline: entry.discipline || 'architecture',
      note: entry.note || '',
    };
  }

  const stairs = [];
  const walls = [];
  for (const item of oldBuildItems || []) {
    if (item.type === 'wall') {
      walls.push({
        id: item.id || nanoid(),
        startJointId: null,
        endJointId: null,
        baseY: item.baseY ?? 0,
        height: item.height || 2.5,
        thickness: item.thickness || 0.12,
        placement: item,
      });
    } else if (item.type === 'stairs') {
      stairs.push({
        id: item.id || nanoid(),
        startJointId: null,
        endJointId: null,
        baseY: item.baseY ?? 0,
        topY: item.topY ?? 0,
        width: item.width || 0.9,
        steps: item.steps || [],
        placement: item,
      });
    }
  }

  return { renovation, walls, stairs };
}

/**
 * Simple deterministic ID generator (not cryptographic).
 * Collisions are extremely unlikely; for M1 this is sufficient.
 */
function nanoid() {
  return Date.now().toString(36) +Math.random().toString(36).slice(2, 9);
}
