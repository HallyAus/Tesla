import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the static build works from any sub-path / file host.
export default defineConfig({
  base: './',
  plugins: [react()],
});
