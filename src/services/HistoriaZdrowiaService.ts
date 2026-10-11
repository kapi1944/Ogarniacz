import { baza } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { tabelaKolejki } from '../data/KolejkaSynchronizacji'
import type { MapaTabel } from '../domain/typy'
import { KATEGORIE_WAZNYCH_INFORMACJI, STATUSY_POTWIERDZENIA, TABELE_HISTORII_ZDROWIA, opisChwiliZdrowia, opisDatyZdrowia, schematDatyZdrowia, schematWaznejInformacjiZdrowotnej, type DataZdrowia, type TabelaHistoriiZdrowia, type WaznaInformacjaZdrowotna, type ZdarzenieZdrowia, type ZrodloZdrowia } from '../domain/historiaZdrowia'
import { aktualnySchematLeku } from './LekiService'

export type DostepHistoriiZdrowia = (tabela: TabelaHistoriiZdrowia, operacja: 'odczyt' | 'edycja') => boolean
export type DaneHistoriiZdrowia = { [K in TabelaHistoriiZdrowia]: MapaTabel[K][] }

export async function pobierzDaneHistoriiZdrowia(dostep: DostepHistoriiZdrowia): Promise<DaneHistoriiZdrowia> {
  return Object.fromEntries(await Promise.all(TABELE_HISTORII_ZDROWIA.map(async (tabela) => [tabela, dostep(tabela, 'odczyt') ? await pobierzRepozytorium(tabela, (operacja) => dostep(tabela, operacja)).lista() : []]))) as DaneHistoriiZdrowia
}

export async function odczytajZrodloZdrowia(zrodlo: ZrodloZdrowia, dostep: DostepHistoriiZdrowia) {
  if (!dostep(zrodlo.tabela, 'odczyt')) return { stan: 'brak_uprawnien' as const }
  const rekord = await baza.tabela(zrodlo.tabela).get(zrodlo.id)
  if (!rekord) return { stan: 'brak' as const }
  if (rekord.usunietoAt) return { stan: 'usuniete' as const }
  if (zrodlo.szczegolId && (zrodlo.tabela !== 'leki' || !('historiaDawkowania' in rekord) || !rekord.historiaDawkowania?.some((wersja) => wersja.id === zrodlo.szczegolId))) return { stan: 'brak' as const }
  return { stan: 'dostepne' as const, rekord }
}

export function stanZrodlaZdrowia(zrodlo: ZrodloZdrowia | undefined, dane: DaneHistoriiZdrowia, dostep: DostepHistoriiZdrowia): ZdarzenieZdrowia['dostepnosc'] {
  if (!zrodlo) return 'dostepne'
  if (!dostep(zrodlo.tabela, 'odczyt')) return 'niedostepne'
  const rekord = dane[zrodlo.tabela].find((element) => element.id === zrodlo.id && !element.usunietoAt)
  if (!rekord) return 'niedostepne'
  if (zrodlo.szczegolId && (zrodlo.tabela !== 'leki' || !('historiaDawkowania' in rekord) || !rekord.historiaDawkowania?.some((wersja) => wersja.id === zrodlo.szczegolId))) return 'niedostepne'
  return 'dostepne'
}

