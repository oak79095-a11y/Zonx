import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Render serves the SPA from the domain root. GitHub Pages sets this explicitly in deploy.
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
    devSourcemap: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5199',
      '/uploads': 'http://localhost:5199',
      '/ws': { target: 'ws://localhost:5199', ws: true },
    },
  },
  build: {
    target: 'esnext',
    cssCodeSplit: true,
  },
})
