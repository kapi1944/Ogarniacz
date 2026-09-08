import { dzisiajIso } from '../../domain/fabryki'
import { KontekstRozmowyEcho } from './KontekstRozmowyEcho'
import { pobierzKontekstPlanowaniaEcho } from './KontekstPlanowaniaEcho'
import { LokalnySemantycznyProviderEcho } from './LokalnySemantycznyProviderEcho'
import { LokalnyModelProviderEcho } from './LokalnyModelProviderEcho'
import { instrukcjaTrybuRozmowyEcho, KonfiguracjaRozmowyEcho, rozpoznajZmianeAutomatycznegoOdczytuEcho, rozpoznajZmianeTempaEcho, rozpoznajZmianeTrybuRozmowyEcho } from './KonfiguracjaRozmowyEcho'
import { rozpoznajTrwalaPreferencjeEcho } from './PamiecPreferencjiEcho'
import { PolitykaPamieciEcho } from './PolitykaDzialanEcho'
import { najwyzszeRyzykoPlanu, opisPlanuDlaUzytkownika, utworzPlanWykonaniaEcho } from './PlanWykonaniaEcho'
import { RejestrNarzedziEcho, WykonawcaNarzedziEcho, utworzDomyslnyRejestrNarzedziEcho } from './NarzedziaEcho'
import type { AkcjaDoPotwierdzeniaEcho, DecyzjaModeluEcho, KontekstCzasuEcho, KontekstPlanowaniaEcho, MagazynPamieciEcho, OdpowiedzEcho, ProviderModeluEcho, StanPracyEcho, TrybRozmowyEcho, ZadanieModeluEcho, ZrodloWejsciaEcho } from './typyEcho'

const INSTRUKCJE_SYSTEMOWE = [
  'Jesteś Echo, centralnym osobistym asystentem Ogarniacza. Rozmawiaj po polsku, naturalnie i rzeczowo. Styl odpowiedzi wynika z wybranego trybu rozmowy.',
  'Nie zgaduj danych użytkownika. Pobieraj tylko potrzebne dane za pomocą dostępnych narzędzi.',
  'Wyraźnie rozróżniaj fakty z danych, preferencje użytkownika, wartości wyliczone, założenia i sugestie. Nie zapisuj sugestii ani założeń jako faktów bez akceptacji.',
  'Przy niejasnym czasie najpierw zaproponuj wartość wynikającą z grafiku, planu lub jawnej preferencji. Zadaj jedno krótkie pytanie tylko wtedy, gdy brak wpływa na rezultat.',
  'Przed zmianą kolidującą z istniejącym planem wskaż konflikt i zaproponuj najmniej ingerujący wolny termin. Nie przesuwaj istniejących danych po cichu.',
  'Nie znasz implementacji bazy i nie możesz wykonywać kodu, SQL ani poleceń systemowych.',
  'Jeśli brakuje istotnej informacji, zadaj jedno naturalne pytanie. Jeśli danych nie ma, powiedz wprost, że ich nie ma.',
  'Możesz proponować działania, ale decyzję o wykonaniu i potwierdzeniu podejmuje warstwa polityki.',
]

export interface OpcjeAgentaEcho {
  provider?: ProviderModeluEcho
  kontekst?: KontekstRozmowyEcho
  rejestr?: RejestrNarzedziEcho
  wykonawca?: WykonawcaNarzedziEcho
  limitKrokow?: number
  limitCzasuMs?: number
  pobierzCzas?: () => KontekstCzasuEcho
  onZmianaStanu?: (stan: StanPracyEcho) => void
  magazynPamieci?: MagazynPamieciEcho
  pamiecPreferencjiWlaczona?: boolean
  konfiguracjaRozmowy?: KonfiguracjaRozmowyEcho
  ustawAutomatycznyOdczyt?: (wlaczony: boolean) => Promise<void>
  ustawTrybRozmowy?: (trybRozmowy: TrybRozmowyEcho) => Promise<void>
  pobierzKontekstPlanowania?: (kontekstCzasu: KontekstCzasuEcho, preferencje: readonly import('./typyEcho').KandydatPamieciEcho[]) => Promise<KontekstPlanowaniaEcho>
}

