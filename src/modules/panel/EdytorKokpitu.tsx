import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Komunikat, ModalPotwierdzenia } from '../../components/Interfejs'
import { PoleLiczbowe } from '../../components/PoleLiczbowe'
import { katalogBlokow, definicjaBloku, domyslnyUklad, nowyBlok, odczytajKokpit, poprawnaPlansza, profileKokpitu, sprawdzPolozenie, uporzadkujPlansze, widokiKokpitu, znajdzMiejsce } from '../../domain/kokpit'
import type { BlokKokpitu, KonfiguracjaKokpitu, PlanszaKokpitu, ProfilKokpitu, TypBlokuKokpitu, UkladKokpitu } from '../../domain/kokpit'
import { useObslugaWstecz } from '../../platform/obslugaWstecz'
import { KonfiguratorBloku, SuwakKokpitu } from './KonfiguratorBloku'
import { RendererUkladu } from './RendererUkladu'

type Historia = { wczesniej: KonfiguracjaKokpitu[]; biezaca: KonfiguracjaKokpitu; pozniej: KonfiguracjaKokpitu[] }
type Przeciaganie = { blok: BlokKokpitu; id: number; x: number; y: number; krokX: number; krokY: number; rozmiar: boolean }

function EdytujSiatke({ plansza, zmien, zglos }: { plansza: PlanszaKokpitu; zmien: (plansza: PlanszaKokpitu) => void; zglos: (tekst: string) => void }) {
  const [kolumny, ustawKolumny] = useState(String(plansza.kolumny))
  const [wiersze, ustawWiersze] = useState(String(plansza.wiersze))
  const [propozycja, ustawPropozycje] = useState<PlanszaKokpitu>()

  return <div className="kokpit__pola">
    <PoleLiczbowe etykieta="Kolumny" min={2} max={16} krok={1} wymagane wartosc={kolumny} zmien={ustawKolumny} />
    <PoleLiczbowe etykieta="Wiersze" min={1} max={12} krok={1} wymagane wartosc={wiersze} zmien={ustawWiersze} />
    <button type="button" className="przycisk" onClick={() => {
      const nowa = { ...plansza, kolumny: Number(kolumny), wiersze: Number(wiersze) }
      if (!Number.isInteger(nowa.kolumny) || nowa.kolumny < 2 || nowa.kolumny > 16
        || !Number.isInteger(nowa.wiersze) || nowa.wiersze < 1 || nowa.wiersze > 12) {
        zglos('Wybierz 2–16 kolumn i 1–12 wierszy.')
        return
      }
      if (poprawnaPlansza(nowa)) zmien(nowa)
      else {
        const uporzadkowana = uporzadkujPlansze(nowa)
        if (uporzadkowana) ustawPropozycje(uporzadkowana)
        else zglos('Bloki nie mieszczą się po uporządkowaniu. Powiększ siatkę albo zmniejsz bloki.')
      }
    }}>Zastosuj siatkę</button>
    {propozycja && <ModalPotwierdzenia tytul="Uporządkować bloki?" opis="Zmiana siatki wymaga przeniesienia części bloków."
      anuluj={() => ustawPropozycje(undefined)} potwierdz={() => { zmien(propozycja); ustawPropozycje(undefined) }} />}
  </div>
}

