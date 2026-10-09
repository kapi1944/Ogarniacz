import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ZmianaSynchronizacji } from '../data/DostawcaSynchronizacji'
import { BladSynchronizacjiHttp } from '../data/RepozytoriumZdalneHttp'
import { utworzZadanie } from './ZadaniaService'

const { pobierzZmiany, wyslijZmiany, nasluchujCyklu, pokazSystemowe } = vi.hoisted(() => ({
  pobierzZmiany: vi.fn<() => Promise<ZmianaSynchronizacji[]>>(),
  wyslijZmiany: vi.fn<() => Promise<void>>(),
  nasluchujCyklu: vi.fn(),
  pokazSystemowe: vi.fn().mockResolvedValue(true),
}))
vi.mock('../platform/platforma', () => ({ platforma: { powiadomienia: { pokaz: pokazSystemowe }, cyklZycia: { nasluchuj: nasluchujCyklu } } }))
vi.mock('./KonfiguracjaSynchronizacji', () => ({ pobierzKonfiguracjeSynchronizacji: () => ({ adresApi: 'https://serwer.example.test' }) }))
vi.mock('../data/RepozytoriumZdalneHttp', async (oryginal) => ({
  ...await oryginal<typeof import('../data/RepozytoriumZdalneHttp')>(),
  RepozytoriumZdalneHttp: class {
    pobierzZmiany = pobierzZmiany
    wyslijZmiany = wyslijZmiany
  },
}))

let baza: typeof import('../data/BazaOgarniacza')['baza']
let synchronizacja: typeof import('./SynchronizacjaAplikacji')
let powiadomienia: typeof import('./PowiadomieniaSynchronizacji')
let zatrzymaj: (() => void) | undefined

const rekord = (id: string, updatedAt = '2026-10-09T09:00:00.000Z') => ({
  ...utworzZadanie({ tytul: 'Prywatne dane medyczne i token=sekret' }),
  id, createdAt: '2026-10-01T09:00:00.000Z', updatedAt,
})

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  localStorage.clear()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  pobierzZmiany.mockResolvedValue([])
  wyslijZmiany.mockResolvedValue(undefined)
  nasluchujCyklu.mockResolvedValue(() => undefined)
  await Dexie.delete('ogarniacz-v1')
  const modulBazy = await import('../data/BazaOgarniacza')
  baza = modulBazy.baza
  await modulBazy.inicjalizujBaze()
  for (const tabela of modulBazy.nazwyTabel) await baza.table(tabela).clear()
  synchronizacja = await import('./SynchronizacjaAplikacji')
  powiadomienia = await import('./PowiadomieniaSynchronizacji')
})
afterEach(() => { zatrzymaj?.(); zatrzymaj = undefined; baza.close(); vi.useRealTimers(); vi.restoreAllMocks() })

async function zapiszLokalnie(id = 'lokalne') {
  const { pobierzRepozytorium } = await import('../data/Repozytorium')
  await pobierzRepozytorium('zadania').zapisz(rekord(id))
}

it('podsumowuje rzeczywisty push i pull dopiero po zatwierdzeniu, bez dublowania współbieżnej operacji', async () => {
  powiadomienia.ustawSystemowePowiadomieniaSynchronizacji(true)
  await zapiszLokalnie()
  pobierzZmiany.mockResolvedValue([{ tabela: 'zadania', rekord: rekord('zdalne'), installationId: 'inne-urzadzenie' }])
  let potwierdz!: () => void
  wyslijZmiany.mockImplementation(() => new Promise<void>((rozwiaz) => { potwierdz = rozwiaz }))
  const pierwsza = synchronizacja.synchronizujTeraz()
  const druga = synchronizacja.synchronizujTeraz()
  expect(druga).toBe(pierwsza)
  await vi.waitFor(() => expect(wyslijZmiany).toHaveBeenCalledTimes(1))
  expect(powiadomienia.pobierzPowiadomieniaSynchronizacji()).toMatchObject({ etap: 'wysylanie' })
  expect(powiadomienia.pobierzPowiadomieniaSynchronizacji().komunikat).toBeUndefined()
  expect(pokazSystemowe).not.toHaveBeenCalled()
  potwierdz()
  expect(await pierwsza).toMatchObject({ wyslane: 1, pobrane: 1, konflikty: 0 })
  expect(await baza.tabela('zadania').get('zdalne')).toBeDefined()
  expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(0)
  expect(powiadomienia.pobierzPowiadomieniaSynchronizacji().komunikat?.tresc).toContain('Wysłano: 1, pobrano: 1, konflikty: 0')
  expect(pokazSystemowe).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(pokazSystemowe.mock.calls)).not.toContain('sekret')
})

it('bez zmian i bez opt-in nie pokazuje sukcesu ani powiadomień systemowych', async () => {
  await synchronizacja.synchronizujTeraz()
  expect(powiadomienia.pobierzPowiadomieniaSynchronizacji().komunikat).toBeUndefined()
  await zapiszLokalnie()
  await synchronizacja.synchronizujTeraz()
  expect(powiadomienia.pobierzPowiadomieniaSynchronizacji().komunikat?.typ).toBe('sukces')
  expect(pokazSystemowe).not.toHaveBeenCalled()
})