function pobierzBiezacyCzas(): KontekstCzasuEcho {
  const teraz = new Date()
  return {
    teraz: teraz.toISOString(),
    dataLokalna: dzisiajIso(teraz),
    strefaCzasowa: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw',
  }
}

function dataDniaTygodnia(data: string, dzien: number): string {
  const [rok, miesiac, dzienMiesiaca] = data.split('-').map(Number)
  const teraz = new Date(Date.UTC(rok, miesiac - 1, dzienMiesiaca))
  const przesuniecie = (dzien - teraz.getUTCDay() + 7) % 7 || 7
  teraz.setUTCDate(teraz.getUTCDate() + przesuniecie)
  return teraz.toISOString().slice(0, 10)
}

function korektaOczekujacejAkcji(tekst: string, akcja: AkcjaDoPotwierdzeniaEcho, dataLokalna: string): AkcjaDoPotwierdzeniaEcho | undefined {
  const argumenty = structuredClone(akcja.wywolanie.argumenty)
  if (!argumenty || typeof argumenty !== 'object') return undefined
  const uproszczony = tekst.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
  const dni = new Map([['poniedzialek', 1], ['wtorek', 2], ['sroda', 3], ['czwartek', 4], ['piatek', 5], ['sobota', 6], ['sobote', 6], ['niedziela', 0], ['niedziele', 0]])
  const znaleziony = [...dni].find(([nazwa]) => uproszczony.split(/[^a-z]+/).includes(nazwa))
  const data = znaleziony ? dataDniaTygodnia(dataLokalna, znaleziony[1]) : undefined
  if (!data) return undefined
  const dane = argumenty as Record<string, unknown>
  if ('termin' in dane || akcja.wywolanie.nazwa === 'create_task') dane.termin = data
  else if ('zmiany' in dane && dane.zmiany && typeof dane.zmiany === 'object') (dane.zmiany as Record<string, unknown>).termin = data
  else return undefined
  return { ...akcja, wywolanie: { ...akcja.wywolanie, id: crypto.randomUUID(), argumenty: dane }, opis: `${akcja.opis} Termin: ${data}.` }
}

function podsumujAkcje(akcja: AkcjaDoPotwierdzeniaEcho): string {
  if (akcja.plan) return opisPlanuDlaUzytkownika(akcja.plan)
  const argumenty = akcja.wywolanie.argumenty && typeof akcja.wywolanie.argumenty === 'object' ? akcja.wywolanie.argumenty as Record<string, unknown> : {}
  const tytul = typeof argumenty.tytul === 'string' ? ` „${argumenty.tytul}”` : ''
  const termin = typeof argumenty.termin === 'string' ? `, termin: ${argumenty.termin}` : ''
  const czas = typeof argumenty.czas === 'string' ? `, czas: ${new Date(argumenty.czas).toLocaleString('pl-PL')}` : ''
  return `${akcja.opis}${tytul}${termin}${czas}. Zapisać?`
}

export class AgentEcho {
  readonly provider: ProviderModeluEcho
  readonly kontekst: KontekstRozmowyEcho
  readonly rejestr: RejestrNarzedziEcho
  readonly wykonawca: WykonawcaNarzedziEcho
  private readonly limitKrokow: number
  private readonly limitCzasuMs: number
  private readonly pobierzCzas: () => KontekstCzasuEcho
  private readonly onZmianaStanu?: (stan: StanPracyEcho) => void
  private readonly magazynPamieci?: MagazynPamieciEcho
  private readonly pamiecPreferencjiWlaczona: boolean
  private readonly politykaPamieci = new PolitykaPamieciEcho()
  readonly konfiguracjaRozmowy: KonfiguracjaRozmowyEcho
  private readonly ustawAutomatycznyOdczyt?: (wlaczony: boolean) => Promise<void>
  private readonly zapiszTrybRozmowy?: (trybRozmowy: TrybRozmowyEcho) => Promise<void>
  private readonly pobierzKontekstPlanowania: NonNullable<OpcjeAgentaEcho['pobierzKontekstPlanowania']>
  private oczekujacaAkcja?: AkcjaDoPotwierdzeniaEcho
  private wynikiBiezacejTury: import('./typyEcho').WynikNarzedziaEcho[] = []

