import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const przegladarka = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(existsSync)

for (const motyw of ['jasny', 'ciemny']) {
  for (const systemCiemny of [false, true]) {
    test(`kontrast pól: motyw ${motyw}, Chrome ${systemCiemny ? 'wymuszony ciemny' : 'domyślny'}`, () => {
      assert.ok(przegladarka, 'Ustaw CHROME_PATH na ścieżkę przeglądarki Chrome lub Chromium.')
      const katalog = mkdtempSync(join(tmpdir(), 'ogarniacz-kontrast-'))
      try {
        const css = readFileSync(resolve('src/styles/glowny.css'), 'utf8')
        const html = `<!doctype html><html data-motyw="${motyw}" data-platforma="android"><style>${css}</style><body>
          <label class="pole"><input type="date" value="2026-10-29"><input type="time" value="12:30"><input type="datetime-local" value="2026-10-29T12:30"><input type="month" value="2026-10"><input type="text" value="Tekst"><textarea>Tekst</textarea><select><option>Opcja</option><optgroup label="Grupa"><option>Druga</option></optgroup></select></label>
          <script>
          const jasnosc = (kolor) => {
            const skladowe = kolor.match(/[\\d.]+/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 });
            return skladowe[0] * .2126 + skladowe[1] * .7152 + skladowe[2] * .0722;
          };
          const wyniki = [...document.querySelectorAll('input, textarea, select, option, optgroup')].map((pole) => {
            const styl = getComputedStyle(pole), a = jasnosc(styl.color), b = jasnosc(styl.backgroundColor);
            return { pole: pole.tagName + (pole.type || ''), kontrast: (Math.max(a,b) + .05) / (Math.min(a,b) + .05), schemat: styl.colorScheme };
          });
          document.body.setAttribute('data-wyniki', JSON.stringify(wyniki));
          </script></body></html>`
        const plik = join(katalog, 'test.html')
        writeFileSync(plik, html)
        const wynik = spawnSync(przegladarka, ['--headless', '--disable-gpu', '--no-sandbox', ...(systemCiemny ? ['--force-dark-mode'] : []), '--dump-dom', new URL(`file:///${plik.replaceAll('\\', '/')}`).href], { encoding: 'utf8', timeout: 30000 })
        assert.equal(wynik.status, 0, wynik.stderr)
        const dane = wynik.stdout.match(/data-wyniki="([^"]+)"/)
        assert.ok(dane, wynik.stderr)
        const wyniki = JSON.parse(dane[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
        for (const pole of wyniki) {
          assert.ok(pole.kontrast >= 4.5, `${pole.pole}: kontrast ${pole.kontrast}`)
          assert.equal(pole.schemat, motyw === 'ciemny' ? 'dark' : 'light', pole.pole)
        }
      } finally {
        const plik = join(katalog, 'test.html')
        if (existsSync(plik)) unlinkSync(plik)
        rmdirSync(katalog)
      }
    })
  }
}
