/**
 * Serialization helpers — download and upload project JSON.
 */

import { validateProject, createEmptyProject, CURRENT_SCHEMA_VERSION, computeFingerprint } from './schema.js';

/**
 * Export the current project as a formatted JSON string.
 * @param {object} project
 * @returns {string}
 */
export function serializeProject(project) {
  return JSON.stringify(project, null, 2);
}

/**
 * Parse and validate a project JSON string.
 * @param {string} jsonString
 * @returns {{ valid: boolean, data?: object, errors?: string[] }}
 */
export function deserializeProject(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return { valid: false, errors: ['Invalid JSON'] };
  }

  const validation = validateProject(data);
  if (!validation.valid) {
    return { valid: false, errors: validation.errors };
  }

  if (data.schemaVersion < CURRENT_SCHEMA_VERSION) {
    // Accept older versions with a warning — migrations can be added later
    console.warn(
      `Loading project with schema version ${data.schemaVersion}, current is ${CURRENT_SCHEMA_VERSION}. Unknown fields may be ignored.`
    );
  }

  if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { valid: false, errors: [`Schema version ${data.schemaVersion} is newer than this viewer supports`] };
  }

  return { valid: true, data };
}

/**
 * Download project JSON as a file.
 * @param {string} projectName
 * @param {object} project
 */
export function downloadProject(projectName, project) {
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (projectName || 'house').replace(/[^a-zA-Z0-9_-]/g, '_');
  const date = new Date();
  const dateStr = date.getFullYear() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0') + '-' +
    String(date.getHours()).padStart(2, '0') +
    String(date.getMinutes()).padStart(2, '0');
  a.download = `house-renovation-${safeName}-${dateStr}.json`;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Create a file input for uploading project JSON.
 * @param {(project: object) => void} onLoad callback when a valid project is loaded
 * @param {({ valid: boolean, errors?: string[] }) => void} [onError] callback for validation errors
 * @returns {HTMLInputElement}
 */
export function createUploadInput(onLoad, onError) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = deserializeProject(reader.result);
      if (result.valid) {
        onLoad(result.data);
      } else {
        if (onError) onError(result);
        console.error('Project load failed:', result.errors);
      }
    };
    reader.onerror = () => {
      if (onError) onError({ valid: false, errors: ['Could not read file'] });
    };
    reader.readAsText(file);
  });

  document.body.appendChild(input);
  return input;
}



/**
 * Trigger upload dialog. Call after creating the input.
 */
export function triggerUpload(input) {
  input.click();
}
