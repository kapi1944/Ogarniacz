import type {
  DecyzjaModeluEcho,
  MigawkaKontekstuEcho,
  OczekujaceDoprecyzowanieEcho,
  ProviderModeluEcho,
  WartoscDomyslnaEcho,
  WynikNarzedziaEcho,
  ZadanieModeluEcho,
} from './typyEcho'

const DOMYSLNA_GODZINA_RANO = '08:00'
const DOMYSLNA_GODZINA_PO_PRACY = '17:00'

interface SlowoWypowiedzi { oryginalne: string; uproszczone: string }

interface RozpoznanyCzas {
  data?: string
  godzina?: string
  etykietaDaty?: string
  etykietaGodziny?: string
  indeksy: number[]
  wartosciDomyslne: WartoscDomyslnaEcho[]
}

interface ZamiarSemantycznyEcho {
  typ: 'utworz_przypomnienie' | 'przeloz_przypomnienie'
  tytul: string
  data: string
  godzina: string
  okreslenieCzasu: string
  id?: string
  sposob?: 'zwykly' | 'godzine_pozniej' | 'poprzedni_termin'
  wartosciDomyslne: WartoscDomyslnaEcho[]
}

type ZamiarZadaniaEcho =
  | { typ: 'odczytaj_zadania'; okreslenie: string; data: string }
  | { typ: 'wyszukaj_zadania'; fraza: string }
  | { typ: 'znajdz_do_edycji'; fraza: string; data: string; okreslenie: string }
  | { typ: 'znajdz_do_usuniecia'; fraza: string }
  | { typ: 'edytuj_zadanie'; id: string; tytul: string; data: string; okreslenie: string }
  | { typ: 'usun_zadanie'; id: string; tytul: string }
  | { typ: 'usun_zadania_masowo'; od: string; do: string }

type ZamiarWywolaniaEcho = ZamiarSemantycznyEcho | ZamiarZadaniaEcho

const dniTygodnia = new Map<string, number>([
  ['niedziela', 0], ['niedziele', 0], ['niedzieli', 0], ['poniedzialek', 1], ['poniedzialku', 1],
  ['wtorek', 2], ['wtorku', 2], ['sroda', 3], ['srode', 3], ['srody', 3], ['czwartek', 4],
  ['czwartku', 4], ['piatek', 5], ['piatku', 5], ['sobota', 6], ['sobote', 6], ['soboty', 6],
])

function uprosc(tekst: string): string {
  return tekst.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
}

function slowa(tekst: string): SlowoWypowiedzi[] {
  return tekst.replace(/[.,!?;…]/g, ' ').split(/\s+/).filter(Boolean)
    .map((slowo) => slowo.replace(/^:+|:+$/g, ''))
    .filter(Boolean)
    .map((oryginalne) => ({ oryginalne, uproszczone: uprosc(oryginalne) }))
}

function dataPoPrzesunieciu(dataLokalna: string, dni: number): string {
  const [rok, miesiac, dzien] = dataLokalna.split('-').map(Number)
  return new Date(Date.UTC(rok, miesiac - 1, dzien + dni)).toISOString().slice(0, 10)
}

function dzienTygodnia(dataLokalna: string): number {
  const [rok, miesiac, dzien] = dataLokalna.split('-').map(Number)
  return new Date(Date.UTC(rok, miesiac - 1, dzien)).getUTCDay()
}

