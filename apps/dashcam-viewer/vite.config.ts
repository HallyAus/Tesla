import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the static build works from any sub-path / file host.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // MapLibre is lazy-loaded (see components/RouteMap.tsx); isolate it (and
    // React) into their own chunks so the initial entry bundle stays small
    // (~42 kB). The MapLibre vendor chunk is itself large but is only fetched
    // on demand for located events, so we raise the size-warning threshold —
    // it would otherwise warn on an off-critical-path vendor chunk we cannot
    // split further.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
