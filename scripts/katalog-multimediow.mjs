import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const katalogRepozytorium = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sciezkaKatalogu = resolve(katalogRepozytorium, 'multimedia/katalog.json')
const czySprawdzenie = process.argv.includes('--sprawdz')
const poprzedni = JSON.parse(await readFile(sciezkaKatalogu, 'utf8'))

async function znajdzPliki(katalog) {
  const pliki = []
  for (const wpis of await readdir(resolve(katalogRepozytorium, katalog), { withFileTypes: true })) {
    const sciezka = `${katalog}/${wpis.name}`
    if (wpis.isDirectory()) pliki.push(...await znajdzPliki(sciezka))
    else if (wpis.isFile() && !['.md', '.json'].includes(extname(wpis.name)) && !wpis.name.startsWith('.')) pliki.push(sciezka)
  }
  return pliki
}

function parametryObrazu(dane, rozszerzenie) {
  const png = (bajty) => bajty.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  if (rozszerzenie === '.png') {
    if (!png(dane) || dane.length < 33 || dane.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Nieprawidłowy PNG')
    return { mime: 'image/png', rozdzielczosc: { szerokosc: dane.readUInt32BE(16), wysokosc: dane.readUInt32BE(20) }, walidacja: { status: 'poprawny', uwagi: [] } }
  }
  if (rozszerzenie === '.ico') {
    if (dane.length < 22 || dane.readUInt16LE(0) !== 0 || dane.readUInt16LE(2) !== 1) throw new Error('Nieprawidłowy ICO')
    const liczba = dane.readUInt16LE(4)
    if (!liczba || 6 + liczba * 16 > dane.length) throw new Error('Nieprawidłowa tabela ICO')
    const klatki = []
    let niezgodnosc = false
    for (let indeks = 0; indeks < liczba; indeks++) {
      const poczatek = 6 + indeks * 16
      const dlugosc = dane.readUInt32LE(poczatek + 8)
      const offset = dane.readUInt32LE(poczatek + 12)
      if (offset < 6 + liczba * 16 || offset + dlugosc > dane.length || dlugosc < 8) throw new Error('Nieprawidłowa klatka ICO')
      const szerokosc = dane[poczatek] || 256
      const wysokosc = dane[poczatek + 1] || 256
      const obraz = dane.subarray(offset, offset + dlugosc)
      const rozmiar = png(obraz) ? parametryObrazu(obraz, '.png').rozdzielczosc : { szerokosc, wysokosc }
      niezgodnosc ||= rozmiar.szerokosc !== szerokosc || rozmiar.wysokosc !== wysokosc
      klatki.push(rozmiar)
    }
    const rozdzielczosc = klatki.sort((a, b) => b.szerokosc - a.szerokosc)[0]
    return { mime: 'image/x-icon', rozdzielczosc, walidacja: { status: niezgodnosc ? 'ostrzezenie' : 'poprawny', uwagi: niezgodnosc ? ['Wymiary obrazu nie zgadzają się z nagłówkiem ICO. Plik archiwalny, nie używać jako ikony produkcyjnej.'] : [] } }
  }
  return { mime: 'application/octet-stream', rozdzielczosc: null, walidacja: { status: 'ostrzezenie', uwagi: ['Format wymaga ręcznej weryfikacji przed publikacją.'] } }
}

const sciezki = [...await znajdzPliki('assets/branding'), ...await znajdzPliki('multimedia')]
const wedlugHasha = new Map()
const materialy = []
for (const sciezka of sciezki.sort((a, b) => a < b ? -1 : a > b ? 1 : 0)) {
  const dane = await readFile(resolve(katalogRepozytorium, sciezka))
  const sha256 = createHash('sha256').update(dane).digest('hex')
  if (wedlugHasha.has(sha256)) {
    wedlugHasha.get(sha256).duplikatyLokalne.push(sciezka)
    continue
  }
  const znany = poprzedni.materialy.find((material) => material.sciezka === sciezka)
  const material = {
    id: `material-${sha256.slice(0, 16)}`, nazwa: sciezka.split('/').at(-1),
    opis: 'Materiał oczekujący na klasyfikację.', kategoria: 'Do klasyfikacji', status: 'ROBOCZE',
    przeznaczenie: 'Wymaga klasyfikacji przez opiekuna projektu.', wykorzystanie: [], wymagaKlasyfikacji: true,
    ...znany, sciezka, ...parametryObrazu(dane, extname(sciezka).toLowerCase()),
    rozmiarBajtow: dane.length, sha256, duplikatyLokalne: [],
  }
  wedlugHasha.set(sha256, material)
  materialy.push(material)
}
// Brak ignorowanego duplikatu w świeżym checkout nie usuwa udokumentowanej referencji.
for (const material of materialy) {
  const znany = poprzedni.materialy.find((wpis) => wpis.sciezka === material.sciezka)
  material.duplikatyLokalne = [...new Set([...(znany?.duplikatyLokalne ?? []), ...material.duplikatyLokalne])].sort()
}
const wynik = `${JSON.stringify({ format: 'ogarniacz-multimedia', wersja: 1, materialy }, null, 2)}\n`
if (czySprawdzenie) {
  if (wynik !== await readFile(sciezkaKatalogu, 'utf8')) throw new Error('Katalog jest nieaktualny. Uruchom node scripts/katalog-multimediow.mjs i sprawdź klasyfikację.')
  console.log(`Poprawny katalog: ${materialy.length} materiałów; rozmiary, formaty i SHA-256 zgodne.`)
} else {
  await writeFile(sciezkaKatalogu, wynik)
  console.log(`Zaktualizowano ${relative(katalogRepozytorium, sciezkaKatalogu)}. Sprawdź klasyfikację i prywatność nowych plików przed commitem.`)
}