  constructor(opcje: OpcjeAgentaEcho = {}) {
    this.provider = opcje.provider ?? (import.meta.env.VITE_ECHO_MODEL && import.meta.env.VITE_ECHO_MODEL_URL
      ? new LokalnyModelProviderEcho(import.meta.env.VITE_ECHO_MODEL_URL, import.meta.env.VITE_ECHO_MODEL)
      : new LokalnySemantycznyProviderEcho())
    this.kontekst = opcje.kontekst ?? new KontekstRozmowyEcho()
    this.rejestr = opcje.rejestr ?? utworzDomyslnyRejestrNarzedziEcho()
    this.wykonawca = opcje.wykonawca ?? new WykonawcaNarzedziEcho(this.rejestr)
    this.limitKrokow = opcje.limitKrokow ?? 6
    this.limitCzasuMs = opcje.limitCzasuMs ?? 15_000
    this.pobierzCzas = opcje.pobierzCzas ?? pobierzBiezacyCzas
    this.onZmianaStanu = opcje.onZmianaStanu
    this.magazynPamieci = opcje.magazynPamieci
    this.pamiecPreferencjiWlaczona = opcje.pamiecPreferencjiWlaczona ?? true
    this.konfiguracjaRozmowy = opcje.konfiguracjaRozmowy ?? new KonfiguracjaRozmowyEcho()
    this.ustawAutomatycznyOdczyt = opcje.ustawAutomatycznyOdczyt
    this.zapiszTrybRozmowy = opcje.ustawTrybRozmowy
    this.pobierzKontekstPlanowania = opcje.pobierzKontekstPlanowania ?? pobierzKontekstPlanowaniaEcho
  }