function rozpoznajCzas(lista: SlowoWypowiedzi[], dataLokalna: string): RozpoznanyCzas {
  const daty: { indeks: number; data: string; etykieta: string }[] = []
  for (const [indeks, slowo] of lista.entries()) {
    if (['dzis', 'dzisiaj', 'jutro', 'pojutrze'].includes(slowo.uproszczone)) {
      const przesuniecie = slowo.uproszczone === 'jutro' ? 1 : slowo.uproszczone === 'pojutrze' ? 2 : 0
      daty.push({ indeks, data: dataPoPrzesunieciu(dataLokalna, przesuniecie), etykieta: slowo.uproszczone === 'dzisiaj' ? 'dzisiaj' : slowo.uproszczone })
    } else if (dniTygodnia.has(slowo.uproszczone)) {
      const docelowy = dniTygodnia.get(slowo.uproszczone)!
      const przesuniecie = (docelowy - dzienTygodnia(dataLokalna) + 7) % 7 || 7
      daty.push({ indeks, data: dataPoPrzesunieciu(dataLokalna, przesuniecie), etykieta: `w ${slowo.oryginalne.toLocaleLowerCase('pl-PL')}` })
    }
  }

  const godziny: { indeksy: number[]; godzina: string; etykieta: string; domyslna?: WartoscDomyslnaEcho }[] = []
  for (const [indeks, slowo] of lista.entries()) {
    if (slowo.uproszczone === 'rano') {
      godziny.push({ indeksy: [indeks], godzina: DOMYSLNA_GODZINA_RANO, etykieta: 'rano', domyslna: { pole: 'godzina', wartosc: DOMYSLNA_GODZINA_RANO, opis: 'dla określenia „rano”' } })
    } else if (slowo.uproszczone === 'po' && lista[indeks + 1]?.uproszczone === 'pracy') {
      godziny.push({ indeksy: [indeks, indeks + 1], godzina: DOMYSLNA_GODZINA_PO_PRACY, etykieta: 'po pracy', domyslna: { pole: 'godzina', wartosc: DOMYSLNA_GODZINA_PO_PRACY, opis: 'dla określenia „po pracy”' } })
    } else if (/^(?:[01]?\d|2[0-3])(?::[0-5]\d)?$/.test(slowo.uproszczone)) {
      const [godzina, minuta = '00'] = slowo.uproszczone.split(':')
      const indeksy = lista[indeks - 1]?.uproszczone === 'o' ? [indeks - 1, indeks] : [indeks]
      godziny.push({ indeksy, godzina: `${godzina.padStart(2, '0')}:${minuta}`, etykieta: `o ${godzina}:${minuta}` })
    }
  }

  const wybranaData = daty.at(-1)
  const wybranaGodzina = godziny.at(-1)
  return {
    data: wybranaData?.data,
    godzina: wybranaGodzina?.godzina,
    etykietaDaty: wybranaData?.etykieta,
    etykietaGodziny: wybranaGodzina?.etykieta,
    indeksy: [
      ...daty.flatMap(({ indeks }) => lista[indeks - 1]?.uproszczone === 'na' ? [indeks - 1, indeks] : [indeks]),
      ...godziny.flatMap(({ indeksy }) => indeksy),
    ],
    wartosciDomyslne: wybranaGodzina?.domyslna ? [wybranaGodzina.domyslna] : [],
  }
}

function czasIso(data: string, godzina: string): string {
  const [rok, miesiac, dzien] = data.split('-').map(Number)
  const [godziny, minuty] = godzina.split(':').map(Number)
  return new Date(rok, miesiac - 1, dzien, godziny, minuty).toISOString()
}

function rozlozCzasIso(czas: string): { data: string; godzina: string } {
  const wartosc = new Date(czas)
  return { data: `${wartosc.getFullYear()}-${String(wartosc.getMonth() + 1).padStart(2, '0')}-${String(wartosc.getDate()).padStart(2, '0')}`, godzina: `${String(wartosc.getHours()).padStart(2, '0')}:${String(wartosc.getMinutes()).padStart(2, '0')}` }
}

function ostatniaWypowiedz(kontekst: MigawkaKontekstuEcho): string {
  return [...kontekst.tury].reverse().find((tura) => tura.rola === 'uzytkownik')?.tresc ?? ''
}

function zbudujTytul(lista: SlowoWypowiedzi[], pomin: number[]): string {
  const pomijane = new Set(pomin)
  const techniczne = new Set(['ej', 'hej', 'wiesz', 'co', 'w', 'sumie', 'przypomnij', 'przypomnienie', 'mi', 'dodaj', 'dopisz', 'prosze', 'musze', 'jednak', 'wlasciwie', 'nie', 'czekaj', 'to', 'tamto', 'ten', 'poprzedni'])
  const pozostale = lista.filter(({ uproszczone }, indeks) => !pomijane.has(indeks) && !techniczne.has(uproszczone)).map(({ oryginalne }) => oryginalne)
  while (pozostale[0] && ['na', 'że', 'ze'].includes(pozostale[0].toLocaleLowerCase('pl-PL'))) pozostale.shift()
  const tytul = pozostale.join(' ').trim()
  return tytul ? tytul.charAt(0).toLocaleUpperCase('pl-PL') + tytul.slice(1) : ''
}

