import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizujOdebraneUdostepnienie, utworzUslugeUdostepniania } from './ShareService'

const { moznaUdostepnic, udostepnij, sprawdz } = vi.hoisted(() => ({ moznaUdostepnic: vi.fn(), udostepnij: vi.fn(), sprawdz: vi.fn() }))
vi.mock('@capacitor/share', () => ({ Share: { canShare: moznaUdostepnic, share: udostepnij } }))
vi.mock('./EksportPlikuAndroid', () => ({ eksportPlikuAndroid: { sprawdzZalacznik: sprawdz } }))

beforeEach(() => {
  vi.resetAllMocks()
  moznaUdostepnic.mockResolvedValue({ value: true })
  sprawdz.mockResolvedValue({ uri: 'content://pl.ogarniacz.app.fileprovider/cache/kopia.json', typ: 'application/json' })
  udostepnij.mockResolvedValue({ activityType: 'com.google.android.apps.docs' })
})

it('weryfikuje odczyt content URI i wysyła wyłącznie plik bez tekstu, tytułu i URL', async () => {
  const uri = 'file:///cache/eksport/test/kopia.json'
  expect(await utworzUslugeUdostepniania(true).udostepnijPlikJson(uri)).toBe('przekazano')
  expect(sprawdz).toHaveBeenCalledWith({ uri })
  expect(udostepnij).toHaveBeenCalledWith({ files: [uri], dialogTitle: 'Udostępnij backup Ogarniacza' })
  expect(sprawdz.mock.invocationCallOrder[0]).toBeLessThan(udostepnij.mock.invocationCallOrder[0])
})

it.each([
  { uri: 'file:///cache/kopia.json', typ: 'application/json' },
  { uri: 'content://cache/kopia.json', typ: 'text/plain' },
])('blokuje nieprawidłowy adres lub MIME: %j', async (dane) => {
  sprawdz.mockResolvedValue(dane)
  expect(await utworzUslugeUdostepniania(true).udostepnijPlikJson('file:///kopia.json')).toBe('blad')
  expect(udostepnij).not.toHaveBeenCalled()
})

it('blokuje udostępnianie po odmowie odczytu załącznika', async () => {
  sprawdz.mockRejectedValue(new Error('Brak odczytu'))
  expect(await utworzUslugeUdostepniania(true).udostepnijPlikJson('file:///kopia.json')).toBe('blad')
  expect(udostepnij).not.toHaveBeenCalled()
})

it('obsługuje brak aplikacji docelowej', async () => {
  moznaUdostepnic.mockResolvedValue({ value: false })
  expect(await utworzUslugeUdostepniania(true).udostepnijPlikJson('file:///kopia.json')).toBe('blad')
  expect(udostepnij).not.toHaveBeenCalled()
})

it.each([
  ['Share canceled', 'anulowano'],
  ['Permission denied', 'blad'],
])('rozróżnia odmowę i anulowanie: %s', async (komunikat, wynik) => {
  udostepnij.mockRejectedValue(new Error(komunikat))
  expect(await utworzUslugeUdostepniania(true).udostepnijPlikJson('file:///kopia.json')).toBe(wynik)
})

it('nie uznaje zamknięcia okna bez wskazanej aplikacji za przekazanie', async () => {
  udostepnij.mockResolvedValue({ activityType: '' })
  expect(await utworzUslugeUdostepniania(true).udostepnijPlikJson('file:///kopia.json')).toBe('niepotwierdzone')
})

describe('odbieranie udostępnionej treści', () => {
  it('przyjmuje tekst lub link z opcjonalnym tytułem', () => {
    expect(normalizujOdebraneUdostepnienie({ tekst: ' https://example.com/a ', tytul: ' Artykuł ' })).toEqual({
      tekst: 'https://example.com/a',
      tytul: 'Artykuł',
    })
  })

  it('odrzuca puste i niepoprawne dane', () => {
    expect(normalizujOdebraneUdostepnienie({ tekst: '   ' })).toBeNull()
    expect(normalizujOdebraneUdostepnienie({ tekst: 123 })).toBeNull()
  })
})