export function dataChwiliZdrowia(chwila: string, strefa: string) {
  if (!Number.isFinite(Date.parse(chwila)) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(chwila)) return undefined
  const czesci = new Intl.DateTimeFormat('sv-SE', { timeZone: strefa, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(chwila))
  const pole = (typ: Intl.DateTimeFormatPartTypes) => czesci.find((czesc) => czesc.type === typ)?.value
  return { data: { dokladnosc: 'dzien', od: `${pole('year')}-${pole('month')}-${pole('day')}` } as DataZdrowia, godzina: `${pole('hour')}:${pole('minute')}`, chwila }
}

function dataZrodla(od?: string): DataZdrowia {
  for (const dokladnosc of ['dzien', 'miesiac', 'rok'] as const) {
    const wynik = schematDatyZdrowia.safeParse({ dokladnosc, od })
    if (wynik.success) return wynik.data
  }
  return { dokladnosc: 'nieznana' }
}

export function sortujZdarzeniaZdrowia(zdarzenia: ZdarzenieZdrowia[]): ZdarzenieZdrowia[] {
  return [...zdarzenia].sort((pierwsze, drugie) => {
    const dataPierwsza = 'od' in pierwsze.data ? pierwsze.data.od : ''
    const dataDruga = 'od' in drugie.data ? drugie.data.od : ''
    if (dataPierwsza !== dataDruga) return dataDruga.localeCompare(dataPierwsza)
    // Chwile ze strefą mają porządek absolutny; lokalne godziny bez strefy tworzą osobną grupę.
    const poziom = (zdarzenie: ZdarzenieZdrowia) => zdarzenie.chwila ? 2 : zdarzenie.godzina ? 1 : 0
    if (poziom(pierwsze) !== poziom(drugie)) return poziom(drugie) - poziom(pierwsze)
    if (pierwsze.chwila && drugie.chwila) return Date.parse(drugie.chwila) - Date.parse(pierwsze.chwila) || pierwsze.id.localeCompare(drugie.id)
    return (drugie.godzina ?? '').localeCompare(pierwsze.godzina ?? '') || pierwsze.id.localeCompare(drugie.id)
  })
}

export function zbudujOsZdrowia(dane: DaneHistoriiZdrowia, dostep: DostepHistoriiZdrowia, strefa: string): ZdarzenieZdrowia[] {
  const zdarzenia: ZdarzenieZdrowia[] = []
  const dodaj = (tabela: TabelaHistoriiZdrowia, id: string, kategoria: ZdarzenieZdrowia['kategoria'], rodzaj: string, data: DataZdrowia, opis: string, szczegoly: Partial<ZdarzenieZdrowia> = {}) => {
    if (!dostep(tabela, 'odczyt')) return
    zdarzenia.push({ id: `${tabela}:${id}`, kategoria, rodzaj, data, opis, zrodlo: { tabela, id }, dostepnosc: 'dostepne', ...szczegoly })
  }
  for (const lek of dane.leki.filter((element) => !element.usunietoAt)) {
    const wersje = (lek.historiaDawkowania ?? []).filter((wersja) => !wersja.poczatekNieznany)
    if (!wersje.length) dodaj('leki', lek.id, 'leki', 'Lek', dataZrodla(lek.dataOd), lek.nazwa)
    for (const wersja of wersje) {
      const data = dataChwiliZdrowia(wersja.obowiazujeOd, strefa)
      dodaj('leki', lek.id, 'leki', 'Schemat dawkowania', data?.data ?? { dokladnosc: 'nieznana' }, `Schemat dawkowania: ${lek.nazwa}`, { ...data, id: `leki:${lek.id}:wersja:${wersja.id}`, zrodlo: { tabela: 'leki', id: lek.id, szczegolId: wersja.id } })
    }
  }
  const dziennik = [...dane.dziennikLekow].filter((wpis) => !wpis.usunietoAt).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id))
  const wystapienia = new Set<string>()
  for (const wpis of dziennik) {
    const klucz = wpis.idWystapienia ?? wpis.id
    if (wystapienia.has(klucz)) continue
    wystapienia.add(klucz)
    if (wpis.status !== 'zazyte') continue
    const lek = dostep('leki', 'odczyt') ? dane.leki.find((element) => element.id === wpis.lekId && !element.usunietoAt) : undefined
    const data = wpis.przyjetoAt ? dataChwiliZdrowia(wpis.przyjetoAt, strefa) : undefined
    dodaj('dziennikLekow', wpis.id, 'leki', 'Potwierdzone przyjęcie', data?.data ?? dataZrodla(wpis.data), lek ? `Potwierdzono przyjęcie: ${lek.nazwa}` : 'Potwierdzono przyjęcie; lek niedostępny', { ...data, dostepnosc: lek ? 'dostepne' : 'ograniczone' })
  }
  for (const wizyta of dane.wizyty.filter((element) => !element.usunietoAt)) dodaj('wizyty', wizyta.id, 'wizyty', 'Wizyta', dataZrodla(wizyta.data), wizyta.nazwa, { godzina: wizyta.data ? wizyta.godzina : undefined })
  for (const terapia of dane.terapie.filter((element) => !element.usunietoAt)) dodaj('terapie', terapia.id, 'leczenie', 'Rozpoczęcie terapii', dataZrodla(terapia.dataRozpoczecia), terapia.rodzaj === 'psychoterapia' ? 'Psychoterapia' : terapia.nazwa, { prywatneSzczegoly: true })
  for (const wpis of dane.wpisyTerapii.filter((element) => !element.usunietoAt)) {
    const data = dataChwiliZdrowia(wpis.dataCzas, strefa)
    dodaj('wpisyTerapii', wpis.id, 'terapia', 'Sesja terapeutyczna', data?.data ?? dataZrodla(wpis.dataCzas), 'Sesja terapeutyczna — szczegóły po otwarciu', { ...data, prywatneSzczegoly: true })
  }
  for (const wpis of dane.wpisySamopoczucia.filter((element) => !element.usunietoAt)) {
    const data = dataChwiliZdrowia(wpis.czasObserwacji, strefa)
    dodaj('wpisySamopoczucia', wpis.id, 'samopoczucie', 'Obserwacja samopoczucia', data?.data ?? dataZrodla(wpis.dataObserwacji), 'Wpis samopoczucia — szczegóły po otwarciu', { ...data, prywatneSzczegoly: true })
  }
  for (const wynik of dane.wynikiBadan.filter((element) => !element.usunietoAt)) dodaj('wynikiBadan', wynik.id, 'badania', 'Wynik badania', dataZrodla(wynik.dataPobrania), `Wynik: ${wynik.parametr}`, { dostepnosc: stanZrodlaZdrowia({ tabela: 'dokumenty', id: wynik.dokumentId }, dane, dostep) === 'dostepne' ? 'dostepne' : 'ograniczone' })
  const zdrowotneIds = new Set([...dane.wynikiBadan.map((wynik) => wynik.dokumentId), ...dane.wizyty.flatMap((wizyta) => wizyta.dokumentyIds)])
  for (const dokument of dane.dokumenty.filter((element) => !element.usunietoAt && (element.medyczne || zdrowotneIds.has(element.id) || element.powiazania.some((powiazanie) => ['wizyty', 'zdrowie', 'skierowania', 'leki'].includes(powiazanie.typ))))) {
    dodaj('dokumenty', dokument.id, 'dokumenty', 'Dokument medyczny', dataZrodla(dokument.medyczne?.dataDokumentu ?? dokument.medyczne?.dataOtrzymania), dokument.nazwa)
  }
  for (const skierowanie of dane.skierowania.filter((element) => !element.usunietoAt)) dodaj('skierowania', skierowanie.id, 'leczenie', 'Skierowanie', dataZrodla(skierowanie.dataWystawienia), skierowanie.nazwa)
  for (const recepta of dane.recepty.filter((element) => !element.usunietoAt)) dodaj('recepty', recepta.id, 'leczenie', 'Recepta', dataZrodla(recepta.dataWystawienia), 'Wystawienie recepty')
  for (const informacja of dane.wazneInformacjeZdrowotne.filter((element) => !element.usunietoAt)) dodaj('wazneInformacjeZdrowotne', informacja.id, 'leczenie', KATEGORIE_WAZNYCH_INFORMACJI[informacja.kategoria], informacja.data, informacja.ukryjTresc ? 'Ważna informacja — treść po otwarciu' : informacja.tresc.slice(0, 180), {
    prywatneSzczegoly: informacja.ukryjTresc, dostepnosc: stanZrodlaZdrowia(informacja.zrodlo, dane, dostep),
  })
  return sortujZdarzeniaZdrowia([...new Map(zdarzenia.map((zdarzenie) => [zdarzenie.id, zdarzenie])).values()])
}