  async obsluz(tresc: string, zrodlo: ZrodloWejsciaEcho = 'tekst', sygnalZewnetrzny?: AbortSignal): Promise<OdpowiedzEcho> {
    const oczyszczona = tresc.trim()
    if (!oczyszczona) return this.odpowiedz('Powiedz albo napisz, czym mam się zająć.')
    this.wynikiBiezacejTury = []
    this.onZmianaStanu?.('rozumiem')
    this.kontekst.dodajTure('uzytkownik', oczyszczona)
    this.kontekst.ustawTemat(this.kontekst.migawka().temat ?? (zrodlo === 'stt' ? 'rozmowa głosowa' : 'rozmowa tekstowa'))
    const trybRozmowy = rozpoznajZmianeTrybuRozmowyEcho(oczyszczona)
    if (trybRozmowy) {
      await this.ustawTrybRozmowy(trybRozmowy)
      return this.odpowiedzNaPreferencje(`Ustawiłem tryb rozmowy ${trybRozmowy === 'szybki' ? 'szybki' : 'swobodny'}.`)
    }
    const tempo = rozpoznajZmianeTempaEcho(oczyszczona)
    if (tempo) {
      this.konfiguracjaRozmowy.ustawTempo(tempo)
      return this.odpowiedzNaPreferencje(`Ustawiłem tempo ${tempo === 'szybki' ? 'szybkie' : 'spokojne'}.`)
    }
    const automatycznyOdczyt = rozpoznajZmianeAutomatycznegoOdczytuEcho(oczyszczona)
    if (automatycznyOdczyt !== undefined) {
      if (!this.ustawAutomatycznyOdczyt) return this.odpowiedzNaPreferencje('Nie mogę teraz zmienić ustawienia odczytu odpowiedzi.')
      await this.ustawAutomatycznyOdczyt(automatycznyOdczyt)
      return this.odpowiedzNaPreferencje(automatycznyOdczyt ? 'Będę czytał odpowiedzi na głos.' : 'Będę odpowiadał tylko tekstem.')
    }
    if (this.oczekujacaAkcja && /^(tak|jasne|potwierdzam|zapisz|zgoda)[.!]?$/i.test(oczyszczona)) return this.potwierdz(this.oczekujacaAkcja, sygnalZewnetrzny)
    if (this.oczekujacaAkcja && !this.oczekujacaAkcja.plan) {
      const poprawiona = korektaOczekujacejAkcji(oczyszczona, this.oczekujacaAkcja, this.pobierzCzas().dataLokalna)
      if (poprawiona) {
        this.oczekujacaAkcja = poprawiona
        return { tekst: podsumujAkcje(poprawiona), ryzyko: poprawiona.ryzyko, tryb: this.provider.tryb, wymagaPotwierdzenia: true, akcjaDoPotwierdzenia: structuredClone(poprawiona) }
      }
    }
    const preferencja = rozpoznajTrwalaPreferencjeEcho(oczyszczona)
    if (
      preferencja
      && this.magazynPamieci
      && this.politykaPamieci.czyMoznaZapisac(preferencja.zrodlo, false)
    ) {
      if (!this.pamiecPreferencjiWlaczona) {
        return this.odpowiedzNaPreferencje('Pamięć preferencji jest wyłączona, więc nie zapiszę tej preferencji.')
      }
      await this.magazynPamieci.zapisz(preferencja)
      return this.odpowiedzNaPreferencje(`Zapamiętam tę preferencję: „${preferencja.tresc}”.`)
    }
    const odpowiedz = await this.uruchomPetle(sygnalZewnetrzny)
    this.onZmianaStanu?.('gotowe')
    return odpowiedz
  }

  async potwierdz(akcja: AkcjaDoPotwierdzeniaEcho, sygnalZewnetrzny?: AbortSignal): Promise<OdpowiedzEcho> {
    if (!this.oczekujacaAkcja || this.oczekujacaAkcja.wywolanie.id !== akcja.wywolanie.id) {
      return this.odpowiedz('To potwierdzenie nie jest już aktualne. Powiedz, co mam zrobić ponownie.', 'umiarkowane')
    }
    const oczekujaca = this.oczekujacaAkcja
    const wywolanie = oczekujaca.wywolanie
    this.oczekujacaAkcja = undefined
    this.onZmianaStanu?.('wykonuje')
    if (oczekujaca.plan) {
      const odpowiedzCzesciowa = await this.wykonajPlan(oczekujaca.plan, true)
      if (odpowiedzCzesciowa) return odpowiedzCzesciowa
      return this.uruchomPetle(sygnalZewnetrzny)
    }
    const wynik = await this.wykonawca.wykonaj(wywolanie, true)
    this.wynikiBiezacejTury = [wynik]
    this.kontekst.dodajWynikNarzedzia(wynik)
    if (wynik.status !== 'wykonane') return this.odpowiedz('Nie udało się bezpiecznie wykonać tej zmiany.', akcja.ryzyko)
    this.kontekst.ustawOstatniaAkcje(wywolanie.nazwa, wywolanie.argumenty)
    this.zapamietajEncjeWyniku(wywolanie.nazwa, wynik.dane)
    return this.uruchomPetle(sygnalZewnetrzny)
  }

  anulujPotwierdzenie(): void {
    this.oczekujacaAkcja = undefined
    this.kontekst.ustawPlanWykonania()
  }