function ostatniePrzypomnienia(kontekst: MigawkaKontekstuEcho): MigawkaKontekstuEcho['ostatnieEncje'] {
  const wynik: MigawkaKontekstuEcho['ostatnieEncje'] = []
  for (const encja of kontekst.ostatnieEncje) {
    if (encja.typ !== 'przypomnienie') continue
    const indeks = wynik.findIndex(({ id }) => id === encja.id)
    if (indeks >= 0) wynik.splice(indeks, 1)
    wynik.push(encja)
  }
  return wynik
}

function ostatnieZadania(kontekst: MigawkaKontekstuEcho): MigawkaKontekstuEcho['ostatnieEncje'] {
  return kontekst.ostatnieEncje.filter((encja) => encja.typ === 'zadanie')
}

function frazaZadania(lista: SlowoWypowiedzi[], pomin: number[]): string {
  const pomijane = new Set(pomin)
  const techniczne = new Set(['znajdz', 'wyszukaj', 'poszukaj', 'mi', 'to', 'ten', 'tamto', 'zadanie', 'zadania', 'o', 'usun', 'usunac', 'przenies', 'przeloz', 'przesun', 'zmien', 'termin', 'na', 'jednak', 'prosze'])
  return lista.filter(({ uproszczone }, indeks) => !pomijane.has(indeks) && !techniczne.has(uproszczone))
    .map(({ oryginalne }) => oryginalne).join(' ').trim()
}

function zakresBiezacegoTygodnia(dataLokalna: string): { od: string; do: string } {
  const dzien = dzienTygodnia(dataLokalna)
  const odPoniedzialku = dzien === 0 ? 6 : dzien - 1
  const od = dataPoPrzesunieciu(dataLokalna, -odPoniedzialku)
  return { od, do: dataPoPrzesunieciu(od, 6) }
}

function czasyPrzypomnienia(kontekst: MigawkaKontekstuEcho, id: string): string[] {
  return kontekst.ostatnieWynikiNarzedzi.flatMap((wynik) => {
    if (wynik.status !== 'wykonane' || !wynik.dane || typeof wynik.dane !== 'object') return []
    const dane = wynik.dane as { id?: unknown; czas?: unknown }
    return dane.id === id && typeof dane.czas === 'string' ? [dane.czas] : []
  })
}

function pytanieDlaDoprecyzowania(doprecyzowanie: OczekujaceDoprecyzowanieEcho): string {
  const ile = doprecyzowanie.brakujacePola.length
  const wstep = ile > 1 ? `Potrzebuję jeszcze ${ile === 2 ? 'dwóch' : 'kilku'} informacji. ` : ''
  if (doprecyzowanie.brakujacePola[0] === 'tytul') return `${wstep}Czego mam Ci przypomnieć?`
  if (doprecyzowanie.brakujacePola[0] === 'data') return `${wstep}Na kiedy mam ustawić przypomnienie?`
  return `${wstep}Którego ${doprecyzowanie.intencja.includes('zadanie') ? 'zadania' : 'przypomnienia'} dotyczy zmiana?`
}

function wybierzKandydata(tekst: string, kandydaci: NonNullable<OczekujaceDoprecyzowanieEcho['zebrane']['kandydaci']>) {
  const uproszczony = uprosc(tekst)
  const tokeny = new Set(slowa(tekst).map(({ uproszczone }) => uproszczone))
  if (tokeny.has('poprzedni')) return kandydaci.at(-2)
  if (['to', 'ten', 'ostatni'].some((token) => tokeny.has(token))) return kandydaci.at(-1)
  return kandydaci.find((kandydat) => kandydat.etykieta && uprosc(kandydat.etykieta).split(/\s+/).some((slowo) => slowo.length > 3 && uproszczony.includes(slowo)))
}

function okreslenieCzasu(czas: RozpoznanyCzas, godzina: string): string {
  return [czas.etykietaDaty, czas.etykietaGodziny ?? `o ${godzina}`].filter(Boolean).join(' ')
}

