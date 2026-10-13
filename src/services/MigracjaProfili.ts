import Dexie from 'dexie'
import { otworzBazeProfilu, aktywujProfil, rejestrProfili, type ProfilLokalny, type RejestrProfili } from '../data/ProfileLokalne'
import { przygotujWartoscDoTransportu, obliczChecksum, szyfrujZawartoscKopii } from './BackupService'

type DaneMigracji = Record<string, Record<string, unknown>[]>

async function odczytajMigawke(baza: Dexie): Promise<DaneMigracji> {
  return baza.transaction('r', baza.tables, async () => {
    const dane: DaneMigracji = {}
    for (const tabela of baza.tables) dane[tabela.name] = await tabela.toArray()
    return dane
  })
}

async function checksumDanych(dane: DaneMigracji): Promise<string> {
  return obliczChecksum({ manifest: { format: 'ogarniacz-migracja-profili', wersja: 1 }, payload: await przygotujWartoscDoTransportu(dane, false) })
}

export async function otworzZrodloMigracji(nazwa = 'ogarniacz-v1'): Promise<Dexie | undefined> {
  if (!await Dexie.exists(nazwa)) return undefined
  // Otwieramy istniejący schemat bez deklarowania wersji i bez migracji źródła.
  const zrodlo = new Dexie(nazwa, { autoOpen: false })
  await zrodlo.open()
  return zrodlo
}

export async function utworzZaszyfrowanaKopieMigracji(haslo: string, nazwaZrodla = 'ogarniacz-v1') {
  const zrodlo = await otworzZrodloMigracji(nazwaZrodla)
  if (!zrodlo) throw new Error('Brak dotychczasowej bazy.')
  try {
    const dane = await odczytajMigawke(zrodlo)
    return await szyfrujZawartoscKopii({
      format: 'ogarniacz-migracja-profili', wersja: 1, nazwaZrodla,
      checksum: await checksumDanych(dane), dane: await przygotujWartoscDoTransportu(dane, false),
    }, haslo)
  } finally { zrodlo.close() }
}

export async function migrujDaneDoProfilu(
  profil: ProfilLokalny,
  potwierdzenie: { wlascicielId: string; potwierdzonoPrzypisanie: boolean },
  opcje: { rejestr?: RejestrProfili; nazwaZrodla?: string; przedZapisemTabeli?: (nazwa: string) => void } = {},
): Promise<void> {
  if (!potwierdzenie.potwierdzonoPrzypisanie || potwierdzenie.wlascicielId !== profil.wlascicielId || profil.konto.rola !== 'wlasciciel' || profil.uzytkownikId !== profil.wlascicielId) throw new Error('Potwierdź jawnie Właściciela dotychczasowych danych.')
  const rejestr = opcje.rejestr ?? rejestrProfili
  const zapisany = await rejestr.profile.get(profil.id)
  if (!zapisany || zapisany.wlascicielId !== profil.wlascicielId) throw new Error('Brak zarejestrowanego profilu.')
  const zrodlo = await otworzZrodloMigracji(opcje.nazwaZrodla)
  if (!zrodlo) throw new Error('Nie znaleziono źródła migracji.')
  const cel = await otworzBazeProfilu(profil)
  try {
    const dane = await odczytajMigawke(zrodlo)
    const checksum = await checksumDanych(dane)
    if (Object.keys(dane).some((nazwa) => !cel.tables.some((tabela) => tabela.name === nazwa))) throw new Error('Źródło zawiera nieobsługiwaną tabelę. Zachowano dane.')
    if (zapisany.migracja) {
      // Po ukończeniu nowe dane profilu nie są ponownie zastępowane źródłem.
      if (zapisany.migracja.checksum !== checksum) throw new Error('Źródło zmieniło się po migracji. Nie nadpisano profilu.')
      await aktywujProfil(zapisany, rejestr)
      return
    }
    await cel.transaction('rw', cel.tables, async () => {
      const obecne = await odczytajMigawke(cel)
      const niepuste = Object.values(obecne).some((rekordy) => rekordy.length > 0)
      if (niepuste) {
        const zgodne = await Dexie.waitFor(checksumDanych(Object.fromEntries(Object.keys(dane).map((nazwa) => [nazwa, obecne[nazwa]]))))
        if (zgodne !== checksum || Object.entries(obecne).some(([nazwa, rekordy]) => !(nazwa in dane) && rekordy.length)) throw new Error('Docelowy profil zawiera inne dane. Niczego nie nadpisano.')
      } else {
        for (const [nazwa, rekordy] of Object.entries(dane)) {
          opcje.przedZapisemTabeli?.(nazwa)
          if (rekordy.length) await cel.table(nazwa).bulkAdd(rekordy)
        }
      }
      const kopia = await odczytajMigawke(cel)
      const checksumKopii = await Dexie.waitFor(checksumDanych(Object.fromEntries(Object.keys(dane).map((nazwa) => [nazwa, kopia[nazwa]]))))
      if (checksumKopii !== checksum) throw new Error('Weryfikacja kompletności kopii nie powiodła się.')
    })
    if (await checksumDanych(await odczytajMigawke(zrodlo)) !== checksum) throw new Error('Źródło zmieniło się podczas migracji. Profil nie został aktywowany.')
    // Znacznik dopiero po commicie danych. Przerwanie między bazami jest wznawialne.
    const ukonczony = { ...zapisany, migracja: { checksum, zakonczonoAt: new Date().toISOString() } }
    await rejestr.profile.put(ukonczony)
    await aktywujProfil(ukonczony, rejestr)
  } finally { cel.close(); zrodlo.close() }
}
