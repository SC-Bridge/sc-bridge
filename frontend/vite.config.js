import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [svgr(), react()],
  // Version-skew guard: must match the id the worker reports on /api/status.
  // CI provides GITHUB_SHA to this build and passes the same value to
  // `wrangler deploy --var BUILD_ID:…`; local dev gets "dev" (guard inert).
  define: {
    __BUILD_ID__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 12)),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI libraries
          'vendor-ui': ['lucide-react', 'react-markdown'],
        },
      },
    },
  },
})
