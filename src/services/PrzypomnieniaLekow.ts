import { czyBiezacyDostep, sprawdzBiezacyDostep } from './UprawnieniaService'
import { addDays, format } from 'date-fns'
import { baza } from '../data/BazaOgarniacza'
import { dodajDoKolejkiSynchronizacji, tabelaKolejki } from '../data/KolejkaSynchronizacji'
import { powiadomOZmianieDanych } from '../data/ZdarzeniaDanych'
import { utworzMetadane } from '../domain/fabryki'
import type { DziennikLeku, Lek, Przypomnienie } from '../domain/typy'
import { generujDawkiDnia, wersjaStanuDawki, type DawkaDnia } from './LekiService'

const aktywneStany = new Set(['nowe', 'dostarczone', 'odroczone', 'eskalowane'])

function obowiazujacaDawka(powiazanie: NonNullable<Przypomnienie['dawkaLeku']>, leki: Lek[], wpisy: DziennikLeku[]): DawkaDnia | undefined {
  const lek = leki.find((element) => element.id === powiazanie.lekId && element.aktywny && !element.usunietoAt)
  if (!lek || !generujDawkiDnia([lek], [], powiazanie.data).some((element) => element.idWystapienia === powiazanie.idWystapienia)) return undefined
  return generujDawkiDnia([lek], wpisy, powiazanie.data).find((element) => element.idWystapienia === powiazanie.idWystapienia)
}

/** Uzgodnienie istniejących przypomnień. Dostarcza je wyłącznie SilnikPrzypomnien. */
export async function uzgodnijPrzypomnieniaLekow(teraz = new Date()): Promise<Przypomnienie[]> {
  if (!czyBiezacyDostep('leki', 'odczyt') || !czyBiezacyDostep('leki', 'edycja')) return (await baza.tabela('przypomnienia').toArray()).filter((element) => (!element.dawkaLeku || czyBiezacyDostep('leki', 'odczyt')) && (!element.zrodlo || czyBiezacyDostep(element.zrodlo.typ, 'odczyt')))
  const tabela = baza.tabela('przypomnienia')
  let zmieniono = false
  const wynik = await baza.transaction('rw', [baza.tabela('leki'), baza.tabela('dziennikLekow'), tabela, tabelaKolejki()], async () => {
    const leki = await baza.tabela('leki').toArray()
    const wpisy = (await baza.tabela('dziennikLekow').toArray()).filter((wpis) => !wpis.usunietoAt)
    const przypomnienia = await tabela.toArray()
    const daty = new Set(Array.from({ length: 7 }, (_, indeks) => format(addDays(teraz, indeks), 'yyyy-MM-dd')))
    // Odroczenie przez północ zachowuje datę i ID pierwotnego wystąpienia.
    for (const wpis of wpisy) if (wpis.status === 'odroczone') daty.add(wpis.data)
    for (const przypomnienie of przypomnienia) if (przypomnienie.dawkaLeku && aktywneStany.has(przypomnienie.stan)) daty.add(przypomnienie.dawkaLeku.data)
    const docelowe = new Map<string, Przypomnienie>()
    for (const data of daty) {
      const zaplanowane = new Set(generujDawkiDnia(leki, [], data).map((dawka) => dawka.idWystapienia))
      for (const dawka of generujDawkiDnia(leki, wpisy, data)) {
        if (!dawka.lek.aktywny || !zaplanowane.has(dawka.idWystapienia) || !dawka.planowanyCzas) continue
        const id = `dawka:${dawka.idWystapienia}`
        const poprzednie = przypomnienia.find((element) => element.id === id)
        if (poprzednie?.usunietoAt) continue
        const wersjaStanu = wersjaStanuDawki(dawka)
        const stan = dawka.status === 'zazyte' ? 'wykonane' : dawka.status === 'pominiete' ? 'pominiete'
          : poprzednie?.dawkaLeku?.wersjaStanu === wersjaStanu && !poprzednie.dawkaLeku.nieaktualne ? poprzednie.stan
            : dawka.status === 'odroczone' ? 'odroczone' : 'nowe'
        // Nie odtwarzamy zaległych alarmów z dawnych dni; istniejąca historia pozostaje.
        if (!poprzednie && data < format(teraz, 'yyyy-MM-dd') && dawka.status !== 'odroczone') continue
        docelowe.set(id, {
          ...(poprzednie ?? utworzMetadane(id)), tytul: `Dawka leku: ${dawka.lek.nazwa}`,
          zrodlo: { typ: 'leki', id: dawka.lek.id }, typ: 'absolutne', czas: dawka.planowanyCzas,
          priorytet: 'normalny', eskalacja: false, stan,
          odroczoneDo: dawka.status === 'odroczone' ? dawka.wpis?.odroczoneDo : undefined,
          kluczDeduplikacji: id,
          dawkaLeku: { lekId: dawka.lek.id, dawkaId: dawka.dawka.id, idWystapienia: dawka.idWystapienia,
            data, planowanyCzas: dawka.planowanyCzas, wersjaDawkowaniaId: dawka.wersjaDawkowaniaId, status: dawka.status, wersjaStanu },
        })
      }
    }
    for (const stare of przypomnienia) {
      if (!stare.dawkaLeku || stare.usunietoAt || docelowe.has(stare.id) || !aktywneStany.has(stare.stan)) continue
      // Anulowanie dostarczenia nie usuwa przypomnienia ani wpisu dziennika.
      docelowe.set(stare.id, { ...stare, stan: 'pominiete', dawkaLeku: { ...stare.dawkaLeku, nieaktualne: true } })
    }
    for (const nowe of docelowe.values()) {
      const stare = przypomnienia.find((element) => element.id === nowe.id)
      if (JSON.stringify(stare) === JSON.stringify(nowe)) continue
      nowe.updatedAt = teraz.toISOString()
      await tabela.put(nowe)
      await dodajDoKolejkiSynchronizacji('przypomnienia', nowe, stare)
      zmieniono = true
    }
    return (await tabela.toArray()).filter((element) => !element.usunietoAt)
  })
  if (zmieniono) powiadomOZmianieDanych('przypomnienia')
  return wynik
}

