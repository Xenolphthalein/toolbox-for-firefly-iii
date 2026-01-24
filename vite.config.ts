import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { visualizer } from 'rollup-plugin-visualizer';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    // Only use autoImport in production for tree-shaking
    // In dev, we load all components via dynamic import in main.ts
    vuetify({ autoImport: mode === 'production' }),
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
    }),
  ],
  define: {
    // Ensure dead code elimination works for dev-only imports
    __DEV__: mode !== 'production',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/client', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Split Vuetify (tree-shaken, only used components)
            if (id.includes('vuetify')) {
              return 'vuetify-vendor';
            }
            // Split Vue and its ecosystem into one chunk to avoid circular deps
            if (
              id.includes('/vue/') ||
              id.includes('/@vue/') ||
              id.includes('/pinia/') ||
              id.includes('/vue-router/') ||
              id.includes('/vue-demi/') ||
              id.includes('/@mdi/js')
            ) {
              return 'vue-vendor';
            }
            // Don't split remaining vendors - let Rollup handle them naturally
            // This avoids circular dependency issues
          }
        },
      },
    },
  },
}));
