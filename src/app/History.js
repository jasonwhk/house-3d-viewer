/**
 * History — in-memory command/snapshot undo/redo for project state.
 *
 * M2: replaces reload-based undo. Restores semantic project data in place,
 * preserving navigation mode and camera context (no page reload).
 */

import {
  snapshotProjectData,
  replaceProjectData,
} from '../project/ProjectStore.js';

export class History {
  /**
   * @param {() => void} onRestore — called after every undo/redo so the caller
   *   can rebuild visual state (meshes, visibility, counts) and re-render.
   */
  constructor(onRestore = null) {
    this._onRestore = onRestore;
    this._past = [];
    this._future = [];
    this._max = 50;
  }

  /**
   * Record a command. Snapshot current state, clear redo stack, execute command,
   * then autosave (the command already mutated the project via the store).
   * @param {() => void} fn — the command function
   */
  record(fn) {
    this._past.push(snapshotProjectData());
    if (this._past.length > this._max) this._past.shift();
    this._future = [];
    fn();
  }

  /**
   * Undo the last recorded command.
   * @returns {boolean}
   */
  undo() {
    if (!this._past.length) return false;
    // Save current state onto the redo stack
    this._future.push(snapshotProjectData());
    const previous = this._past.pop();
    replaceProjectData(JSON.parse(previous));
    this._emitRestore();
    return true;
  }

  /**
   * Redo the most recently undone command.
   * @returns {boolean}
   */
  redo() {
    if (!this._future.length) return false;
    this._past.push(snapshotProjectData());
    const next = this._future.pop();
    replaceProjectData(JSON.parse(next));
    this._emitRestore();
    return true;
  }

  get canUndo() {
    return this._past.length > 0;
  }

  get canRedo() {
    return this._future.length > 0;
  }

  clear() {
    this._past = [];
    this._future = [];
  }

  _emitRestore() {
    if (this._onRestore) this._onRestore();
  }
}
