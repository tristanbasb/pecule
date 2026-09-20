import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { peculeApi } from './server/api.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), peculeApi()],
  server: { port: 5180 },
  preview: { port: 5180 },
  // Application locale chargée une seule fois : un seul fichier JS est plus simple qu'un découpage.
  build: { chunkSizeWarningLimit: 900 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