function zamiarUtworzenia(tytul: string, czas: RozpoznanyCzas): ZamiarSemantycznyEcho {
  const godzina = czas.godzina ?? DOMYSLNA_GODZINA_RANO
  const wartosciDomyslne = czas.godzina ? czas.wartosciDomyslne : [{ pole: 'godzina', wartosc: godzina, opis: 'brak podanej godziny' } satisfies WartoscDomyslnaEcho]
  return { typ: 'utworz_przypomnienie', tytul, data: czas.data!, godzina, okreslenieCzasu: okreslenieCzasu(czas, godzina), wartosciDomyslne }
}

export class LokalnySemantycznyProviderEcho implements ProviderModeluEcho {
  readonly nazwa = 'lokalny-semantyczny'
  readonly tryb = 'ograniczony_lokalny' as const
  private licznikWywolan = 0
  private readonly zamiaryWywolan = new Map<string, ZamiarWywolaniaEcho>()
  private readonly obsluzoneWyniki = new Set<string>()

  async odpowiedz(zadanie: ZadanieModeluEcho, sygnal: AbortSignal): Promise<DecyzjaModeluEcho> {
    if (sygnal.aborted) throw new DOMException('Anulowano', 'AbortError')
    const wynik = [...zadanie.kontekstRozmowy.ostatnieWynikiNarzedzi].reverse().find((element) => !this.obsluzoneWyniki.has(element.wywolanieId))
    const zamiarWyniku = wynik ? this.zamiaryWywolan.get(wynik.wywolanieId) : undefined
    if (wynik && zamiarWyniku) return this.odpowiedzPoWyniku(wynik, zamiarWyniku)

    const doprecyzowanie = zadanie.kontekstRozmowy.oczekujaceDoprecyzowanie
    if (doprecyzowanie) return this.kontynuujDoprecyzowanie(zadanie, doprecyzowanie)

    const tekst = ostatniaWypowiedz(zadanie.kontekstRozmowy)
    const lista = slowa(tekst)
    const czas = rozpoznajCzas(lista, zadanie.kontekstCzasu.dataLokalna)
    const przypomnienia = ostatniePrzypomnienia(zadanie.kontekstRozmowy)
    const ostatnie = przypomnienia.at(-1)
    const zadania = ostatnieZadania(zadanie.kontekstRozmowy)
    const ostatnieZadanie = zadania.at(-1)
    const tokeny = new Set(lista.map(({ uproszczone }) => uproszczone))

    const czyUsuniecie = [...tokeny].some((token) => token.startsWith('usun'))
    if (czyUsuniecie && tokeny.has('wszystkie') && (tokeny.has('tygodnia') || tokeny.has('tygodniu'))) {
      const zakres = zakresBiezacegoTygodnia(zadanie.kontekstCzasu.dataLokalna)
      return this.wywolajZadanie({ typ: 'usun_zadania_masowo', ...zakres })
    }

    if (czyUsuniecie) {
      const maReferencje = ['to', 'ten', 'tamto'].some((token) => tokeny.has(token))
      if (maReferencje && ostatnieZadanie) return this.wywolajZadanie({ typ: 'usun_zadanie', id: ostatnieZadanie.id, tytul: ostatnieZadanie.etykieta ?? 'zadanie' })
      const fraza = frazaZadania(lista, czas.indeksy)
      if (fraza) return this.wywolajZadanie({ typ: 'znajdz_do_usuniecia', fraza })
      return { typ: 'pytanie', tresc: 'Które zadanie mam usunąć?' }
    }

    const czyOdczyt = tokeny.has('co') && tokeny.has('mam') && (tokeny.has('dzis') || tokeny.has('dzisiaj') || tokeny.has('jutro'))
    if (czyOdczyt && czas.data) return this.wywolajZadanie({ typ: 'odczytaj_zadania', data: czas.data, okreslenie: czas.etykietaDaty ?? czas.data })

    const czyWyszukiwanie = [...tokeny].some((token) => ['znajdz', 'wyszukaj', 'poszukaj'].includes(token))
    if (czyWyszukiwanie) {
      const fraza = frazaZadania(lista, czas.indeksy)
      if (fraza) return this.wywolajZadanie({ typ: 'wyszukaj_zadania', fraza })
      return { typ: 'pytanie', tresc: 'Jakiego zadania mam poszukać?' }
    }

    const maReferencjeDoEdycji = ['to', 'ten', 'tamto'].some((token) => tokeny.has(token))
    const czyEdycjaZadania = lista.some(({ uproszczone: slowo }) => ['przeloz', 'przenies', 'przesun'].includes(slowo)) && czas.data && (!maReferencjeDoEdycji || Boolean(ostatnieZadanie))
    if (czyEdycjaZadania) {
      const maReferencje = maReferencjeDoEdycji
      if (maReferencje && ostatnieZadanie) return this.wywolajZadanie({ typ: 'edytuj_zadanie', id: ostatnieZadanie.id, tytul: ostatnieZadanie.etykieta ?? 'zadanie', data: czas.data!, okreslenie: czas.etykietaDaty ?? czas.data! })
      const fraza = frazaZadania(lista, czas.indeksy)
      if (fraza) return this.wywolajZadanie({ typ: 'znajdz_do_edycji', fraza, data: czas.data!, okreslenie: czas.etykietaDaty ?? czas.data! })
    }

    if ([...tokeny].some((token) => token.startsWith('godzin')) && tokeny.has('pozniej') && ostatnie) {
      const poprzedniCzas = czasyPrzypomnienia(zadanie.kontekstRozmowy, ostatnie.id).at(-1)
      if (poprzedniCzas) {
        const rozlozony = rozlozCzasIso(new Date(new Date(poprzedniCzas).getTime() + 60 * 60 * 1000).toISOString())
        return this.wywolaj({ typ: 'przeloz_przypomnienie', id: ostatnie.id, tytul: ostatnie.etykieta ?? 'przypomnienie', ...rozlozony, okreslenieCzasu: 'godzinę później', sposob: 'godzine_pozniej', wartosciDomyslne: [] })
      }
    }

    if (tokeny.has('nie') && tokeny.has('poprzedni') && ostatnie) {
      const poprzedniCzas = czasyPrzypomnienia(zadanie.kontekstRozmowy, ostatnie.id).at(-2)
      if (poprzedniCzas) {
        const rozlozony = rozlozCzasIso(poprzedniCzas)
        return this.wywolaj({ typ: 'przeloz_przypomnienie', id: ostatnie.id, tytul: ostatnie.etykieta ?? 'przypomnienie', ...rozlozony, okreslenieCzasu: `z powrotem na ${rozlozony.data} o ${rozlozony.godzina}`, sposob: 'poprzedni_termin', wartosciDomyslne: [] })
      }
    }

    const zmianaGodziny = lista.some(({ uproszczone: slowo }) => ['zmien', 'ustaw'].includes(slowo)) && lista.some(({ uproszczone: slowo }) => slowo.startsWith('godzin')) && czas.godzina
    if (zmianaGodziny && ostatnie) {
      const obecnyCzas = czasyPrzypomnienia(zadanie.kontekstRozmowy, ostatnie.id).at(-1)
      if (obecnyCzas) {
        const obecny = rozlozCzasIso(obecnyCzas)
        return this.wywolaj({ typ: 'przeloz_przypomnienie', id: ostatnie.id, tytul: ostatnie.etykieta ?? 'przypomnienie', data: czas.data ?? obecny.data, godzina: czas.godzina!, okreslenieCzasu: czas.etykietaGodziny!, sposob: 'zwykly', wartosciDomyslne: [] })
      }
    }

    const czyPrzelozenie = lista.some(({ uproszczone: slowo }) => ['przeloz', 'przenies', 'zmien'].includes(slowo))
    if (czyPrzelozenie && czas.data) {
      const maReferencje = lista.some(({ uproszczone: slowo }) => ['to', 'tamto', 'ten', 'poprzedni'].includes(slowo))
      const wybrane = lista.some(({ uproszczone: slowo }) => slowo === 'poprzedni') ? przypomnienia.at(-2) : maReferencje ? ostatnie : przypomnienia.length === 1 ? ostatnie : undefined
      if (!wybrane && przypomnienia.length > 1) {
        return this.pytanie({ intencja: 'przeloz_przypomnienie', brakujacePola: ['encja'], zebrane: { data: czas.data, godzina: czas.godzina, okreslenieCzasu: okreslenieCzasu(czas, czas.godzina ?? DOMYSLNA_GODZINA_RANO), kandydaci: przypomnienia } })
      }
      if (wybrane) {
        const obecnyCzas = czasyPrzypomnienia(zadanie.kontekstRozmowy, wybrane.id).at(-1)
        const godzina = czas.godzina ?? (obecnyCzas ? rozlozCzasIso(obecnyCzas).godzina : DOMYSLNA_GODZINA_RANO)
        return this.wywolaj({ typ: 'przeloz_przypomnienie', id: wybrane.id, tytul: wybrane.etykieta ?? 'przypomnienie', data: czas.data, godzina, okreslenieCzasu: okreslenieCzasu(czas, godzina), sposob: 'zwykly', wartosciDomyslne: czas.wartosciDomyslne })
      }
    }

    const czyUtworzenie = lista.some(({ uproszczone: slowo }) => ['dodaj', 'dopisz'].includes(slowo) || slowo.startsWith('przypomnij'))
    if (czyUtworzenie) {
      const tytul = zbudujTytul(lista, czas.indeksy)
      const brakujacePola = [...(!tytul ? ['tytul' as const] : []), ...(!czas.data ? ['data' as const] : [])]
      if (brakujacePola.length > 0) return this.pytanie({ intencja: 'utworz_przypomnienie', brakujacePola, zebrane: { tytul: tytul || undefined, data: czas.data, godzina: czas.godzina, okreslenieCzasu: okreslenieCzasu(czas, czas.godzina ?? DOMYSLNA_GODZINA_RANO) } })
      return this.wywolaj(zamiarUtworzenia(tytul, czas))
    }

    return { typ: 'pytanie', tresc: 'Nie jestem jeszcze pewien, co mam zrobić. Powiedz proszę inaczej.' }
  }

