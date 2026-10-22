import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Built (`pnpm build`), the page is embedded in the anfra binary in place of anfra's own appserve
// pages (../flake.nix), and `anfra serve` serves its files below /appserve/. Under `vite` it is served
// at the root with hot reload, and everything else goes to a running `anfra serve` (ANFRA_SERVE_URL,
// else the default address), started with ANFRA_APPSERVE_DEV_URL=http://localhost:5173 so that it
// redirects its pages here.
const anfra = process.env.ANFRA_SERVE_URL || 'http://127.0.0.1:7878';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/appserve/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': anfra, '/appserve': anfra, '/health': anfra },
  },
  build: { outDir: 'dist/page', emptyOutDir: true },
}));
