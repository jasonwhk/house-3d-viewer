/**
 * History — simple command-based undo/redo tied to project state.
 *
 * For M1 this is lightweight. M2 will replace reload-based undo
 * and extend this with detailed semantic commands.
 */

export class History {
  /**
   * @param {() => object | string} snapshotFn — called to capture current state before each command
   */
  constructor(snapshotFn) {
    this._snapshotFn = snapshotFn;
    this._past = [];
    this._future = [];
    this._max = 50;
  }

  /**
   * Record a command. Pushes current snapshot, discards redo stack.
   * @param {function} fn — the command function to execute
   */
  record(fn) {
    this._push();
    this._future = [];
    fn();
  }

  /**
   * Undo last command.
   * @returns {boolean}
   */
  undo() {
    if (!this._past.length) return false;
    this._future.push(this._snapshotFn());
    const previous = this._past.pop();
    this._restore(previous);
    return true;
  }

  /**
   * Redo undone command.
   * @returns {boolean}
   */
  redo() {
    if (!this._future.length) return false;
    this._past.push(this._snapshotFn());
    const next = this._future.pop();
    this._restore(next);
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

  _push() {
    const snapshot = this._snapshotFn();
    this._past.push(snapshot);
    if (this._past.length > this._max) this._past.shift();
  }

  _restore(snapshot) {
    // Stub — M2 will implement full semantic restore
    if (typeof snapshot === 'string') {
      try {
        const parsed = JSON.parse(snapshot);
        if (parsed && typeof parsed === 'object') {
          globalThis.__RESTORED_STATE__ = parsed;
        }
      } catch {}
    }
  }
}