  private kontynuujDoprecyzowanie(zadanie: ZadanieModeluEcho, oczekujace: OczekujaceDoprecyzowanieEcho): DecyzjaModeluEcho {
    const tekst = ostatniaWypowiedz(zadanie.kontekstRozmowy)
    if (oczekujace.intencja === 'edytuj_zadanie' || oczekujace.intencja === 'usun_zadanie') {
      const kandydat = wybierzKandydata(tekst, oczekujace.zebrane.kandydaci ?? [])
      if (!kandydat) return this.pytanie(oczekujace)
      return oczekujace.intencja === 'edytuj_zadanie'
        ? this.wywolajZadanie({ typ: 'edytuj_zadanie', id: kandydat.id, tytul: kandydat.etykieta ?? 'zadanie', data: oczekujace.zebrane.termin!, okreslenie: oczekujace.zebrane.okreslenieCzasu ?? oczekujace.zebrane.termin! })
        : this.wywolajZadanie({ typ: 'usun_zadanie', id: kandydat.id, tytul: kandydat.etykieta ?? 'zadanie' })
    }
    if (oczekujace.intencja === 'przeloz_przypomnienie') {
      const kandydat = wybierzKandydata(tekst, oczekujace.zebrane.kandydaci ?? [])
      if (!kandydat) return this.pytanie(oczekujace)
      const obecnyCzas = czasyPrzypomnienia(zadanie.kontekstRozmowy, kandydat.id).at(-1)
      const godzina = oczekujace.zebrane.godzina ?? (obecnyCzas ? rozlozCzasIso(obecnyCzas).godzina : DOMYSLNA_GODZINA_RANO)
      return this.wywolaj({ typ: 'przeloz_przypomnienie', id: kandydat.id, tytul: kandydat.etykieta ?? 'przypomnienie', data: oczekujace.zebrane.data!, godzina, okreslenieCzasu: oczekujace.zebrane.okreslenieCzasu ?? oczekujace.zebrane.data!, sposob: 'zwykly', wartosciDomyslne: [] })
    }

    const lista = slowa(tekst)
    const czas = rozpoznajCzas(lista, zadanie.kontekstCzasu.dataLokalna)
    const zebrane = { ...oczekujace.zebrane }
    if (!zebrane.tytul) zebrane.tytul = zbudujTytul(lista, czas.indeksy) || undefined
    if (!zebrane.data && czas.data) {
      zebrane.data = czas.data
      zebrane.godzina = czas.godzina
      zebrane.okreslenieCzasu = okreslenieCzasu(czas, czas.godzina ?? DOMYSLNA_GODZINA_RANO)
    }
    const brakujacePola = [...(!zebrane.tytul ? ['tytul' as const] : []), ...(!zebrane.data ? ['data' as const] : [])]
    if (brakujacePola.length > 0) return this.pytanie({ ...oczekujace, brakujacePola, zebrane })
    const uzupelnionyCzas: RozpoznanyCzas = { data: zebrane.data, godzina: zebrane.godzina, etykietaDaty: zebrane.okreslenieCzasu, indeksy: [], wartosciDomyslne: czas.wartosciDomyslne }
    return this.wywolaj(zamiarUtworzenia(zebrane.tytul!, uzupelnionyCzas))
  }

