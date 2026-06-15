import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server / build for the standalone browser demo (index.html → src/demo/main.tsx).
// The extension is built separately via `npm run build:ext` (scripts/build-extension.mjs).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
});
