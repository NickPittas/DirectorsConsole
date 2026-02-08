import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Build mode: 'standalone' for installer, 'comfyui' for ComfyUI extension
const BUILD_MODE = process.env.BUILD_MODE || 'comfyui';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './', // Important for relative paths in both modes
  build: {
    // Output to different directories based on build mode
    outDir: BUILD_MODE === 'standalone' 
      ? '../dist/static'  // For standalone installer
      : '../ComfyCinemaPrompting/web/app',  // For ComfyUI
    emptyOutDir: true,
    // Optimize for production
    minify: 'terser',
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy all CPE backend route prefixes to the backend server.
      // In production the frontend is served by the same origin so no proxy is needed.
      // These entries are ONLY used by the Vite dev server during development.
      '/api': { target: 'http://localhost:9800', changeOrigin: true },
      '/enums': { target: 'http://localhost:9800', changeOrigin: true },
      '/validate': { target: 'http://localhost:9800', changeOrigin: true },
      '/generate-prompt': { target: 'http://localhost:9800', changeOrigin: true },
      '/options': { target: 'http://localhost:9800', changeOrigin: true },
      '/cameras': { target: 'http://localhost:9800', changeOrigin: true },
      '/film-stocks': { target: 'http://localhost:9800', changeOrigin: true },
      '/aspect-ratios': { target: 'http://localhost:9800', changeOrigin: true },
      '/lenses': { target: 'http://localhost:9800', changeOrigin: true },
      '/preset': { target: 'http://localhost:9800', changeOrigin: true },
      '/presets': { target: 'http://localhost:9800', changeOrigin: true },
      '/apply-preset': { target: 'http://localhost:9800', changeOrigin: true },
      '/settings': { target: 'http://localhost:9800', changeOrigin: true },
      '/credentials': { target: 'http://localhost:9800', changeOrigin: true },
    },
  },
});
