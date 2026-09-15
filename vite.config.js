import { defineConfig } from 'vite';
import { execSync } from 'child_process';

let commitHash = 'unknown';
try {
  commitHash = execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
} catch {}

export default defineConfig({
  base: '/house-3d-viewer/',
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
});
