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