  async ustawTrybRozmowy(trybRozmowy: TrybRozmowyEcho): Promise<void> {
    this.konfiguracjaRozmowy.ustawTrybRozmowy(trybRozmowy)
    await this.zapiszTrybRozmowy?.(trybRozmowy)
  }

  private async zbudujZadanieModelu(): Promise<ZadanieModeluEcho> {
    const pamiecPreferencji = this.pamiecPreferencjiWlaczona && this.magazynPamieci
      ? await this.magazynPamieci.wyszukaj('', 20)
      : []
    const kontekstCzasu = this.pobierzCzas()
    return {
      instrukcjeSystemowe: [...INSTRUKCJE_SYSTEMOWE, instrukcjaTrybuRozmowyEcho(this.konfiguracjaRozmowy.pobierzTrybRozmowy())],
      trybRozmowy: this.konfiguracjaRozmowy.pobierzTrybRozmowy(),
      kontekstCzasu,
      kontekstRozmowy: this.kontekst.migawka(),
      pamiecPreferencji,
      kontekstPlanowania: await this.pobierzKontekstPlanowania(kontekstCzasu, pamiecPreferencji),
      narzedzia: this.rejestr.definicje(),
      wynikiBiezacejTury: [...this.wynikiBiezacejTury],
    }
  }

  private async uruchomPetle(sygnalZewnetrzny?: AbortSignal): Promise<OdpowiedzEcho> {
    try {
      for (let krok = 0; krok < this.limitKrokow; krok += 1) {
        const decyzja = await this.pobierzDecyzje(await this.zbudujZadanieModelu(), sygnalZewnetrzny)
        const gotowa = await this.obsluzDecyzje(decyzja)
        if (gotowa) return gotowa
      }
      return this.odpowiedz('Zatrzymałem tę próbę, bo wymagała zbyt wielu kroków. Spróbujmy ująć cel trochę węziej.')
    } catch (blad) {
      if (blad instanceof DOMException && blad.name === 'AbortError') return this.odpowiedz('Przerwałem tę odpowiedź.')
      return this.odpowiedz(this.wynikiBiezacejTury.length
        ? 'Nie mogę teraz dokończyć tej rozmowy. Sprawdź wyniki wykonanych działań przed ponowieniem prośby.'
        : 'Nie mogę teraz dokończyć tej rozmowy. Twoje dane nie zostały zmienione.')
    }
  }