  private pytanie(oczekujace: OczekujaceDoprecyzowanieEcho): DecyzjaModeluEcho {
    return { typ: 'pytanie', tresc: pytanieDlaDoprecyzowania(oczekujace), aktualizacjaKontekstu: { ostatniaIntencja: oczekujace.intencja, oczekujaceDoprecyzowanie: oczekujace, oczekujacaAkcja: null } }
  }

  private wywolaj(zamiar: ZamiarSemantycznyEcho): DecyzjaModeluEcho {
    this.licznikWywolan += 1
    const id = `lokalne-${this.licznikWywolan}`
    this.zamiaryWywolan.set(id, zamiar)
    const wywolanie = zamiar.typ === 'utworz_przypomnienie'
      ? { id, nazwa: 'create_reminder', argumenty: { tytul: zamiar.tytul, czas: czasIso(zamiar.data, zamiar.godzina) } }
      : { id, nazwa: 'reschedule_reminder', argumenty: { id: zamiar.id, czas: czasIso(zamiar.data, zamiar.godzina) } }
    return { typ: 'narzedzia', wywolania: [wywolanie], aktualizacjaKontekstu: { temat: 'przypomnienia', ostatniaIntencja: zamiar.typ, oczekujacaAkcja: { intencja: zamiar.typ, dane: wywolanie.argumenty }, oczekujaceDoprecyzowanie: null, wartosciDomyslne: zamiar.wartosciDomyslne } }
  }