export interface FiltrOsiZdrowia { kategoria?: string; rodzaj?: string; szukana?: string; okres?: string }
export function filtrujOsZdrowia(zdarzenia: ZdarzenieZdrowia[], filtr: FiltrOsiZdrowia): ZdarzenieZdrowia[] {
  return zdarzenia.filter((zdarzenie) => {
    if (filtr.kategoria && zdarzenie.kategoria !== filtr.kategoria) return false
    if (filtr.rodzaj && zdarzenie.rodzaj !== filtr.rodzaj) return false
    if (filtr.szukana && !`${zdarzenie.rodzaj} ${zdarzenie.opis}`.toLocaleLowerCase('pl').includes(filtr.szukana.toLocaleLowerCase('pl'))) return false
    if (!filtr.okres) return true
    if (zdarzenie.data.dokladnosc === 'nieznana') return false
    const poczatek = zdarzenie.data.od
    const koniec = zdarzenie.data.dokladnosc === 'okres' ? zdarzenie.data.do : poczatek
    // Prefiksy pozwalają porównać znany okres bez wymyślania dnia lub godziny.
    const dlugosc = Math.min(filtr.okres.length, poczatek.length)
    const wybrany = filtr.okres.slice(0, dlugosc)
    return poczatek.slice(0, dlugosc) <= wybrany && koniec.slice(0, dlugosc) >= wybrany
  })
}

