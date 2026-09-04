import { configDefaults, defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pakiet = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  define: {
    __WERSJA_APLIKACJI__: JSON.stringify(pakiet.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'ikona-192.png', 'ikona-512.png'],
      manifest: {
        name: 'Ogarniacz',
        short_name: 'Ogarniacz',
        description: 'Prywatne centrum dowodzenia codziennym zyciem.',
        lang: 'pl',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f6f8',
        theme_color: '#175c52',
        icons: [
          { src: '/ikona-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/ikona-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/ikona-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
          handler: 'NetworkOnly',
        }],
      },
    }),
  ],
  test: {
    exclude: [...configDefaults.exclude, '**/.patch-backups/**', 'server/**'],
    environment: 'jsdom',
    setupFiles: ['./src/testy/konfiguracja.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/services/**/*.ts'],
    },
  },
})
