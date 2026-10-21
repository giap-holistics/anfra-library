import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the page is served by Vite, with hot reload, and everything else goes to the
// host's server (server/main.ts), as one origin: the same routes production serves from one process.
const server = `http://127.0.0.1:${process.env.PORT ?? 8787}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': server, '/host': server, '/exports': server, '/health': server, '/mcp': server },
  },
  build: { outDir: 'dist/page', emptyOutDir: true },
});