export async function zapiszWaznaInformacje(informacja: WaznaInformacjaZdrowotna, dostep: DostepHistoriiZdrowia): Promise<void> {
  const sprawdz = () => { if (!dostep('wazneInformacjeZdrowotne', 'odczyt') || !dostep('wazneInformacjeZdrowotne', 'edycja')) throw new Error('Brak uprawnienia do ważnych informacji zdrowotnych.') }
  sprawdz()
  const poprawna = schematWaznejInformacjiZdrowotnej.parse(informacja)
  await baza.transaction('rw', [...TABELE_HISTORII_ZDROWIA.map((tabela) => baza.tabela(tabela)), tabelaKolejki()], async () => {
    sprawdz()
    const poprzednia = await baza.tabela('wazneInformacjeZdrowotne').get(informacja.id)
    if (poprzednia && (poprzednia.usunietoAt || poprzednia.updatedAt !== informacja.updatedAt)) throw new Error('Informacja uległa zmianie. Otwórz ją ponownie.')
    if (poprawna.zrodlo?.tabela === 'wazneInformacjeZdrowotne') throw new Error('Wskaż pierwotne źródło zdrowotne.')
    if (poprawna.zrodlo && JSON.stringify(poprawna.zrodlo) !== JSON.stringify(poprzednia?.zrodlo)) {
      const odczyt = await odczytajZrodloZdrowia(poprawna.zrodlo, dostep)
      if (odczyt.stan !== 'dostepne') throw new Error('Źródło jest niedostępne lub brakuje uprawnienia.')
      if (poprawna.zrodlo.szczegolId && (!('historiaDawkowania' in odczyt.rekord) || !odczyt.rekord.historiaDawkowania?.some((wersja) => wersja.id === poprawna.zrodlo?.szczegolId))) throw new Error('Wersja dawkowania jest niedostępna.')
    }
    for (const id of poprawna.kontaktyIds ?? []) {
      if (poprzednia?.kontaktyIds?.includes(id)) continue
      if ((await odczytajZrodloZdrowia({ tabela: 'kontakty', id }, dostep)).stan !== 'dostepne') throw new Error('Kontakt jest niedostępny lub brakuje uprawnienia.')
    }
    await pobierzRepozytorium('wazneInformacjeZdrowotne', (operacja) => dostep('wazneInformacjeZdrowotne', operacja)).zapisz({ ...poprawna, createdAt: poprzednia?.createdAt ?? poprawna.createdAt })
  })
}

export async function usunWaznaInformacje(id: string, dostep: DostepHistoriiZdrowia): Promise<void> {
  await pobierzRepozytorium('wazneInformacjeZdrowotne', (operacja) => dostep('wazneInformacjeZdrowotne', operacja)).usun(id)
}