  private async obsluzDecyzje(decyzja: DecyzjaModeluEcho): Promise<OdpowiedzEcho | undefined> {
    this.kontekst.zastosujAktualizacje(decyzja.aktualizacjaKontekstu)
    if (decyzja.typ === 'odpowiedz' || decyzja.typ === 'pytanie') {
      const tresc = decyzja.tresc.trim() || 'Nie mam jeszcze wystarczających danych, żeby odpowiedzieć.'
      this.kontekst.dodajTure('echo', tresc)
      this.kontekst.ustawNierozwiazanePytanie(decyzja.typ === 'pytanie' ? tresc : undefined)
      return this.odpowiedz(tresc, 'niskie', decyzja.wartosciDomyslne, decyzja.typ === 'pytanie')
    }

    if (decyzja.wywolania.length === 0) return undefined
    if (decyzja.wywolania.length > 1 || this.oczekujacaAkcja?.plan) {
      const cel = [...this.kontekst.migawka().tury].reverse().find((tura) => tura.rola === 'uzytkownik')?.tresc ?? 'Wykonanie polecenia'
      const plan = utworzPlanWykonaniaEcho(cel, decyzja.wywolania, this.rejestr)
      this.kontekst.ustawPlanWykonania(plan)
      this.oczekujacaAkcja = undefined
      if (plan.kroki.some((krok) => krok.wymagaPotwierdzenia)) {
        const akcja: AkcjaDoPotwierdzeniaEcho = {
          wywolanie: decyzja.wywolania[0],
          ryzyko: najwyzszeRyzykoPlanu(plan),
          opis: 'Plan wielokrokowy',
          plan,
        }
        this.oczekujacaAkcja = structuredClone(akcja)
        return { tekst: opisPlanuDlaUzytkownika(plan), ryzyko: akcja.ryzyko, tryb: this.provider.tryb, wymagaPotwierdzenia: true, akcjaDoPotwierdzenia: akcja }
      }
      return this.wykonajPlan(plan, false)
    }
    for (const wywolanie of decyzja.wywolania) {
      this.onZmianaStanu?.('wykonuje')
      const wynik = await this.wykonawca.wykonaj(wywolanie)
      this.wynikiBiezacejTury.push(wynik)
      this.kontekst.dodajWynikNarzedzia(wynik)
      if (wynik.status === 'wymaga_potwierdzenia') {
        const narzedzie = this.rejestr.pobierz(wywolanie.nazwa)
        const akcja: AkcjaDoPotwierdzeniaEcho = { wywolanie, ryzyko: narzedzie?.ryzyko ?? 'wysokie', opis: wynik.komunikat ?? 'Zmiana danych' }
        this.oczekujacaAkcja = structuredClone(akcja)
        return { tekst: podsumujAkcje(akcja), ryzyko: akcja.ryzyko, tryb: this.provider.tryb, wymagaPotwierdzenia: true, akcjaDoPotwierdzenia: akcja }
      }
      if (wynik.status === 'zablokowane') {
        return this.odpowiedz(wynik.komunikat ?? 'Echo nie może wykonać tego działania.')
      }
      if (
        wynik.status === 'wykonane'
        && wywolanie.nazwa === 'current_external_data'
        && wynik.dane
        && typeof wynik.dane === 'object'
      ) {
        const komunikat = (wynik.dane as { komunikat?: unknown }).komunikat
        if (typeof komunikat === 'string') return this.odpowiedz(komunikat)
      }
      if (wynik.status === 'wykonane') {
        this.kontekst.ustawOstatniaAkcje(wywolanie.nazwa, wywolanie.argumenty)
        this.zapamietajEncjeWyniku(wywolanie.nazwa, wynik.dane)
      }
    }
    return undefined
  }

  private async wykonajPlan(plan: import('./typyEcho').PlanWykonaniaEcho, potwierdzone: boolean): Promise<OdpowiedzEcho | undefined> {
    plan.status = 'w_trakcie'
    this.kontekst.ustawPlanWykonania(plan)
    const statusy = new Map<string, import('./typyEcho').KrokPlanuWykonaniaEcho['status']>()
    for (const krok of plan.kroki) {
      const zaleznoscNieudana = krok.zaleznosci.some((id) => statusy.get(id) !== 'wykonany')
      if (zaleznoscNieudana) {
        krok.status = 'pominiety'
        krok.komunikat = 'Pominięto, ponieważ zależny krok nie został wykonany.'
        const wynik = { wywolanieId: krok.id, nazwa: krok.narzedzie, status: 'zablokowane' as const, komunikat: krok.komunikat }
        this.wynikiBiezacejTury.push(wynik)
        this.kontekst.dodajWynikNarzedzia(wynik)
        statusy.set(krok.id, krok.status)
        continue
      }
      this.onZmianaStanu?.('wykonuje')
      const wynik = await this.wykonawca.wykonaj({ id: krok.id, nazwa: krok.narzedzie, argumenty: krok.parametry }, potwierdzone)
      this.wynikiBiezacejTury.push(wynik)
      this.kontekst.dodajWynikNarzedzia(wynik)
      krok.status = wynik.status === 'wykonane' ? 'wykonany' : 'blad'
      krok.komunikat = wynik.komunikat
      statusy.set(krok.id, krok.status)
      if (wynik.status === 'wykonane') {
        this.kontekst.ustawOstatniaAkcje(krok.narzedzie, krok.parametry)
        this.zapamietajEncjeWyniku(krok.narzedzie, wynik.dane)
      }
      this.kontekst.ustawPlanWykonania(plan)
    }
    const wykonane = plan.kroki.filter((krok) => krok.status === 'wykonany')
    const nieudane = plan.kroki.filter((krok) => krok.status === 'blad' || krok.status === 'pominiety')
    plan.status = nieudane.length ? 'czesciowo_wykonany' : 'wykonany'
    this.kontekst.ustawPlanWykonania(plan)
    if (!nieudane.length) return undefined
    const czescWykonana = wykonane.length ? `Wykonałem: ${wykonane.map((krok) => krok.opis).join(', ')}. ` : 'Nie udało się wykonać żadnego kroku. '
    const czescNieudana = `Nie udało się: ${nieudane.map((krok) => `${krok.opis}${krok.komunikat ? ` — ${krok.komunikat}` : ''}`).join(', ')}.`
    return this.odpowiedz(`${czescWykonana}${czescNieudana}`, najwyzszeRyzykoPlanu(plan))
  }

