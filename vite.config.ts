import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works under any GitHub Pages sub-path.
  base: './',
  plugins: [react()],
  server: { host: true, allowedHosts: true },
  build: {
    rollupOptions: {
      input: { planner: 'index.html', overlap: 'overlap/index.html' },
    },
  },
});
