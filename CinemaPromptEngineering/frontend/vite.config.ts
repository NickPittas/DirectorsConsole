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
      '/api': {
        target: 'http://localhost:9800',
        changeOrigin: true,
        // Do NOT rewrite — CPE backend routes include /api prefix for some endpoints
      },
    },
  },
});
