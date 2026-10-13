import Dexie, { type Table } from 'dexie'
import { BazaOgarniacza } from './BazaOgarniacza'
import type { KontoUzytkownika } from '../services/KontaService'

export interface ProfilLokalny {
  id: string
  serwer: string
  uzytkownikId: string
  wlascicielId: string
  nazwaBazy: string
  konto: KontoUzytkownika
  migracja?: { checksum: string; zakonczonoAt: string }
}

export class RejestrProfili extends Dexie {
  profile!: Table<ProfilLokalny, string>
  stan!: Table<{ id: string; profilId?: string }, string>
  constructor(nazwa = 'ogarniacz-profile') {
    super(nazwa)
    this.version(1).stores({ profile: 'id, &[serwer+uzytkownikId+wlascicielId]', stan: 'id' })
  }
}

export const rejestrProfili = new RejestrProfili()
let aktywnyProfil: ProfilLokalny | undefined
let sygnalProfilu = new AbortController()
let profileUruchomione = false

export function oznaczUruchomienieProfili(): void { profileUruchomione = true }
export function czyProfileUruchomione(): boolean { return profileUruchomione }

export function pobierzAktywnyProfil(): ProfilLokalny | undefined { return aktywnyProfil }
export function pobierzSygnalProfilu(): AbortSignal { return sygnalProfilu.signal }

export function zamknijKontekstProfilu(baza: BazaOgarniacza): void {
  sygnalProfilu.abort()
  baza.close()
  aktywnyProfil = undefined
}

/** Tożsamość pochodzi z odpowiedzi uwierzytelnionego serwera, nigdy z wyboru localStorage. */
export async function zarejestrujProfilSesji(serwer: string, konto: KontoUzytkownika, rejestr = rejestrProfili): Promise<ProfilLokalny> {
  const adres = new URL(serwer).origin
  if (!konto.zalogowany || !konto.uzytkownikId || !konto.wlascicielId) throw new Error('Brak zweryfikowanej tożsamości profilu.')
  const istniejacy = await rejestr.profile.where('[serwer+uzytkownikId+wlascicielId]').equals([adres, konto.uzytkownikId, konto.wlascicielId]).first()
  const id = istniejacy?.id ?? crypto.randomUUID()
  const profil: ProfilLokalny = {
    ...istniejacy, id, serwer: adres, uzytkownikId: konto.uzytkownikId, wlascicielId: konto.wlascicielId,
    nazwaBazy: istniejacy?.nazwaBazy ?? `ogarniacz-profil-${id}`,
    konto: { ...konto, csrf: undefined, kodyOdzyskiwania: undefined },
  }
  await rejestr.profile.put(profil)
  return profil
}

export async function otworzBazeProfilu(profil: ProfilLokalny): Promise<BazaOgarniacza> {
  if (!profil.nazwaBazy.startsWith('ogarniacz-profil-') || profil.nazwaBazy !== `ogarniacz-profil-${profil.id}`) throw new Error('Niepoprawna baza profilu.')
  const baza = new BazaOgarniacza(profil.nazwaBazy)
  await baza.open()
  return baza
}

export async function aktywujProfil(profil: ProfilLokalny, rejestr = rejestrProfili): Promise<void> {
  const zapisany = await rejestr.profile.get(profil.id)
  if (!zapisany || zapisany.serwer !== profil.serwer || zapisany.uzytkownikId !== profil.uzytkownikId || zapisany.wlascicielId !== profil.wlascicielId) throw new Error('Profil nie jest zarejestrowany.')
  await rejestr.stan.put({ id: 'aktywny', profilId: profil.id })
  sygnalProfilu = new AbortController()
  aktywnyProfil = zapisany
}
