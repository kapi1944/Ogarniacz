import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import Dexie from 'dexie'
import { CapacitorHttp } from '@capacitor/core'
import { baza } from '../data/BazaOgarniacza'
import { rejestrProfili, pobierzAktywnyProfil, pobierzSygnalProfilu } from '../data/ProfileLokalne'
import { pobierzSesjeKonta, type KontoUzytkownika } from './KontaService'
import { przygotujProfilStartowy, nasluchujZmianyProfilu, zamknijProfilNatychmiast, zmienSesjeIPrzeladuj } from './KontekstProfilu'
import { RepozytoriumZdalneHttp } from '../data/RepozytoriumZdalneHttp'

vi.mock('./KontaService', async (oryginal) => ({ ...await oryginal<typeof import('./KontaService')>(), pobierzSesjeKonta: vi.fn() }))
vi.mock('./KonfiguracjaSynchronizacji', () => ({ pobierzKonfiguracjeSynchronizacji: () => ({ adresApi: 'https://serwer.test' }) }))
vi.mock('./SynchronizacjaAplikacji', () => ({ zatrzymajSynchronizacjeAplikacji: vi.fn(async () => {}) }))
vi.mock('../platform/platforma', () => ({ platforma: { powiadomienia: { synchronizuj: vi.fn(async () => {}) }, migawkiWidgetow: { zapisz: vi.fn(async () => true) } } }))
vi.mock('@capacitor/core', async (oryginal) => ({ ...await oryginal<typeof import('@capacitor/core')>(), CapacitorHttp: { get: vi.fn(), post: vi.fn() } }))

const konto = (id: string): KontoUzytkownika => ({ zalogowany: true, uzytkownikId: id, wlascicielId: id, email: id + '@example.test', rola: 'wlasciciel', granty: [], edytorzy: [] })
beforeEach(async () => {
  // Ten zestaw sprawdza gotowe profile, bez bazy legacy otwieranej przez setup.
  await Dexie.delete('ogarniacz-v1')
  await rejestrProfili.profile.clear(); await rejestrProfili.stan.clear()
  sessionStorage.setItem('ogarniacz-csrf', 'csrf')
  vi.mocked(pobierzSesjeKonta).mockResolvedValue(konto('a'))
})
afterEach(async () => {
  baza.close()
  for (const profil of await rejestrProfili.profile.toArray()) {
    const { otworzBazeProfilu } = await import('../data/ProfileLokalne')
    const otwarta = await otworzBazeProfilu(profil)
    await otwarta.delete()
  }
  await rejestrProfili.profile.clear(); await rejestrProfili.stan.clear()
  vi.restoreAllMocks()
})

it('A → B → A nie miesza rekordów, kolejki, zdrowia ani kursorów', async () => {
  await przygotujProfilStartowy()
  const profilA = pobierzAktywnyProfil()!
  for (const tabela of ['zadania', 'kolejkaSynchronizacji', 'wpisyTerapii', 'stanSynchronizacji']) await baza.table(tabela).put({ id: 'a', tresc: 'Prywatne A' })
  vi.mocked(pobierzSesjeKonta).mockResolvedValue(konto('b'))
  await przygotujProfilStartowy()
  for (const tabela of ['zadania', 'kolejkaSynchronizacji', 'wpisyTerapii', 'stanSynchronizacji']) expect(await baza.table(tabela).count()).toBe(0)
  vi.mocked(pobierzSesjeKonta).mockResolvedValue(konto('a'))
  await przygotujProfilStartowy()
  expect(pobierzAktywnyProfil()?.id).toBe(profilA.id)
  expect((await baza.table('wpisyTerapii').get('a')).tresc).toBe('Prywatne A')
})

it('offline otwiera tylko ostatni profil z rejestru; localStorage nie wybiera innego konta', async () => {
  await przygotujProfilStartowy()
  const profilA = pobierzAktywnyProfil()!.id
  vi.mocked(pobierzSesjeKonta).mockRejectedValue(new Error('Network error'))
  localStorage.setItem('ogarniacz-aktywny-profil', 'b')
  await przygotujProfilStartowy()
  expect(pobierzAktywnyProfil()?.id).toBe(profilA)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const operacja = vi.fn()
  await expect(zmienSesjeIPrzeladuj(operacja)).rejects.toThrow('połączenia')
  expect(operacja).not.toHaveBeenCalled()
  expect(baza.isOpen()).toBe(true)
})

it('zamknięcie podczas push odrzuca odpowiedź i nie pozwala ponownie wysłać starej kolejki', async () => {
  await przygotujProfilStartowy()
  let zakoncz!: (wartosc: never) => void
  vi.mocked(CapacitorHttp.post).mockReturnValue(new Promise((rozwiaz) => { zakoncz = rozwiaz }))
  const repozytorium = new RepozytoriumZdalneHttp('https://serwer.test')
  const wysylka = repozytorium.wyslijZmiany([])
  await vi.waitFor(() => expect(CapacitorHttp.post).toHaveBeenCalledOnce())
  expect(CapacitorHttp.post).toHaveBeenCalledWith(expect.objectContaining({ headers: expect.objectContaining({ 'x-ogarniacz-user-id': 'a', 'x-ogarniacz-owner-id': 'a' }) }))
  zamknijProfilNatychmiast()
  const odrzucona = expect(wysylka).rejects.toThrow('Profil zmienił')
  zakoncz({ status: 200, data: {}, headers: {}, url: '' } as never)
  await odrzucona
  await expect(repozytorium.wyslijZmiany([])).rejects.toThrow('Profil zmienił')
  expect(CapacitorHttp.post).toHaveBeenCalledOnce()
})

it('zmiana w drugiej karcie natychmiast zamyka bazę i anuluje kontekst', async () => {
  await przygotujProfilStartowy()
  const sygnal = pobierzSygnalProfilu()
  const zakoncz = nasluchujZmianyProfilu()
  try {
    window.dispatchEvent(new StorageEvent('storage', { key: 'ogarniacz-zmiana-profilu', newValue: 'start:test' }))
    expect(sygnal.aborted).toBe(true)
    expect(baza.isOpen()).toBe(false)
    await expect(baza.table('zadania').count()).rejects.toThrow()
  } finally { zakoncz() }
})
