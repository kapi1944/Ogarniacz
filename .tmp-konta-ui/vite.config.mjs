import konfiguracja from '../vite.config.ts'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
export default { ...konfiguracja, plugins: [...konfiguracja.plugins, { name: 'makieta-kont', configureServer(serwer) {
  serwer.middlewares.use(async (zadanie, odpowiedz, dalej) => {
    if (!['/', '/ustawienia', '/ustawienia/konta'].includes(zadanie.url?.split('?')[0])) return dalej()
    const html = await readFile(new URL('./index.html', import.meta.url), 'utf8')
    odpowiedz.setHeader('content-type', 'text/html')
    odpowiedz.end(await serwer.transformIndexHtml(zadanie.url, html))
  })
} }], resolve: { alias: { '@capacitor/core': fileURLToPath(new URL('./core-mock.mjs', import.meta.url)) } } }