export async function sprawdzAlarmDawki(przypomnienieId: string, oczekiwanaWersja: string): Promise<DawkaDnia> {
  return baza.transaction('r', [baza.tabela('przypomnienia'), baza.tabela('leki'), baza.tabela('dziennikLekow')], async () => {
    sprawdzBiezacyDostep('leki', 'odczyt')
    const przypomnienie = await baza.tabela('przypomnienia').get(przypomnienieId)
    const powiazanie = przypomnienie?.dawkaLeku
    const dawka = powiazanie && obowiazujacaDawka(powiazanie, await baza.tabela('leki').toArray(), (await baza.tabela('dziennikLekow').toArray()).filter((wpis) => !wpis.usunietoAt))
    if (!przypomnienie || przypomnienie.usunietoAt || !aktywneStany.has(przypomnienie.stan) || !dawka
      || powiazanie?.nieaktualne || wersjaStanuDawki(dawka) !== oczekiwanaWersja || powiazanie?.wersjaStanu !== oczekiwanaWersja
      || !['oczekuje', 'odroczone'].includes(dawka.status)) throw new Error('Ten alarm jest nieaktualny. Sprawdź aktualny stan dawki.')
    return dawka
  })
}

export function sciezkaAlarmuDawki(przypomnienie: Przypomnienie, akcja?: string): string {
  const dawka = przypomnienie.dawkaLeku!
  const parametry = new URLSearchParams({ element: dawka.lekId, wystapienie: dawka.idWystapienia,
    dataDawki: dawka.data, wersjaDawki: dawka.wersjaStanu, ...(akcja ? { akcjaDawki: akcja } : {}) })
  return `/zdrowie/leki?${parametry}`
}

/** Spóźnione zakończenie dostarczenia nie nadpisuje nowszego rekordu. */
export async function oznaczDostarczeniePrzypomnienia(przypomnienie: Przypomnienie): Promise<void> {
  const tabela = baza.tabela('przypomnienia')
  await baza.transaction('rw', [tabela, tabelaKolejki(), baza.tabela('leki'), baza.tabela('dziennikLekow')], async () => {
    const aktualne = await tabela.get(przypomnienie.id)
    if (!aktualne || aktualne.usunietoAt || !['nowe', 'odroczone'].includes(aktualne.stan) || aktualne.updatedAt !== przypomnienie.updatedAt) return
    if (aktualne.stan !== przypomnienie.stan || aktualne.czas !== przypomnienie.czas || aktualne.odroczoneDo !== przypomnienie.odroczoneDo
      || aktualne.dawkaLeku?.wersjaStanu !== przypomnienie.dawkaLeku?.wersjaStanu) return
    if (aktualne.dawkaLeku) {
      const dawka = obowiazujacaDawka(aktualne.dawkaLeku, await baza.tabela('leki').toArray(), await baza.tabela('dziennikLekow').toArray())
      if (!dawka || wersjaStanuDawki(dawka) !== aktualne.dawkaLeku.wersjaStanu) return
    }
    const zapisane = { ...aktualne, stan: 'dostarczone' as const, updatedAt: new Date().toISOString() }
    await tabela.put(zapisane)
    await dodajDoKolejkiSynchronizacji('przypomnienia', zapisane, aktualne)
  })
  powiadomOZmianieDanych('przypomnienia')
}