  private wywolajZadanie(zamiar: ZamiarZadaniaEcho): DecyzjaModeluEcho {
    this.licznikWywolan += 1
    const id = `lokalne-${this.licznikWywolan}`
    this.zamiaryWywolan.set(id, zamiar)
    const wywolanie = zamiar.typ === 'odczytaj_zadania'
      ? { id, nazwa: 'list_tasks', argumenty: { status: 'otwarte', terminOd: zamiar.data, terminDo: zamiar.data } }
      : zamiar.typ === 'wyszukaj_zadania' || zamiar.typ === 'znajdz_do_edycji' || zamiar.typ === 'znajdz_do_usuniecia'
        ? { id, nazwa: 'search_tasks', argumenty: { fraza: zamiar.fraza } }
        : zamiar.typ === 'edytuj_zadanie'
          ? { id, nazwa: 'update_task', argumenty: { id: zamiar.id, zmiany: { termin: zamiar.data } } }
          : zamiar.typ === 'usun_zadanie'
            ? { id, nazwa: 'delete_task', argumenty: { id: zamiar.id } }
            : { id, nazwa: 'delete_tasks_bulk', argumenty: { terminOd: zamiar.od, terminDo: zamiar.do } }
    return { typ: 'narzedzia', wywolania: [wywolanie], aktualizacjaKontekstu: { temat: 'zadania', ostatniaIntencja: zamiar.typ, oczekujacaAkcja: { intencja: zamiar.typ, dane: wywolanie.argumenty }, oczekujaceDoprecyzowanie: null } }
  }

