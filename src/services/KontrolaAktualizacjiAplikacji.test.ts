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
  localStorage.clear()
  nasluchuj.mock.calls[0][0]('aktywny')
  expect(sprawdzApk).toHaveBeenCalledTimes(2)
  expect(sprawdzWeb).not.toHaveBeenCalled()
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
