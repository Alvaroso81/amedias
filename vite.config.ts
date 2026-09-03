import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const appBase = '/amedias/'

// https://vite.dev/config/
export default defineConfig({
  base: appBase,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        id: appBase,
        name: 'Amedias',
        short_name: 'Amedias',
        description: 'Gastos comunes y personales, siempre en equilibrio.',
        lang: 'es',
        start_url: appBase,
        scope: appBase,
        display: 'standalone',
        display_override: ['standalone'],
        theme_color: '#376e5a',
        background_color: '#f3f6f4',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{html,js,css,png,svg,ico,woff,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