export function EdytorKokpitu({ konfiguracja, profil: profilPoczatkowy, widok: widokPoczatkowy, numer, wyborProfilu, ustawWyborProfilu, zapisz, zamknij }: {
  konfiguracja: KonfiguracjaKokpitu; profil: ProfilKokpitu; widok: keyof typeof widokiKokpitu; numer: number
  wyborProfilu: ProfilKokpitu | 'auto'; ustawWyborProfilu: (profil: ProfilKokpitu | 'auto') => void
  zapisz: (nowa: KonfiguracjaKokpitu) => Promise<void>; zamknij: () => void
}) {
  const [historia, ustawHistorie] = useState<Historia>({ wczesniej: [], biezaca: konfiguracja, pozniej: [] })
  const [profil, ustawProfil] = useState(profilPoczatkowy)
  const [profilUrzadzenia, ustawProfilUrzadzenia] = useState(wyborProfilu)
  const [zrodloProfilu, ustawZrodloProfilu] = useState<ProfilKokpitu>('komputer')
  const [widok, ustawWidok] = useState(widokPoczatkowy)
  const [indeks, ustawIndeks] = useState(widokPoczatkowy === 'plansze' ? numer : 0)
  const [typ, ustawTyp] = useState<TypBlokuKokpitu>('zegar')
  const [wybranyId, ustawWybrany] = useState<string>()
  const [podglad, ustawPodglad] = useState<{ blok: BlokKokpitu; poprawny: boolean }>()
  const [blad, ustawBlad] = useState('')
  const [anulowanie, ustawAnulowanie] = useState(false)
  const [zapisuje, ustawZapisuje] = useState(false)
  const [kopia, ustawKopie] = useState<PlanszaKokpitu>()
  const gest = useRef<Przeciaganie | undefined>(undefined)
  const biezaca = historia.biezaca
  const uklad = biezaca.profile[profil] ?? domyslnyUklad(profil)
  const klucz = widok === 'plansze' ? 'plansze' : 'sekcje'
  const zestaw = uklad[klucz]
  const numerPlanszy = Math.min(indeks, zestaw.length - 1)
  const plansza = zestaw[numerPlanszy]
  const wybrany = plansza.bloki.find(({ id }) => id === wybranyId)
  const brudny = historia.wczesniej.length > 0 || profilUrzadzenia !== wyborProfilu

  useEffect(() => {
    if (!brudny) return
    const ostrzez = (zdarzenie: BeforeUnloadEvent) => { zdarzenie.preventDefault(); zdarzenie.returnValue = '' }
    window.addEventListener('beforeunload', ostrzez)
    return () => window.removeEventListener('beforeunload', ostrzez)
  }, [brudny])

  const anuluj = () => {
    if (zapisuje) return
    if (brudny) ustawAnulowanie(true)
    else zamknij()
  }
  useObslugaWstecz(!anulowanie, anuluj, 30)

  function zmien(nowa: KonfiguracjaKokpitu) {
    ustawBlad('')
    ustawHistorie(({ wczesniej, biezaca }) => ({ wczesniej: [...wczesniej.slice(-59), biezaca], biezaca: nowa, pozniej: [] }))
  }
  const zmienUklad = (nowy: UkladKokpitu) => zmien({ ...biezaca, profile: { ...biezaca.profile, [profil]: nowy } })
  const zmienZestaw = (nowy: PlanszaKokpitu[]) => zmienUklad({ ...uklad, [klucz]: nowy })
  const zmienPlansze = (nowa: PlanszaKokpitu) => zmienZestaw(zestaw.map((element) => element.id === plansza.id ? nowa : element))
  function zmienBlok(blok: BlokKokpitu) {
    if (!sprawdzPolozenie(plansza, blok)) { ustawBlad('Blok koliduje z innym blokiem albo wychodzi poza dozwolony obszar.'); return }
    zmienPlansze({ ...plansza, bloki: plansza.bloki.map((element) => element.id === blok.id ? blok : element) })
  }
  function dodajBlok(blok: BlokKokpitu) {
    const nowy = znajdzMiejsce(plansza, blok)
    if (!nowy) { ustawBlad('Brakuje miejsca na blok. Powiększ siatkę lub zwolnij miejsce.'); return }
    zmienPlansze({ ...plansza, bloki: [...plansza.bloki, nowy] })
    ustawWybrany(nowy.id)
  }
  function dodajPlansze(zrodlo?: PlanszaKokpitu) {
    if (zestaw.length >= 20) return
    const nowa = { ...structuredClone(zrodlo ?? plansza), id: crypto.randomUUID(),
      nazwa: zrodlo ? `Kopia ${zrodlo.nazwa}`.slice(0, 80) : `${widok === 'plansze' ? 'Plansza' : 'Sekcja'} ${zestaw.length + 1}`,
      bloki: zrodlo ? structuredClone(zrodlo.bloki) : [] }
    zmienZestaw([...zestaw, nowa])
    ustawIndeks(zestaw.length)
  }
  function przesunPlansze(kierunek: number) {
    const cel = numerPlanszy + kierunek
    if (cel < 0 || cel >= zestaw.length) return
    const nowy = [...zestaw]
    ;[nowy[numerPlanszy], nowy[cel]] = [nowy[cel], nowy[numerPlanszy]]
    zmienZestaw(nowy)
    ustawIndeks(cel)
  }
  function zacznij(zdarzenie: PointerEvent<HTMLButtonElement>, blok: BlokKokpitu, rozmiar: boolean) {
    if (zdarzenie.button !== 0 || gest.current) return
    const siatka = zdarzenie.currentTarget.closest('.kokpit__siatka')?.getBoundingClientRect()
    if (!siatka) return
    gest.current = { blok, rozmiar, id: zdarzenie.pointerId, x: zdarzenie.clientX, y: zdarzenie.clientY,
      krokX: (siatka.width + plansza.odstep) / plansza.kolumny, krokY: (siatka.height + plansza.odstep) / plansza.wiersze }
    zdarzenie.currentTarget.setPointerCapture(zdarzenie.pointerId)
    ustawWybrany(blok.id)
  }
  function celGestu(zdarzenie: PointerEvent) {
    const zapis = gest.current
    if (!zapis || zapis.id !== zdarzenie.pointerId) return
    const dx = Math.round((zdarzenie.clientX - zapis.x) / zapis.krokX)
    const dy = Math.round((zdarzenie.clientY - zapis.y) / zapis.krokY)
    const { blok } = zapis
    return zapis.rozmiar ? { ...blok, szerokosc: blok.szerokosc + dx, wysokosc: blok.wysokosc + dy }
      : { ...blok, x: blok.x + dx, y: blok.y + dy }
  }
  function uchwyt(blok: BlokKokpitu, rozmiar: boolean) {
    const etykieta = rozmiar ? 'Zmień rozmiar' : 'Przesuń'
    return <button type="button" className="przycisk-ikona kokpit__uchwyt" aria-label={`${etykieta} blok ${definicjaBloku(blok.typ)?.nazwa ?? blok.typ}`}
      onPointerDown={(zdarzenie) => zacznij(zdarzenie, blok, rozmiar)}
      onPointerMove={(zdarzenie) => {
        const cel = celGestu(zdarzenie)
        if (cel) ustawPodglad({ blok: cel, poprawny: sprawdzPolozenie(plansza, cel) })
      }}
      onPointerUp={(zdarzenie) => {
        const cel = celGestu(zdarzenie)
        const przed = gest.current?.blok
        gest.current = undefined
        ustawPodglad(undefined)
        if (cel && przed && (['x', 'y', 'szerokosc', 'wysokosc'] as const).some((klucz) => cel[klucz] !== przed[klucz])) zmienBlok(cel)
      }}
      onPointerCancel={() => { gest.current = undefined; ustawPodglad(undefined) }}
      onClick={() => ustawWybrany(blok.id)}>{rozmiar ? '⤡' : '✥'}</button>
  }

  return <section className="kokpit__edytor" aria-label="Edytor kokpitu">
    <header className="kokpit__edycja-pasek">
      <h2>Edytuj kokpit</h2>
      <button type="button" className="przycisk" disabled={!historia.wczesniej.length || zapisuje} onClick={() => ustawHistorie(({ wczesniej, biezaca, pozniej }) => ({
        wczesniej: wczesniej.slice(0, -1), biezaca: wczesniej.at(-1)!, pozniej: [biezaca, ...pozniej],
      }))}>Cofnij</button>
      <button type="button" className="przycisk" disabled={!historia.pozniej.length || zapisuje} onClick={() => ustawHistorie(({ wczesniej, biezaca, pozniej }) => ({
        wczesniej: [...wczesniej, biezaca], biezaca: pozniej[0], pozniej: pozniej.slice(1),
      }))}>Ponów</button>
      <button type="button" className="przycisk przycisk--glowny" disabled={!brudny || zapisuje} onClick={async () => {
        const poprawna = odczytajKokpit(biezaca)
        if (!poprawna) { ustawBlad('Sprawdź nazwy, wartości pól i rozmieszczenie bloków.'); return }
        ustawZapisuje(true)
        try {
          if (historia.wczesniej.length) await zapisz(poprawna)
          ustawWyborProfilu(profilUrzadzenia)
          zamknij()
        }
        catch { ustawBlad('Nie udało się zapisać konfiguracji. Zmiany nadal są w edytorze.'); ustawZapisuje(false) }
      }}>Zapisz</button>
      <button type="button" className="przycisk" disabled={zapisuje} onClick={anuluj}>Anuluj</button>
    </header>
    {anulowanie && <ModalPotwierdzenia tytul="Odrzucić zmiany?" opis="Ostatnia zapisana konfiguracja zostanie zachowana."
      anuluj={() => ustawAnulowanie(false)} potwierdz={zamknij} />}
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <fieldset disabled={zapisuje} className="kokpit__ustawienia">
      <legend>Układ i preferencje</legend>
      <div className="kokpit__pola">
        <label>Profil tego urządzenia<select value={profilUrzadzenia} onChange={(zdarzenie) => ustawProfilUrzadzenia(zdarzenie.target.value as typeof profilUrzadzenia)}>
          <option value="auto">Automatycznie wg ekranu</option>{Object.entries(profileKokpitu).map(([id, nazwa]) => <option key={id} value={id}>{nazwa}</option>)}
        </select></label>
        <label>Profil edytowany<select value={profil} onChange={(zdarzenie) => { ustawProfil(zdarzenie.target.value as ProfilKokpitu); ustawIndeks(0) }}>
          {Object.entries(profileKokpitu).map(([id, nazwa]) => <option key={id} value={id}>{nazwa}</option>)}
        </select></label>
        <label>Kopiuj układ z profilu<select value={zrodloProfilu} onChange={(zdarzenie) => ustawZrodloProfilu(zdarzenie.target.value as ProfilKokpitu)}>
          {Object.entries(profileKokpitu).map(([id, nazwa]) => <option key={id} value={id}>{nazwa}</option>)}
        </select></label>
        <button type="button" className="przycisk" disabled={zrodloProfilu === profil} onClick={() => { zmienUklad(structuredClone(biezaca.profile[zrodloProfilu] ?? domyslnyUklad(zrodloProfilu))); ustawIndeks(0) }}>Kopiuj do edytowanego profilu</button>
        <button type="button" className="przycisk" onClick={() => { zmienUklad(domyslnyUklad(profil)); ustawIndeks(0) }}>Przywróć domyślny profil</button>
        <label>Widok edytowany<select value={widok} onChange={(zdarzenie) => { ustawWidok(zdarzenie.target.value as typeof widok); ustawIndeks(0) }}>
          {Object.entries(widokiKokpitu).map(([id, nazwa]) => <option key={id} value={id}>{nazwa}</option>)}
        </select></label>
        <label>Widok startowy<select value={biezaca.start} onChange={(zdarzenie) => zmien({ ...biezaca, start: zdarzenie.target.value as typeof biezaca.start, ostatni: widok })}>
          <option value="plansze">Widok plansz</option><option value="ciagly">Widok ciągły</option><option value="ostatni">Ostatnio używany</option>
        </select></label>
        <label>{widok === 'plansze' ? 'Plansza' : 'Sekcja'}<select value={numerPlanszy} onChange={(zdarzenie) => ustawIndeks(Number(zdarzenie.target.value))}>
          {zestaw.map((element, pozycja) => <option key={element.id} value={pozycja}>{element.nazwa}</option>)}
        </select></label>
        <label>Nazwa<input maxLength={80} value={plansza.nazwa} onChange={(zdarzenie) => zmienPlansze({ ...plansza, nazwa: zdarzenie.target.value })} /></label>
        <label>Ikona<select value={plansza.ikona} onChange={(zdarzenie) => zmienPlansze({ ...plansza, ikona: zdarzenie.target.value as PlanszaKokpitu['ikona'] })}>
          {['◈', '⌂', '☀', '◷', '★', '▦'].map((ikona) => <option key={ikona}>{ikona}</option>)}
        </select></label>
        {widok === 'ciagly' && <>
          <label>Wysokość sekcji początkowej<select value={uklad.wysokosc} onChange={(zdarzenie) => zmienUklad({ ...uklad, wysokosc: zdarzenie.target.value as UkladKokpitu['wysokosc'] })}>
            <option value="auto">Automatyczna</option><option value="procent">Procent ekranu</option><option value="pelna">Pełny ekran</option><option value="piksele">Piksele</option>
          </select></label>
          {uklad.wysokosc === 'procent' && <SuwakKokpitu etykieta="Wysokość (%)" min={25} max={100} wartosc={uklad.wysokoscProcent} zmien={(wysokoscProcent) => zmienUklad({ ...uklad, wysokoscProcent })} />}
          {uklad.wysokosc === 'piksele' && <SuwakKokpitu etykieta="Wysokość (px)" min={160} max={1800} wartosc={uklad.wysokoscPx} zmien={(wysokoscPx) => zmienUklad({ ...uklad, wysokoscPx })} />}
        </>}
      </div>
      <details><summary>Nawigacja i pełny ekran</summary><div className="kokpit__pola">
        <label>Pasek plansz<select value={biezaca.pasek} onChange={(zdarzenie) => zmien({ ...biezaca, pasek: zdarzenie.target.value as typeof biezaca.pasek })}>
          <option value="zawsze">Zawsze widoczny</option><option value="auto">Automatycznie ukrywany</option><option value="ukryty">Ukryty</option>
        </select></label>
        <label>Styl paska<select value={biezaca.stylPaska} onChange={(zdarzenie) => zmien({ ...biezaca, stylPaska: zdarzenie.target.value as typeof biezaca.stylPaska })}>
          <option value="numery">Numery</option><option value="ikony">Ikony</option><option value="nazwy">Ikony i nazwy</option>
        </select></label>
        {biezaca.pasek === 'auto' && <label>Ukryj po<select value={biezaca.ukryjPo} onChange={(zdarzenie) => zmien({ ...biezaca, ukryjPo: Number(zdarzenie.target.value) as typeof biezaca.ukryjPo })}>
          {[3, 5, 10, 15, 30].map((czas) => <option key={czas} value={czas}>{czas} s</option>)}
        </select></label>}
        <label><input type="checkbox" checked={biezaca.interwal > 0} onChange={(zdarzenie) => zmien({ ...biezaca, interwal: zdarzenie.target.checked ? 15 : 0 })} /> Automatyczna zmiana plansz</label>
        {biezaca.interwal > 0 && <SuwakKokpitu etykieta="Interwał (s)" min={10} max={600} wartosc={biezaca.interwal} zmien={(interwal) => zmien({ ...biezaca, interwal })} />}
        <label><input type="checkbox" checked={biezaca.immersja} onChange={(zdarzenie) => zmien({ ...biezaca, immersja: zdarzenie.target.checked })} /> Ukryj paski systemowe Androida w pełnym ekranie</label>
      </div></details>
      <div className="kokpit__akcje">
        <button type="button" className="przycisk" onClick={() => dodajPlansze()} disabled={zestaw.length >= 20}>Dodaj pustą</button>
        <button type="button" className="przycisk" onClick={() => dodajPlansze(plansza)} disabled={zestaw.length >= 20}>Duplikuj układ</button>
        <button type="button" className="przycisk" onClick={() => ustawKopie(plansza)}>Kopiuj układ</button>
        <button type="button" className="przycisk" disabled={!kopia} onClick={() => kopia && dodajPlansze(kopia)}>Wklej jako nową</button>
        <button type="button" className="przycisk" disabled={numerPlanszy === 0} onClick={() => przesunPlansze(-1)}>Przenieś wcześniej</button>
        <button type="button" className="przycisk" disabled={numerPlanszy === zestaw.length - 1} onClick={() => przesunPlansze(1)}>Przenieś później</button>
        <button type="button" className="przycisk" disabled={zestaw.length === 1} onClick={() => zmienZestaw(zestaw.filter(({ id }) => id !== plansza.id))}>Usuń z układu</button>
        <button type="button" className="przycisk" onClick={() => { zmienZestaw(domyslnyUklad(profil)[klucz]); ustawIndeks(0) }}>Przywróć domyślny układ</button>
      </div>
      <EdytujSiatke key={`${plansza.id}:${plansza.kolumny}:${plansza.wiersze}`} plansza={plansza} zmien={zmienPlansze} zglos={ustawBlad} />
      <SuwakKokpitu etykieta="Odstęp między blokami" min={0} max={24} wartosc={plansza.odstep} zmien={(odstep) => zmienPlansze({ ...plansza, odstep })} />
      <div className="kokpit__akcje">
        <label>Biblioteka bloków<select value={typ} onChange={(zdarzenie) => ustawTyp(zdarzenie.target.value as TypBlokuKokpitu)}>
          {Object.entries(katalogBlokow).map(([id, element]) => <option key={id} value={id}>{element.kategoria} · {element.nazwa}</option>)}
        </select></label>
        <button type="button" className="przycisk" onClick={() => dodajBlok(nowyBlok(typ))}>Dodaj blok</button>
      </div>
      <RendererUkladu plansza={plansza} data="" tryb="publiczny" etykieta="Siatka edycji" podglad={podglad} narzedzia={(blok) => <div className="kokpit__akcje">
        {uchwyt(blok, false)}{uchwyt(blok, true)}
        <button type="button" className="przycisk-ikona" aria-label={`Ustawienia bloku ${definicjaBloku(blok.typ)?.nazwa ?? blok.typ}`} onClick={() => ustawWybrany(blok.id)}>⚙</button>
      </div>} />
      {podglad && <p role="status">{podglad.poprawny ? 'Wolne miejsce' : 'Kolizja, zbyt mały rozmiar lub granica siatki'}</p>}
      {wybrany && <KonfiguratorBloku key={wybrany.id} blok={wybrany} zmien={zmienBlok} duplikuj={() => dodajBlok({ ...wybrany, id: crypto.randomUUID() })}
        usun={() => { zmienPlansze({ ...plansza, bloki: plansza.bloki.filter(({ id }) => id !== wybrany.id) }); ustawWybrany(undefined) }} />}
    </fieldset>
  </section>
}