export const SEKCJE_KARTY_ZDROWOTNEJ = { najwazniejsze: 'Najważniejsze informacje', reakcje: 'Alergie i reakcje', leki: 'Aktywne leki', wydarzenia: 'Istotne choroby i wydarzenia', hospitalizacje: 'Hospitalizacje', kontakty: 'Ważne kontakty', wsparcie: 'Plan wsparcia' } as const
export type SekcjaKartyZdrowotnej = keyof typeof SEKCJE_KARTY_ZDROWOTNEJ
export interface PozycjaKartyZdrowotnej { id: string; tresc: string; aktualnosc: string; status: string; dostepnosc: ZdarzenieZdrowia['dostepnosc']; ukryta: boolean; zrodlo?: ZrodloZdrowia }
export interface KartaZdrowotna { przygotowanoAt: string; sekcje: Record<SekcjaKartyZdrowotnej, PozycjaKartyZdrowotnej[]> }

export function zbudujKarteZdrowotna(dane: DaneHistoriiZdrowia, dostep: DostepHistoriiZdrowia, teraz: Date, strefa: string): KartaZdrowotna {
  const dzisiaj = (dataChwiliZdrowia(teraz.toISOString(), strefa)!.data as { od: string }).od
  const sekcje: KartaZdrowotna['sekcje'] = { najwazniejsze: [], reakcje: [], leki: [], wydarzenia: [], hospitalizacje: [], kontakty: [], wsparcie: [] }
  const informacje = dostep('wazneInformacjeZdrowotne', 'odczyt') ? dane.wazneInformacjeZdrowotne.filter((element) => !element.usunietoAt && (!element.obowiazujeOd || element.obowiazujeOd <= dzisiaj) && (!element.obowiazujeDo || element.obowiazujeDo >= dzisiaj)) : []
  for (const informacja of sortujZdarzeniaZdrowia(informacje.map((element) => ({ id: element.id, rodzaj: '', kategoria: 'leczenie', data: element.data, opis: '', zrodlo: { tabela: 'wazneInformacjeZdrowotne', id: element.id }, dostepnosc: 'dostepne' })))) {
    const element = informacje.find((wpis) => wpis.id === informacja.id)!
    const sekcja: SekcjaKartyZdrowotnej = ['alergia', 'reakcja_na_lek'].includes(element.kategoria) ? 'reakcje' : element.kategoria === 'hospitalizacja' ? 'hospitalizacje' : element.kategoria === 'plan_wsparcia' ? 'wsparcie' : ['diagnoza', 'zabieg', 'wydarzenie'].includes(element.kategoria) ? 'wydarzenia' : 'najwazniejsze'
    sekcje[sekcja].push({ id: element.id, tresc: element.ukryjTresc ? 'Treść dostępna po świadomym otwarciu' : element.tresc, aktualnosc: `${opisDatyZdrowia(element.data)} · Przegląd: ${element.ostatniPrzeglad ?? 'Brak przeglądu'}`, status: STATUSY_POTWIERDZENIA[element.statusPotwierdzenia], dostepnosc: stanZrodlaZdrowia(element.zrodlo, dane, dostep), ukryta: element.ukryjTresc, zrodlo: { tabela: 'wazneInformacjeZdrowotne', id: element.id } })
  }
  if (dostep('leki', 'odczyt')) for (const lek of dane.leki.filter((element) => !element.usunietoAt && element.aktywny)) {
    const schemat = aktualnySchematLeku(lek, teraz)
    if (!schemat || schemat.dataOd && schemat.dataOd > dzisiaj || schemat?.dataDo && schemat.dataDo < dzisiaj) continue
    const dawki = schemat.dawki?.map((dawka) => `${dawka.godzina}: ${dawka.ilosc ?? 'ilość niepodana'} ${schemat.jednostka ?? ''}`).join('; ')
    sekcje.leki.push({ id: lek.id, tresc: `${lek.nazwa}${lek.moc ? ` · ${lek.moc}` : ''} · ${schemat.dawkaInstrukcja || dawki || 'Dawkowanie niepodane'}`, aktualnosc: `Zapis zmieniono: ${opisChwiliZdrowia(lek.updatedAt, strefa)}`, status: 'Zapis z listy leków — zweryfikuj aktualność', dostepnosc: 'dostepne', ukryta: false, zrodlo: { tabela: 'leki', id: lek.id } })
  }
  if (dostep('kontakty', 'odczyt')) for (const id of [...new Set(informacje.flatMap((informacja) => informacja.kontaktyIds ?? []))]) {
    const kontakt = dane.kontakty.find((element) => element.id === id && !element.usunietoAt)
    if (kontakt) sekcje.kontakty.push({ id, tresc: `${kontakt.nazwa}${kontakt.rola ? ` · ${kontakt.rola}` : ''}${kontakt.telefon ? ` · ${kontakt.telefon}` : ''}`, aktualnosc: `Zapis zmieniono: ${opisChwiliZdrowia(kontakt.updatedAt, strefa)}`, status: 'Kontakt wybrany przez użytkownika — zweryfikuj aktualność', dostepnosc: 'dostepne', ukryta: false, zrodlo: { tabela: 'kontakty', id } })
  }
  return { przygotowanoAt: teraz.toISOString(), sekcje }
}

