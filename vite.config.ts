import { configDefaults, defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pakiet = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
export default defineConfig({
  server: {
    watch: {
      ignored: ['**/android/build/**', '**/android/app/build/**'],
    },
  },
  define: {
    __WERSJA_APLIKACJI__: JSON.stringify(pakiet.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'ikona-192.png', 'ikona-512.png'],
      manifest: {
        name: 'Ogarniacz',
        short_name: 'Ogarniacz',
        description: 'Prywatne centrum dowodzenia codziennym zyciem.',
        lang: 'pl',
        id: '/',
        scope: '/',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f6f8',
        theme_color: '#4f7a32',
        icons: [
          { src: '/ikona-192.png?branding=pro-1', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/ikona-512.png?branding=pro-1', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^branding$/],
        importScripts: ['/powiadomienia-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/health\/?$/],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.startsWith('/api/') || url.pathname === '/health' || url.pathname === '/health/',
          handler: 'NetworkOnly',
        }],
      },
    }),
  ],
  test: {
    exclude: [...configDefaults.exclude, '**/.patch-backups/**', 'server/**', 'scripts/**/*.test.mjs'],
    environment: 'jsdom',
    setupFiles: ['./src/testy/konfiguracja.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/services/**/*.ts'],
    },
  },
})
