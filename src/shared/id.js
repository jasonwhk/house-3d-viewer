/**
 * Shared ID generation — the single source of unique IDs for project records.
 *
 * Format: <prefix>_<sessionCounter base36>_<timestamp base36>_<random base36>
 * The timestamp + random suffix makes cross-session collisions effectively
 * impossible, while the session counter keeps IDs ordering-stable locally.
 */
let counter = 0;

export function nextId(prefix = 'id') {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${counter.toString(36)}_${Date.now().toString(36)}_${rand}`;
}
