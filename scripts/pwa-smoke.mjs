import { spawn } from 'node:child_process'

const PORT = 4178
const ADRES = `http://127.0.0.1:${PORT}`
const SCIEZKI = ['/', '/zadania?element=testowy-rekord', '/ustawienia', '/echo']

function zapewnij(warunek, komunikat) {
  if (!warunek) throw new Error(komunikat)
}

async function oczekujNaSerwer() {
  for (let proba = 0; proba < 40; proba += 1) {
    try {
      const odpowiedz = await fetch(ADRES)
      if (odpowiedz.ok) return
    } catch {
      // Serwer może jeszcze rozpoczynać nasłuchiwanie.
    }
    await new Promise((rozwiaz) => setTimeout(rozwiaz, 100))
  }
  throw new Error('Serwer podglądu PWA nie uruchomił się na czas.')
}

const serwer = spawn(process.execPath, [
  'node_modules/vite/bin/vite.js',
  'preview',
  '--host', '127.0.0.1',
  '--port', String(PORT),
  '--strictPort',
], { stdio: 'ignore' })

try {
  await oczekujNaSerwer()
  for (const sciezka of SCIEZKI) {
    const odpowiedz = await fetch(`${ADRES}${sciezka}`, { redirect: 'manual' })
    const html = await odpowiedz.text()
    zapewnij(odpowiedz.ok, `Trasa ${sciezka} zwróciła HTTP ${odpowiedz.status}.`)
    zapewnij(html.includes('<div id="root"></div>'), `Trasa ${sciezka} nie użyła fallbacku aplikacji.`)
  }

  const manifest = await fetch(`${ADRES}/manifest.webmanifest`).then((odpowiedz) => odpowiedz.json())
  zapewnij(manifest.name === 'Ogarniacz', 'Manifest ma niepoprawną nazwę.')
  zapewnij(manifest.start_url === '/' && manifest.scope === '/', 'Manifest ma niepoprawny start_url lub scope.')
  zapewnij(Array.isArray(manifest.icons) && manifest.icons.some((ikona) => ikona.sizes === '512x512'), 'Manifest nie zawiera ikony 512x512.')

  const serviceWorker = await fetch(`${ADRES}/sw.js`).then((odpowiedz) => odpowiedz.text())
  zapewnij(serviceWorker.includes('NetworkOnly'), 'Service worker nie wymusza dostępu sieciowego dla API.')
  zapewnij(serviceWorker.includes('/api/'), 'Service worker nie zawiera reguły wykluczającej cache API.')
  console.log('PWA smoke: routing, manifest i service worker — OK')
} finally {
  serwer.kill()
}