  private odpowiedzPoWyniku(wynik: WynikNarzedziaEcho, zamiar: ZamiarWywolaniaEcho): DecyzjaModeluEcho {
    this.obsluzoneWyniki.add(wynik.wywolanieId)
    this.zamiaryWywolan.delete(wynik.wywolanieId)
    const wartosciDomyslne = 'wartosciDomyslne' in zamiar ? zamiar.wartosciDomyslne : []
    const aktualizacjaKontekstu = { oczekujacaAkcja: null, oczekujaceDoprecyzowanie: null, wartosciDomyslne }
    if (wynik.status !== 'wykonane') return { typ: 'odpowiedz', tresc: 'Nie udało mi się zapisać tej zmiany.', aktualizacjaKontekstu }
    if (zamiar.typ === 'odczytaj_zadania' || zamiar.typ === 'wyszukaj_zadania' || zamiar.typ === 'znajdz_do_edycji' || zamiar.typ === 'znajdz_do_usuniecia') {
      const znalezione = Array.isArray(wynik.dane) ? wynik.dane.filter((element): element is { id: string; tytul: string } => Boolean(element && typeof element === 'object' && typeof (element as { id?: unknown }).id === 'string' && typeof (element as { tytul?: unknown }).tytul === 'string')) : []
      if (zamiar.typ === 'odczytaj_zadania') return { typ: 'odpowiedz', tresc: znalezione.length ? `${zamiar.okreslenie.charAt(0).toLocaleUpperCase('pl-PL') + zamiar.okreslenie.slice(1)} masz: ${znalezione.map(({ tytul }) => tytul).join(', ')}.` : `${zamiar.okreslenie.charAt(0).toLocaleUpperCase('pl-PL') + zamiar.okreslenie.slice(1)} nie masz zapisanych zadań.`, aktualizacjaKontekstu }
      if (zamiar.typ === 'wyszukaj_zadania') return { typ: 'odpowiedz', tresc: znalezione.length === 0 ? `Nie znalazłem zadania o „${zamiar.fraza}”.` : znalezione.length === 1 ? `Znalazłem „${znalezione[0].tytul}”.` : `Znalazłem ${znalezione.length} podobne zadania: ${znalezione.map(({ tytul }) => tytul).join(', ')}.`, aktualizacjaKontekstu }
      if (znalezione.length === 0) return { typ: 'odpowiedz', tresc: `Nie znalazłem zadania o „${zamiar.fraza}”.`, aktualizacjaKontekstu }
      if (znalezione.length > 1) return this.pytanie({ intencja: zamiar.typ === 'znajdz_do_edycji' ? 'edytuj_zadanie' : 'usun_zadanie', brakujacePola: ['encja'], zebrane: { fraza: zamiar.fraza, termin: zamiar.typ === 'znajdz_do_edycji' ? zamiar.data : undefined, okreslenieCzasu: zamiar.typ === 'znajdz_do_edycji' ? zamiar.okreslenie : undefined, kandydaci: znalezione.map(({ id, tytul }) => ({ typ: 'zadanie', id, etykieta: tytul })) } })
      return zamiar.typ === 'znajdz_do_edycji'
        ? this.wywolajZadanie({ typ: 'edytuj_zadanie', id: znalezione[0].id, tytul: znalezione[0].tytul, data: zamiar.data, okreslenie: zamiar.okreslenie })
        : this.wywolajZadanie({ typ: 'usun_zadanie', id: znalezione[0].id, tytul: znalezione[0].tytul })
    }
    if (zamiar.typ === 'edytuj_zadanie') return { typ: 'odpowiedz', tresc: `Gotowe. Przeniosłem „${zamiar.tytul}” na ${zamiar.okreslenie}.`, aktualizacjaKontekstu }
    if (zamiar.typ === 'usun_zadanie') return { typ: 'odpowiedz', tresc: `Gotowe. Usunąłem „${zamiar.tytul}”.`, aktualizacjaKontekstu }
    if (zamiar.typ === 'usun_zadania_masowo') return { typ: 'odpowiedz', tresc: 'Gotowe. Usunąłem zadania z tego tygodnia.', aktualizacjaKontekstu }
    if (zamiar.typ === 'utworz_przypomnienie') return { typ: 'odpowiedz', tresc: `Jasne, dodałem „${zamiar.tytul}” na ${zamiar.okreslenieCzasu}.`, wartosciDomyslne: zamiar.wartosciDomyslne, aktualizacjaKontekstu }
    if (zamiar.sposob === 'poprzedni_termin') return { typ: 'odpowiedz', tresc: `Jasne, przywróciłem poprzedni termin „${zamiar.tytul}”.`, aktualizacjaKontekstu }
    return { typ: 'odpowiedz', tresc: `Jasne, przełożyłem „${zamiar.tytul}” na ${zamiar.okreslenieCzasu}.`, wartosciDomyslne: zamiar.wartosciDomyslne, aktualizacjaKontekstu }
  }
}