export function wybierzSekcjeKarty(karta: KartaZdrowotna, wybrane: SekcjaKartyZdrowotnej[]): KartaZdrowotna {
  return { ...karta, sekcje: Object.fromEntries(Object.keys(SEKCJE_KARTY_ZDROWOTNEJ).map((sekcja) => [sekcja, wybrane.includes(sekcja as SekcjaKartyZdrowotnej) ? karta.sekcje[sekcja as SekcjaKartyZdrowotnej].filter((pozycja) => !pozycja.ukryta && pozycja.dostepnosc === 'dostepne') : []])) as KartaZdrowotna['sekcje'] }
}

export function utworzHtmlKartyZdrowotnej(kartaPoPodgladzie: KartaZdrowotna): string {
  const bezpieczny = (tekst: string) => tekst.replace(/[&<>"']/g, (znak) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[znak]!)
  const karta = wybierzSekcjeKarty(kartaPoPodgladzie, Object.keys(SEKCJE_KARTY_ZDROWOTNEJ) as SekcjaKartyZdrowotnej[])
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Karta zdrowotna</title><style>body{font:18px/1.5 system-ui,sans-serif;max-width:800px;margin:24px auto;padding:16px;color:#111;background:#fff}h1{font-size:30px}h2{font-size:24px}article{break-inside:avoid;border-bottom:1px solid #aaa;padding:12px 0}p{white-space:pre-wrap;overflow-wrap:anywhere}small{display:block}@media print{body{margin:0;font-size:12pt}h1{font-size:20pt}h2{font-size:16pt}}</style></head><body><h1>Ważne informacje zdrowotne</h1><p>Przygotowano: ${bezpieczny(opisChwiliZdrowia(karta.przygotowanoAt))}</p><p>Informacje wybrane przez użytkownika. Wymagają sprawdzenia aktualności; karta nie jest gwarantowanym źródłem danych dla ratowników.</p>${Object.entries(karta.sekcje).filter(([, pozycje]) => pozycje.length).map(([sekcja, pozycje]) => `<section><h2>${SEKCJE_KARTY_ZDROWOTNEJ[sekcja as SekcjaKartyZdrowotnej]}</h2>${pozycje.map((pozycja) => `<article><p>${bezpieczny(pozycja.tresc)}</p><small>${bezpieczny(pozycja.status)}</small><small>${bezpieczny(pozycja.aktualnosc)}</small></article>`).join('')}</section>`).join('')}</body></html>`
}

export async function wygenerujKartePoPodgladzie(podglad: KartaZdrowotna | undefined, wybrane: SekcjaKartyZdrowotnej[], dostep: DostepHistoriiZdrowia, strefa: string): Promise<string> {
  if (!podglad) throw new Error('Najpierw otwórz podgląd karty.')
  const aktualna = wybierzSekcjeKarty(zbudujKarteZdrowotna(await pobierzDaneHistoriiZdrowia(dostep), dostep, new Date(), strefa), wybrane)
  if (JSON.stringify(aktualna.sekcje) !== JSON.stringify(podglad.sekcje)) throw new Error('Dane lub uprawnienia uległy zmianie. Otwórz nowy podgląd karty.')
  return utworzHtmlKartyZdrowotnej(podglad)
}