it('offline pozostawia outbox i automatycznie wysyła go po odzyskaniu sieci', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await zapiszLokalnie()
  zatrzymaj = await synchronizacja.inicjalizujSynchronizacjeAplikacji()
  await vi.waitFor(() => expect(powiadomienia.pobierzPowiadomieniaSynchronizacji().komunikat?.tresc).toContain('Tryb offline'))
  expect(pobierzZmiany).not.toHaveBeenCalled()
  expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(1)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  window.dispatchEvent(new Event('online'))
  await vi.waitFor(async () => expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(0))
  expect(wyslijZmiany).toHaveBeenCalledTimes(1)
})

it('powtarzany błąd połączenia nie spamuje i nie usuwa oczekujących zmian', async () => {
  await zapiszLokalnie()
  const blad = new BladSynchronizacjiHttp('brak_polaczenia', 'token=sekret')
  pobierzZmiany.mockRejectedValue(blad)
  await expect(synchronizacja.synchronizujTeraz()).rejects.toThrow()
  const pierwszy = powiadomienia.pobierzPowiadomieniaSynchronizacji().komunikat!
  await expect(synchronizacja.synchronizujTeraz()).rejects.toThrow()
  expect(powiadomienia.pobierzPowiadomieniaSynchronizacji().komunikat?.id).toBe(pierwszy.id)
  expect(pierwszy.tresc).not.toContain('sekret')
  expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(1)
})

it('ponawia po niedostępności Raspberry bez nowego zdarzenia online, a po sukcesie kończy ponawianie', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  pobierzZmiany.mockRejectedValue(new BladSynchronizacjiHttp('brak_polaczenia', 'brak'))
  zatrzymaj = await synchronizacja.inicjalizujSynchronizacjeAplikacji()
  await vi.waitFor(() => expect(powiadomienia.pobierzPowiadomieniaSynchronizacji().komunikat?.typ).toBe('ostrzezenie'))
  pobierzZmiany.mockResolvedValue([])
  await vi.advanceTimersByTimeAsync(60_000)
  await vi.waitFor(async () => expect((await baza.tabela('stanSynchronizacji').get('glowny'))?.stan).toBe('zsynchronizowano'))
  const liczbaProb = pobierzZmiany.mock.calls.length
  await vi.advanceTimersByTimeAsync(60_000)
  expect(pobierzZmiany).toHaveBeenCalledTimes(liczbaProb)
})

it('konflikt zachowuje obie wersje i nie powtarza ostrzeżenia podczas kolejnych kontroli', async () => {
  await zapiszLokalnie('konflikt')
  pobierzZmiany.mockResolvedValue([{ tabela: 'zadania', rekord: rekord('konflikt', '2026-10-09T08:00:00.000Z'), installationId: 'inne-urzadzenie' }])
  expect((await synchronizacja.synchronizujTeraz()).konflikty).toBe(1)
  const pierwszy = powiadomienia.pobierzPowiadomieniaSynchronizacji().komunikat!
  await synchronizacja.synchronizujTeraz()
  expect(powiadomienia.pobierzPowiadomieniaSynchronizacji().komunikat?.id).toBe(pierwszy.id)
  expect(await baza.tabela('konfliktySynchronizacji').count()).toBe(1)
  expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(1)
  expect(wyslijZmiany).not.toHaveBeenCalled()
})

it('wygasła sesja wymaga logowania, zachowuje zmiany i wraca do synchronizacji po zalogowaniu', async () => {
  await zapiszLokalnie()
  pobierzZmiany.mockRejectedValue(new BladSynchronizacjiHttp('sesja_wygasla', 'csrf=sekret'))
  zatrzymaj = await synchronizacja.inicjalizujSynchronizacjeAplikacji()
  await vi.waitFor(() => expect(powiadomienia.pobierzPowiadomieniaSynchronizacji().komunikat?.tresc).toContain('Zaloguj się ponownie'))
  expect((await baza.tabela('stanSynchronizacji').get('glowny'))?.sesjaWymagaLogowania).toBe(true)
  expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(1)
  expect(powiadomienia.pobierzPowiadomieniaSynchronizacji().komunikat?.tresc).not.toContain('sekret')
  pobierzZmiany.mockResolvedValue([])
  window.dispatchEvent(new Event('ogarniacz:konto'))
  await vi.waitFor(async () => expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(0))
  expect((await baza.tabela('stanSynchronizacji').get('glowny'))?.sesjaWymagaLogowania).toBe(false)
})

it('start, wznowienie, logowanie i lokalna zmiana wyzwalają automatyczny silnik', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  zatrzymaj = await synchronizacja.inicjalizujSynchronizacjeAplikacji()
  await vi.waitFor(() => expect(pobierzZmiany).toHaveBeenCalledTimes(1))
  await synchronizacja.synchronizujTeraz()
  const poStarcie = pobierzZmiany.mock.calls.length
  nasluchujCyklu.mock.calls[0][0]('aktywny')
  await vi.waitFor(() => expect(pobierzZmiany).toHaveBeenCalledTimes(poStarcie + 1))
  await synchronizacja.synchronizujTeraz()
  const poWznowieniu = pobierzZmiany.mock.calls.length
  window.dispatchEvent(new Event('ogarniacz:konto'))
  await vi.waitFor(() => expect(pobierzZmiany).toHaveBeenCalledTimes(poWznowieniu + 1))
  await synchronizacja.synchronizujTeraz()
  await zapiszLokalnie('automatycznie')
  await vi.advanceTimersByTimeAsync(3000)
  await vi.waitFor(() => expect(wyslijZmiany).toHaveBeenCalledTimes(1))
})
