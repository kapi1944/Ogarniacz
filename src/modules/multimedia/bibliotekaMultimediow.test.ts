// @ts-expect-error Test korzysta z Node; aplikacja celowo nie dołącza globalnych typów Node.
import { createHash } from 'node:crypto'
// @ts-expect-error Odczyt plików jest używany wyłącznie w teście katalogu.
import { readFileSync } from 'node:fs'
// @ts-expect-error Ścieżki Node są używane wyłącznie w testach.
import { resolve } from 'node:path'
// @ts-expect-error Bufor Node jest używany wyłącznie do niezależnego porównania bajtów.
import { Buffer as BuforWezla } from 'node:buffer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  adresKatalogu, adresMaterialu, filtrujMaterialy, odczytajZapamietanyKatalog, parsujKatalog, pobierzKatalog, pobierzOryginal,
} from './bibliotekaMultimediow'

const katalog = JSON.parse(readFileSync(resolve('multimedia/katalog.json'), 'utf8'))
const material = katalog.materialy[0]
beforeEach(() => localStorage.clear())
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('sprawdza rzeczywiste pliki, unikalność i SHA-256 całego opublikowanego katalogu', () => {
  const poprawny = parsujKatalog(katalog)
  expect(poprawny.materialy.length).toBeGreaterThanOrEqual(2)
  for (const wpis of poprawny.materialy) {
    const bajty = readFileSync(resolve(wpis.sciezka))
    expect(bajty.length).toBe(wpis.rozmiarBajtow)
    expect(createHash('sha256').update(bajty).digest('hex')).toBe(wpis.sha256)
    expect(adresMaterialu(wpis.sciezka)).not.toMatch(/[ żółć–]/)
  }
})

it('koduje polskie nazwy i odrzuca ścieżki wychodzące poza zasoby', () => {
  expect(adresMaterialu('multimedia/żółć #1.png')).toBe('https://raw.githubusercontent.com/kapi1944/Ogarniacz/main/multimedia/%C5%BC%C3%B3%C5%82%C4%87%20%231.png')
  for (const sciezka of ['multimedia/../.env', 'multimedia//plik.png', 'https://przyklad.pl/plik.png', '/multimedia/a.png', 'multimedia/a\\b.png']) {
    expect(() => adresMaterialu(sciezka)).toThrow()
    expect(() => parsujKatalog({ ...katalog, materialy: [{ ...material, sciezka }] })).toThrow()
  }
  expect(() => parsujKatalog({ ...katalog, materialy: [{ ...material, sciezkaPodgladu: 'public/plik.svg' }] })).toThrow()
  expect(() => parsujKatalog({ ...katalog, materialy: [material, material] })).toThrow()
  expect(() => parsujKatalog({ ...katalog, wersja: 2 })).toThrow()
})

it('pobiera bez uwierzytelnienia, zapamiętuje tylko poprawny katalog i zachowuje go przy błędzie', async () => {
  const pobieranie = vi.fn().mockResolvedValue(new Response(JSON.stringify(katalog)))
  vi.stubGlobal('fetch', pobieranie)
  const wynik = await pobierzKatalog()
  expect(wynik.zapamietano).toBe(true)
  expect(pobieranie).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${adresKatalogu.replaceAll('.', '\\.')}\\?odswiezenie=\\d+$`)), expect.objectContaining({ cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' }))
  const zapamietany = odczytajZapamietanyKatalog()
  pobieranie.mockResolvedValueOnce(new Response('{"prywatne":"niedozwolone"}'))
  await expect(pobierzKatalog()).rejects.toThrow('format')
  expect(odczytajZapamietanyKatalog()).toEqual(zapamietany)
  pobieranie.mockResolvedValueOnce(new Response('', { status: 503 }))
  await expect(pobierzKatalog()).rejects.toThrow('503')
  expect(odczytajZapamietanyKatalog()).toEqual(zapamietany)
})

it('odświeżenie odkrywa nowy materiał bez aktualizacji aplikacji i obsługuje pustą listę', async () => {
  const nowy = { ...material, id: 'nowy', sciezka: 'multimedia/nowy.png' }
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(katalog)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...katalog, materialy: [...katalog.materialy, nowy] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...katalog, materialy: [] }))))
  expect((await pobierzKatalog()).katalog.materialy).toHaveLength(katalog.materialy.length)
  expect((await pobierzKatalog()).katalog.materialy).toHaveLength(katalog.materialy.length + 1)
  expect((await pobierzKatalog()).katalog.materialy).toEqual([])
  expect(odczytajZapamietanyKatalog()?.katalog.materialy).toEqual([])
})

it('działa online bez dostępu do localStorage i odrzuca uszkodzoną pamięć', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('uszkodzony JSON')
  expect(odczytajZapamietanyKatalog()).toBeUndefined()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Brak miejsca') })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(katalog))))
  expect((await pobierzKatalog()).zapamietano).toBe(false)
})

it('ogranicza odpowiedź także wtedy, gdy serwer nie podaje content-length', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('a'.repeat(2 * 1024 * 1024 + 1))))
  await expect(pobierzKatalog()).rejects.toThrow('rozmiar')
  expect(odczytajZapamietanyKatalog()).toBeUndefined()
})

it('przerywa pobieranie po sygnale z widoku', async () => {
  const kontroler = new AbortController()
  vi.stubGlobal('fetch', vi.fn((_adres, opcje) => new Promise((_rozwiaz, odrzuc) => {
    opcje.signal.addEventListener('abort', () => odrzuc(new DOMException('Przerwano', 'AbortError')))
  })))
  const obietnica = pobierzKatalog(kontroler.signal)
  kontroler.abort()
  await expect(obietnica).rejects.toThrow('Przerwano')
  expect(odczytajZapamietanyKatalog()).toBeUndefined()
})

it('pobiera dokładne bajty PNG i ICO i blokuje zmieniony oryginał', async () => {
  const pobieranie = vi.fn()
  vi.stubGlobal('fetch', pobieranie)
  for (const wpis of parsujKatalog(katalog).materialy.filter((wpis) => wpis.status === 'OFICJALNE')) {
    const bajty = readFileSync(resolve(wpis.sciezka))
    pobieranie.mockResolvedValueOnce(new Response(bajty))
    const plik = await pobierzOryginal(wpis)
    expect(plik.type).toBe(wpis.mime)
    expect(plik.size).toBe(bajty.length)
    const czytnik = new FileReader()
    const odczyt = new Promise<ArrayBuffer>((rozwiaz) => { czytnik.onload = () => rozwiaz(czytnik.result as ArrayBuffer) })
    czytnik.readAsArrayBuffer(plik)
    expect(BuforWezla.from(await odczyt)).toEqual(bajty)
    pobieranie.mockResolvedValueOnce(new Response(BuforWezla.alloc(bajty.length)))
    await expect(pobierzOryginal(wpis)).rejects.toThrow('nie zgadza się')
  }
}, 15_000)

it('łączy wyszukiwanie polskich nazw, kategorię i status', () => {
  const materialy = parsujKatalog(katalog).materialy
  expect(filtrujMaterialy(materialy, 'ŻARÓWKA', 'Ikony', 'OFICJALNE')).toHaveLength(1)
  expect(filtrujMaterialy(materialy, '', 'Ikony', 'ARCHIWALNE')).toHaveLength(2)
  expect(filtrujMaterialy(materialy, 'nieistniejący', '', '')).toEqual([])
})
