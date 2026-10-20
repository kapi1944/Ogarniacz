import { beforeEach, expect, it, vi } from 'vitest'
import { utworzUslugePlikow } from './FileService'

const { zapisz, zapiszTymczasowo } = vi.hoisted(() => ({ zapisz: vi.fn(), zapiszTymczasowo: vi.fn() }))
vi.mock('./EksportPlikuAndroid', () => ({ eksportPlikuAndroid: { zapisz } }))
vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' }, Filesystem: { writeFile: zapiszTymczasowo } }))

const tekst = '{"naglowek":{"wersja":1},"szyfrogram":"test"}'
const plik = { text: async () => tekst } as Blob
beforeEach(() => vi.resetAllMocks())

it('zapisuje niezmieniony JSON przez SAF i czeka na wynik zamiast zapisywać Documents', async () => {
  let zakoncz!: (wynik: { status: 'zapisano'; uri: string }) => void
  zapisz.mockImplementation(() => new Promise((rozwiaz) => { zakoncz = rozwiaz }))
  const oczekiwanie = utworzUslugePlikow(true).zapiszZWynikiem('kopia.json', plik)
  await vi.waitFor(() => expect(zapisz).toHaveBeenCalledWith({ nazwa: 'kopia.json', tekst, typ: 'application/json' }))
  zakoncz({ status: 'zapisano', uri: 'content://dokumenty/kopia.json' })
  expect(await oczekiwanie).toEqual({ status: 'zapisano', uri: 'content://dokumenty/kopia.json' })
  expect(zapiszTymczasowo).not.toHaveBeenCalled()
})

it('zachowuje dotychczasowy eksport karty HTML z właściwym MIME', async () => {
  zapisz.mockResolvedValue({ status: 'zapisano', uri: 'content://dokumenty/karta.html' })
  expect(await utworzUslugePlikow(true).zapisz('karta.html', { type: 'text/html;charset=utf-8', text: async () => '<html>test</html>' } as Blob)).toBe(true)
  expect(zapisz).toHaveBeenCalledWith({ nazwa: 'karta.html', tekst: '<html>test</html>', typ: 'text/html' })
})

it('rozróżnia anulowanie od błędu i nie otwiera alternatywnego zapisu', async () => {
  zapisz.mockResolvedValue({ status: 'anulowano' })
  expect(await utworzUslugePlikow(true).zapiszZWynikiem('kopia.json', plik)).toEqual({ status: 'anulowano' })
  expect(await utworzUslugePlikow(true).zapisz('kopia.json', plik)).toBe(false)
  zapisz.mockRejectedValue(new Error('Odmowa dostępu'))
  expect(await utworzUslugePlikow(true).zapiszZWynikiem('kopia.json', plik)).toEqual({ status: 'blad' })
  expect(zapiszTymczasowo).not.toHaveBeenCalled()
})

it('przygotowuje osobny plik w cache dla każdego udostępnienia', async () => {
  zapiszTymczasowo.mockResolvedValue({ uri: 'file:///cache/eksport/test/kopia.json' })
  const usluga = utworzUslugePlikow(true)
  await usluga.zapiszTymczasowo('kopia.json', plik)
  await usluga.zapiszTymczasowo('kopia.json', plik)
  expect(zapiszTymczasowo.mock.calls[0][0]).toMatchObject({ data: tekst, directory: 'CACHE', encoding: 'utf8', recursive: true })
  expect(zapiszTymczasowo.mock.calls[0][0].path).toMatch(/^eksport\/[^/]+\/kopia.json$/)
  expect(zapiszTymczasowo.mock.calls[0][0].path).not.toBe(zapiszTymczasowo.mock.calls[1][0].path)
})

it('zwraca brak załącznika po błędzie zapisu cache', async () => {
  zapiszTymczasowo.mockRejectedValue(new Error('Brak miejsca'))
  expect(await utworzUslugePlikow(true).zapiszTymczasowo('kopia.json', plik)).toBeUndefined()
})

it('przekazuje do SAF dokładne binarne bajty bez konwersji na UTF-8', async () => {
  const bajty = Uint8Array.from([137, 80, 78, 71, 0, 255, 128, 10])
  zapisz.mockResolvedValue({ status: 'zapisano', uri: 'content://dokumenty/żółć.png' })
  const wynik = await utworzUslugePlikow(true).zapiszZWynikiem('żółć.png', new Blob([bajty], { type: 'image/png' }))
  expect(wynik.status).toBe('zapisano')
  expect(zapisz).toHaveBeenCalledWith({ nazwa: 'żółć.png', base64: 'iVBORwD/gAo=', typ: 'image/png' })
  expect(zapisz.mock.calls[0][0]).not.toHaveProperty('tekst')
})

it('przekazuje oryginalne ICO z właściwym MIME i nie ukrywa anulowania', async () => {
  zapisz.mockResolvedValue({ status: 'anulowano' })
  expect(await utworzUslugePlikow(true).zapiszZWynikiem('ikona.ico', new Blob([new Uint8Array([0, 0, 1, 0])], { type: 'image/x-icon' }))).toEqual({ status: 'anulowano' })
  expect(zapisz).toHaveBeenCalledWith({ nazwa: 'ikona.ico', base64: 'AAABAA==', typ: 'image/x-icon' })
})

it('w przeglądarce inicjuje natywne pobranie z oryginalną nazwą', async () => {
  vi.useFakeTimers()
  const utworz = vi.fn().mockReturnValue('blob:test')
  const zwolnij = vi.fn()
  vi.stubGlobal('URL', { createObjectURL: utworz, revokeObjectURL: zwolnij })
  const kliknij = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('mózg–żarówka.png')
    expect(this.href).toBe('blob:test')
    expect(this.isConnected).toBe(true)
  })
  try {
    const obraz = new Blob(['test'], { type: 'image/png' })
    expect(await utworzUslugePlikow(false).zapiszZWynikiem('mózg–żarówka.png', obraz)).toEqual({ status: 'pobieranie' })
    expect(utworz).toHaveBeenCalledWith(obraz)
    expect(kliknij).toHaveBeenCalledOnce()
    expect(zapisz).not.toHaveBeenCalled()
    expect(zwolnij).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(zwolnij).toHaveBeenCalledWith('blob:test')
  } finally { kliknij.mockRestore(); vi.unstubAllGlobals(); vi.useRealTimers() }
})