  private async pobierzDecyzje(zadanie: ZadanieModeluEcho, sygnalZewnetrzny?: AbortSignal): Promise<DecyzjaModeluEcho> {
    this.onZmianaStanu?.('rozumiem')
    const kontroler = new AbortController()
    if (sygnalZewnetrzny?.aborted) throw new DOMException('Anulowano', 'AbortError')
    const anuluj = () => kontroler.abort()
    sygnalZewnetrzny?.addEventListener('abort', anuluj, { once: true })
    let licznik: ReturnType<typeof setTimeout> | undefined
    try {
      const limit = new Promise<never>((_rozwiaz, odrzuc) => {
        licznik = setTimeout(() => {
          kontroler.abort()
          odrzuc(new DOMException('Przekroczono czas odpowiedzi modelu', 'AbortError'))
        }, this.limitCzasuMs)
      })
      return await Promise.race([this.provider.odpowiedz(zadanie, kontroler.signal), limit])
    } finally {
      if (licznik) clearTimeout(licznik)
      sygnalZewnetrzny?.removeEventListener('abort', anuluj)
    }
  }

  private odpowiedz(tekst: string, ryzyko: OdpowiedzEcho['ryzyko'] = 'niskie', wartosciDomyslne?: OdpowiedzEcho['wartosciDomyslne'], oczekujeDoprecyzowania = false): OdpowiedzEcho {
    return { tekst, ryzyko, tryb: this.provider.tryb, wartosciDomyslne, oczekujeDoprecyzowania, wyniki: this.wynikiBiezacejTury.length ? [...this.wynikiBiezacejTury] : undefined }
  }

  private odpowiedzNaPreferencje(tekst: string): OdpowiedzEcho {
    this.kontekst.dodajTure('echo', tekst)
    this.onZmianaStanu?.('gotowe')
    return this.odpowiedz(tekst)
  }

  private zapamietajEncjeWyniku(narzedzie: string, dane: unknown): void {
    if (Array.isArray(dane)) {
      if (dane.length === 1) this.zapamietajEncjeWyniku(narzedzie, dane[0])
      return
    }
    if (!dane || typeof dane !== 'object') return
    const wynik = dane as { id?: unknown; tytul?: unknown; typ?: unknown }
    if (typeof wynik.id !== 'string') return
    const typ = narzedzie.includes('reminder') ? 'przypomnienie' : narzedzie.includes('task') ? 'zadanie' : typeof wynik.typ === 'string' ? wynik.typ : undefined
    if (!typ) return
    const obecne = this.kontekst.migawka().ostatnieEncje.filter((encja) => !(encja.typ === typ && encja.id === wynik.id))
    if (narzedzie.startsWith('delete_')) {
      this.kontekst.ustawEncje(obecne)
      return
    }
    this.kontekst.ustawEncje([...obecne, { typ, id: wynik.id, etykieta: typeof wynik.tytul === 'string' ? wynik.tytul : undefined }])
  }
}
