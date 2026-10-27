import { beforeEach, expect, it, vi } from 'vitest'
const { sprawdzApk, sprawdzWeb, nasluchuj } = vi.hoisted(() => ({
  sprawdzApk: vi.fn().mockResolvedValue({ czyNowsza: false }),
  sprawdzWeb: vi.fn(),
  nasluchuj: vi.fn().mockResolvedValue(() => undefined),
}))
vi.mock('../platform/platforma', () => ({ platforma: {
  natywna: true,
  aktualizacje: { skonfigurowane: () => true, sprawdz: sprawdzApk },
  aktualizacjeWeb: { skonfigurowane: () => true, sprawdz: sprawdzWeb },
  cyklZycia: { nasluchuj },
} }))
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); localStorage.clear() })
it('ręczna kontrola sprawdza tylko APK', async () => {
  const kontrola = await import('./KontrolaAktualizacjiAplikacji')
  await kontrola.sprawdzAktualizacjeTeraz()
  expect(sprawdzApk).toHaveBeenCalledTimes(1)
  expect(sprawdzWeb).not.toHaveBeenCalled()
})
it('start i wznowienie aplikacji sprawdzają tylko APK', async () => {
  const kontrola = await import('./KontrolaAktualizacjiAplikacji')
  await kontrola.inicjalizujKontroleAktualizacjiAplikacji()
  await vi.waitFor(() => expect(kontrola.pobierzStanKontroliAktualizacji().sprawdzono).toBe(true))
  localStorage.clear()
  nasluchuj.mock.calls[0][0]('aktywny')
  expect(sprawdzApk).toHaveBeenCalledTimes(2)
  expect(sprawdzWeb).not.toHaveBeenCalled()
})

it('zapamiętuje częstotliwość i w trybie ręcznym nie sprawdza na starcie ani po wznowieniu', async () => {
  let kontrola = await import('./KontrolaAktualizacjiAplikacji')
  kontrola.zapiszCzestotliwoscAktualizacji(0)
  vi.resetModules()
  kontrola = await import('./KontrolaAktualizacjiAplikacji')
  expect(kontrola.pobierzStanKontroliAktualizacji().czestotliwoscGodzin).toBe(0)
  await kontrola.inicjalizujKontroleAktualizacjiAplikacji()
  nasluchuj.mock.calls[0][0]('aktywny')
  expect(sprawdzApk).not.toHaveBeenCalled()
  await kontrola.sprawdzAktualizacjeApk()
  expect(sprawdzApk).toHaveBeenCalledTimes(1)
})

it('zmiana okresu obowiązuje przy następnym wznowieniu bez restartu aplikacji', async () => {
  const kontrola = await import('./KontrolaAktualizacjiAplikacji')
  await kontrola.inicjalizujKontroleAktualizacjiAplikacji()
  await vi.waitFor(() => expect(kontrola.pobierzStanKontroliAktualizacji().sprawdzono).toBe(true))
  localStorage.setItem('ogarniacz:ostatnia-kontrola-aktualizacji', String(Date.now() - 2 * 60 * 60 * 1000))
  kontrola.zapiszCzestotliwoscAktualizacji(24)
  nasluchuj.mock.calls[0][0]('aktywny')
  expect(sprawdzApk).toHaveBeenCalledTimes(1)
  kontrola.zapiszCzestotliwoscAktualizacji(1)
  nasluchuj.mock.calls[0][0]('aktywny')
  expect(sprawdzApk).toHaveBeenCalledTimes(2)
})

it('nie uruchamia równoległych kontroli i po błędzie pozwala ponowić', async () => {
  const kontrola = await import('./KontrolaAktualizacjiAplikacji')
  sprawdzApk.mockRejectedValueOnce(new Error('brak sieci'))
  const wyniki = await Promise.allSettled([kontrola.sprawdzAktualizacjeApk(), kontrola.sprawdzAktualizacjeApk()])
  expect(wyniki.every((wynik) => wynik.status === 'rejected')).toBe(true)
  expect(sprawdzApk).toHaveBeenCalledTimes(1)
  await kontrola.sprawdzAktualizacjeApk()
  expect(sprawdzApk).toHaveBeenCalledTimes(2)
})

it.each(['999', '', '  ', 'brak'])('uszkodzone ustawienie %s przywraca domyślne cztery godziny', async (wartosc) => {
  localStorage.setItem('ogarniacz:czestotliwosc-aktualizacji-apk', wartosc)
  const kontrola = await import('./KontrolaAktualizacjiAplikacji')
  expect(kontrola.pobierzStanKontroliAktualizacji().czestotliwoscGodzin).toBe(4)
  expect(() => kontrola.zapiszCzestotliwoscAktualizacji(999)).toThrow('Nieprawidłowa częstotliwość')
})
it('sprawdza przy każdym starcie mimo zapisanej kontroli, a wznowienia ogranicza do czterech godzin', async () => {
  localStorage.setItem('ogarniacz:ostatnia-kontrola-aktualizacji', String(Date.now()))
  const kontrola = await import('./KontrolaAktualizacjiAplikacji')
  await kontrola.inicjalizujKontroleAktualizacjiAplikacji()
  expect(sprawdzApk).toHaveBeenCalledTimes(1)
  nasluchuj.mock.calls[0][0]('aktywny')
  expect(sprawdzApk).toHaveBeenCalledTimes(1)
})

it('po błędzie ponownej kontroli usuwa nieaktualny wynik APK i odzyskuje stan po sukcesie', async () => {
  const kontrola = await import('./KontrolaAktualizacjiAplikacji')
  sprawdzApk.mockResolvedValueOnce({ czyNowsza: true }).mockRejectedValueOnce(new Error('brak sieci'))
    .mockResolvedValueOnce({ czyNowsza: false })
  await kontrola.sprawdzAktualizacjeApk()
  expect(kontrola.pobierzStanKontroliAktualizacji().wynikApk?.czyNowsza).toBe(true)
  await expect(kontrola.sprawdzAktualizacjeApk()).rejects.toThrow('brak sieci')
  expect(kontrola.pobierzStanKontroliAktualizacji()).toMatchObject({
    wynikApk: undefined, bladApk: 'brak sieci', sprawdzono: true,
  })
  await kontrola.sprawdzAktualizacjeApk()
  expect(kontrola.pobierzStanKontroliAktualizacji()).toMatchObject({
    wynikApk: { czyNowsza: false }, bladApk: undefined, sprawdzono: true,
  })
})
