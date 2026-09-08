import { configDefaults, defineConfig } from 'vitest/config'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pakiet = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const commitShaBundle = (() => {
  const commitZeSrodowiska = process.env.GITHUB_SHA?.trim()
  if (commitZeSrodowiska && /^[a-f0-9]{40}$/i.test(commitZeSrodowiska)) return commitZeSrodowiska.toLowerCase()
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase()
  } catch {
    return 'nieznany'
  }
})()
const wersjaBundle = process.env.WEB_OTA_BUNDLE_VERSION?.trim() || commitShaBundle.slice(0, 7)

export default defineConfig({
  define: {
    __WERSJA_APLIKACJI__: JSON.stringify(pakiet.version),
    __WERSJA_BUNDLE__: JSON.stringify(wersjaBundle),
    __COMMIT_SHA_BUNDLE__: JSON.stringify(commitShaBundle),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'ikona-192.png', 'ikona-512.png'],
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
