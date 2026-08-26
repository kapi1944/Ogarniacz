import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import {
  Download,
  Eye,
  Palette,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { Komunikat, NaglowekWidoku } from '../../components/Interfejs'
import {
  DOMYSLNA_PERSONALIZACJA,
  PRESETY_MOTYWOW,
  normalizujPersonalizacje,
  zastosujPresetMotywu,
  zastosujProfilRuchu,
  type AnimacjePersonalizacji,
  type KomponentyPersonalizacji,
  type MotywWlasny,
  type PaletaPersonalizacji,
  type PersonalizacjaUI,
  type ProfilRuchu,
} from '../../domain/personalizacja'
import { normalizujUstawienia } from '../../domain/ustawienia'
import type { Ustawienia } from '../../domain/typy'

type Zakladka = 'motyw' | 'kolory' | 'komponenty' | 'interakcje' | 'animacje' | 'podglad'

const ZAKLADKI: { id: Zakladka; etykieta: string }[] = [
  { id: 'motyw', etykieta: 'Motyw' },
  { id: 'kolory', etykieta: 'Kolory' },
  { id: 'komponenty', etykieta: 'Komponenty' },
  { id: 'interakcje', etykieta: 'Interakcje' },
  { id: 'animacje', etykieta: 'Animacje' },
  { id: 'podglad', etykieta: 'Podgląd' },
]

const KOLORY: { key: keyof PaletaPersonalizacji; label: string; grupa: string }[] = [
  { key: 'tlo', label: 'Tło aplikacji', grupa: 'Powierzchnie' },
  { key: 'panel', label: 'Karty / panele', grupa: 'Powierzchnie' },
  { key: 'panel2', label: 'Powierzchnia pomocnicza', grupa: 'Powierzchnie' },
  { key: 'obramowanie', label: 'Obramowanie', grupa: 'Powierzchnie' },
  { key: 'obramowanieMocne', label: 'Mocne obramowanie', grupa: 'Powierzchnie' },
  { key: 'tekst', label: 'Tekst główny', grupa: 'Tekst' },
  { key: 'tekst2', label: 'Tekst drugorzędny', grupa: 'Tekst' },
  { key: 'akcent', label: 'Akcent', grupa: 'Funkcjonalne' },
  { key: 'akcentHover', label: 'Akcent hover', grupa: 'Funkcjonalne' },
  { key: 'akcentJasny', label: 'Tło akcentu', grupa: 'Funkcjonalne' },
  { key: 'focus', label: 'Focus', grupa: 'Funkcjonalne' },
  { key: 'sukces', label: 'Sukces', grupa: 'Statusy' },
  { key: 'sukcesTlo', label: 'Tło sukcesu', grupa: 'Statusy' },
  { key: 'ostrzezenie', label: 'Ostrzeżenie', grupa: 'Statusy' },
  { key: 'ostrzezenieTlo', label: 'Tło ostrzeżenia', grupa: 'Statusy' },
  { key: 'blad', label: 'Błąd', grupa: 'Statusy' },
  { key: 'bladTlo', label: 'Tło błędu', grupa: 'Statusy' },
  { key: 'informacja', label: 'Informacja', grupa: 'Statusy' },
  { key: 'informacjaTlo', label: 'Tło informacji', grupa: 'Statusy' },
  { key: 'sidebar', label: 'Menu boczne', grupa: 'Nawigacja' },
  { key: 'sidebarHover', label: 'Menu hover', grupa: 'Nawigacja' },
  { key: 'sidebarActive', label: 'Menu active', grupa: 'Nawigacja' },
  { key: 'sidebarTekst', label: 'Tekst menu', grupa: 'Nawigacja' },
  { key: 'zadanie', label: 'Zadania', grupa: 'Moduły' },
  { key: 'projekt', label: 'Projekty', grupa: 'Moduły' },
  { key: 'wizyta', label: 'Wizyty', grupa: 'Moduły' },
  { key: 'lek', label: 'Leki', grupa: 'Moduły' },
  { key: 'finanse', label: 'Finanse', grupa: 'Moduły' },
  { key: 'samochod', label: 'Samochód', grupa: 'Moduły' },
  { key: 'przypomnienie', label: 'Przypomnienia', grupa: 'Moduły' },
  { key: 'timeline', label: 'Linia osi czasu', grupa: 'Oś czasu' },
  { key: 'timelineTeraz', label: 'Znacznik „teraz”', grupa: 'Oś czasu' },
]

function kopiujPersonalizacje(value: PersonalizacjaUI): PersonalizacjaUI {
  return normalizujPersonalizacje(JSON.parse(JSON.stringify(value)))
}

function idMotywu(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `motyw-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function EdytorPersonalizacji() {
  const {
    zapisaneUstawienia,
    zapiszUstawienia,
    ustawPodgladUstawien,
    wyczyscPodgladUstawien,
  } = useAplikacja()

  const [szkic, ustawSzkic] = useState<Ustawienia>(() => normalizujUstawienia(zapisaneUstawienia))
  const [zakladka, ustawZakladke] = useState<Zakladka>('motyw')
  const [komunikat, ustawKomunikat] = useState('')
  const [blad, ustawBlad] = useState('')
  const [nazwaMotywu, ustawNazweMotywu] = useState('Mój motyw')
  const [wybranyWlasny, ustawWybranyWlasny] = useState('')

  useEffect(() => {
    ustawSzkic(normalizujUstawienia(zapisaneUstawienia))
  }, [zapisaneUstawienia])

  useEffect(() => () => wyczyscPodgladUstawien(), [wyczyscPodgladUstawien])

  const p = szkic.wyglad.personalizacja
  const grupyKolorow = useMemo(() => [...new Set(KOLORY.map((item) => item.grupa))], [])

  const aktualizuj = (nowe: Ustawienia) => {
    const normalized = normalizujUstawienia(nowe)
    ustawSzkic(normalized)
    ustawPodgladUstawien(normalized)
    ustawKomunikat('')
    ustawBlad('')
  }

  const aktualizujPersonalizacje = (personalizacja: PersonalizacjaUI) => {
    aktualizuj({
      ...szkic,
      wyglad: {
        ...szkic.wyglad,
        personalizacja: normalizujPersonalizacje(personalizacja),
      },
    })
  }

  const ustawPalete = (key: keyof PaletaPersonalizacji, value: string) => {
    aktualizujPersonalizacje({
      ...p,
      preset: 'wlasny',
      uzyjWlasnejPalety: true,
      aktywnyMotywId: undefined,
      paleta: { ...p.paleta, [key]: value },
    })
  }

  const wybierzPreset = (id: string) => {
    if (id === 'bazowy') {
      aktualizuj({
        ...szkic,
        wyglad: {
          ...szkic.wyglad,
          personalizacja: {
            ...kopiujPersonalizacje(DOMYSLNA_PERSONALIZACJA),
            motywyWlasne: p.motywyWlasne,
          },
        },
      })
      return
    }
    const wynik = zastosujPresetMotywu(p, id as Parameters<typeof zastosujPresetMotywu>[1])
    aktualizuj({
      ...szkic,
      wyglad: {
        ...szkic.wyglad,
        motyw: wynik.motyw,
        personalizacja: wynik.personalizacja,
      },
    })
  }

  const ustawProfil = (profil: ProfilRuchu) => {
    aktualizujPersonalizacje({
      ...p,
      animacje: zastosujProfilRuchu(p.animacje, profil),
    })
  }

  const ustawAnimacje = <K extends keyof AnimacjePersonalizacji>(key: K, value: AnimacjePersonalizacji[K]) => {
    aktualizujPersonalizacje({
      ...p,
      animacje: { ...p.animacje, [key]: value, profil: 'wlasne' },
    })
  }

  const ustawKomponent = <K extends keyof KomponentyPersonalizacji>(key: K, value: KomponentyPersonalizacji[K]) => {
    aktualizujPersonalizacje({
      ...p,
      komponenty: { ...p.komponenty, [key]: value },
    })
  }

  const zapisz = async () => {
    await zapiszUstawienia({ wyglad: szkic.wyglad })
    ustawKomunikat('Motyw i personalizacja zostały zapisane.')
  }

  const resetuj = () => {
    aktualizuj({
      ...szkic,
      wyglad: {
        ...szkic.wyglad,
        motyw: 'systemowy',
        personalizacja: {
          ...kopiujPersonalizacje(DOMYSLNA_PERSONALIZACJA),
          motywyWlasne: p.motywyWlasne,
        },
      },
    })
    ustawKomunikat('Przywrócono bazową personalizację w podglądzie. Zapisz, aby utrwalić zmianę.')
  }

  const zapiszKopie = () => {
    const nazwa = nazwaMotywu.trim()
    if (!nazwa) {
      ustawBlad('Podaj nazwę własnego motywu.')
      return
    }
    const motyw: MotywWlasny = {
      id: idMotywu(),
      nazwa,
      motyw: szkic.wyglad.motyw === 'jasny' ? 'jasny' : 'ciemny',
      paleta: { ...p.paleta },
      interakcje: { ...p.interakcje },
      animacje: { ...p.animacje },
      komponenty: { ...p.komponenty },
    }
    aktualizujPersonalizacje({
      ...p,
      preset: 'wlasny',
      uzyjWlasnejPalety: true,
      motywyWlasne: [...p.motywyWlasne, motyw],
      aktywnyMotywId: motyw.id,
    })
    ustawWybranyWlasny(motyw.id)
    ustawKomunikat(`Dodano motyw „${nazwa}” do biblioteki. Zapisz ustawienia, aby go utrwalić.`)
  }

  const wczytajWlasny = () => {
    const motyw = p.motywyWlasne.find((item) => item.id === wybranyWlasny)
    if (!motyw) return
    aktualizuj({
      ...szkic,
      wyglad: {
        ...szkic.wyglad,
        motyw: motyw.motyw,
        personalizacja: {
          ...p,
          preset: 'wlasny',
          uzyjWlasnejPalety: true,
          paleta: { ...motyw.paleta },
          interakcje: { ...motyw.interakcje },
          animacje: { ...motyw.animacje },
          komponenty: { ...motyw.komponenty },
          aktywnyMotywId: motyw.id,
        },
      },
    })
  }

  const usunWlasny = () => {
    if (!wybranyWlasny) return
    aktualizujPersonalizacje({
      ...p,
      motywyWlasne: p.motywyWlasne.filter((item) => item.id !== wybranyWlasny),
      aktywnyMotywId: p.aktywnyMotywId === wybranyWlasny ? undefined : p.aktywnyMotywId,
    })
    ustawWybranyWlasny('')
  }

  const eksportuj = () => {
    const blob = new Blob([JSON.stringify({
      format: 'ogarniacz-theme',
      wersja: 1,
      motyw: szkic.wyglad.motyw,
      personalizacja: p,
    }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ogarniacz-motyw-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importuj = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const source = JSON.parse(await file.text()) as {
        format?: string
        motyw?: unknown
        personalizacja?: unknown
      }
      if (source.format !== 'ogarniacz-theme') throw new Error('format')
      const motyw = source.motyw === 'jasny' || source.motyw === 'ciemny' || source.motyw === 'systemowy'
        ? source.motyw
        : szkic.wyglad.motyw
      aktualizuj({
        ...szkic,
        wyglad: {
          ...szkic.wyglad,
          motyw,
          personalizacja: {
            ...normalizujPersonalizacje(source.personalizacja),
            preset: 'wlasny',
            uzyjWlasnejPalety: true,
          },
        },
      })
      ustawKomunikat('Motyw zaimportowano do podglądu. Zapisz ustawienia, aby go utrwalić.')
    } catch {
      ustawBlad('Nie udało się zaimportować motywu. Wybierz plik wyeksportowany z Ogarniacza.')
    }
  }

  return <div className="widok personalizacja">
    <NaglowekWidoku
      tytul="Personalizacja"
      opis="Centralny edytor motywów, kolorów, komponentów, reakcji hover/active i animacji."
      akcje={<>
        <Link className="przycisk przycisk--drugorzedny" to="/ustawienia">← Ustawienia</Link>
        <button className="przycisk przycisk--drugorzedny" type="button" onClick={resetuj}><RotateCcw aria-hidden="true" />Resetuj</button>
        <button className="przycisk przycisk--glowny" type="button" onClick={zapisz}><Save aria-hidden="true" />Zapisz motyw</button>
      </>}
    />

    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}

    <div className="personalizacja__pasek">
      <div className="personalizacja__status">
        <Palette aria-hidden="true" />
        <div>
          <strong>{p.preset === 'wlasny' ? 'Motyw własny' : PRESETY_MOTYWOW.find((item) => item.id === p.preset)?.nazwa ?? 'Motyw bazowy'}</strong>
          <span>Podgląd na żywo · {p.uzyjWlasnejPalety ? 'własna paleta' : 'kolory bazowe aplikacji'}</span>
        </div>
      </div>
      <div className="personalizacja__io">
        <button className="przycisk przycisk--maly" type="button" onClick={eksportuj}><Download aria-hidden="true" />Eksport</button>
        <label className="przycisk przycisk--maly">
          <Upload aria-hidden="true" />Import
          <input className="sr-only" type="file" accept="application/json,.json" onChange={importuj} />
        </label>
      </div>
    </div>

    <div className="personalizacja__zakladki" role="tablist" aria-label="Sekcje edytora personalizacji">
      {ZAKLADKI.map((item) => <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={zakladka === item.id}
        className={zakladka === item.id ? 'active' : ''}
        onClick={() => ustawZakladke(item.id)}
      >{item.etykieta}</button>)}
    </div>

    <div className="personalizacja__uklad">
      <main className="personalizacja__edytor">
        {zakladka === 'motyw' && <section className="personalizacja-sekcja">
          <div className="personalizacja-sekcja__naglowek">
            <div><h2>Motyw i biblioteka</h2><p>Wybierz bazę, a potem dopracuj ją w kolejnych zakładkach.</p></div>
            <WandSparkles aria-hidden="true" />
          </div>

          <div className="motywy-grid">
            <button
              type="button"
              className={`motyw-kafelek ${p.preset === 'bazowy' ? 'active' : ''}`}
              onClick={() => wybierzPreset('bazowy')}
            >
              <span className="motyw-kafelek__probki"><i /><i /><i /><i /></span>
              <strong>Bazowy / systemowy</strong>
              <small>Używa istniejącej jasnej lub ciemnej palety Ogarniacza.</small>
            </button>
            {PRESETY_MOTYWOW.map((preset) => <button
              key={preset.id}
              type="button"
              className={`motyw-kafelek ${p.preset === preset.id ? 'active' : ''}`}
              onClick={() => wybierzPreset(preset.id)}
            >
              <span className="motyw-kafelek__probki">
                <i style={{ background: preset.paleta.tlo }} />
                <i style={{ background: preset.paleta.panel }} />
                <i style={{ background: preset.paleta.akcent }} />
                <i style={{ background: preset.paleta.tekst }} />
              </span>
              <strong>{preset.nazwa}</strong>
              <small>{preset.opis}</small>
            </button>)}
          </div>

          <div className="personalizacja-blok">
            <h3>Tryb bazowy</h3>
            <div className="personalizacja-form-grid">
              <label className="pole"><span>Jasny / ciemny</span>
                <select value={szkic.wyglad.motyw} onChange={(event) => aktualizuj({
                  ...szkic,
                  wyglad: { ...szkic.wyglad, motyw: event.target.value as Ustawienia['wyglad']['motyw'] },
                })}>
                  <option value="systemowy">Systemowy</option>
                  <option value="jasny">Jasny</option>
                  <option value="ciemny">Ciemny</option>
                </select>
              </label>
              <label className="ustawienie-wiersz personalizacja-toggle">
                <span><strong>Własna paleta</strong><small>Wyłączenie wraca do bazowych kolorów CSS.</small></span>
                <input type="checkbox" checked={p.uzyjWlasnejPalety} onChange={(event) => aktualizujPersonalizacje({ ...p, uzyjWlasnejPalety: event.target.checked })} />
              </label>
            </div>
          </div>

          <div className="personalizacja-blok">
            <h3>Własne zapisane motywy</h3>
            <div className="biblioteka-motywow">
              <input value={nazwaMotywu} onChange={(event) => ustawNazweMotywu(event.target.value)} placeholder="Nazwa nowego motywu" />
              <button className="przycisk przycisk--drugorzedny" type="button" onClick={zapiszKopie}>Zapisz kopię</button>
              <select value={wybranyWlasny} onChange={(event) => ustawWybranyWlasny(event.target.value)}>
                <option value="">Wybierz zapisany motyw</option>
                {p.motywyWlasne.map((motyw) => <option key={motyw.id} value={motyw.id}>{motyw.nazwa}</option>)}
              </select>
              <button className="przycisk przycisk--drugorzedny" type="button" disabled={!wybranyWlasny} onClick={wczytajWlasny}>Wczytaj</button>
              <button className="przycisk przycisk--tekstowy" type="button" disabled={!wybranyWlasny} onClick={usunWlasny}>Usuń</button>
            </div>
          </div>
        </section>}

        {zakladka === 'kolory' && <section className="personalizacja-sekcja">
          <div className="personalizacja-sekcja__naglowek">
            <div><h2>Paleta kolorów</h2><p>Zmiana dowolnego koloru automatycznie przełącza paletę w tryb własny.</p></div>
            <Palette aria-hidden="true" />
          </div>
          {grupyKolorow.map((grupa) => <div key={grupa} className="personalizacja-blok">
            <h3>{grupa}</h3>
            <div className="kolory-grid">
              {KOLORY.filter((item) => item.grupa === grupa).map((item) => <label key={item.key} className="kolor-pole">
                <span>{item.label}</span>
                <div>
                  <input type="color" value={p.paleta[item.key]} onChange={(event) => ustawPalete(item.key, event.target.value)} />
                  <input
                    type="text"
                    value={p.paleta[item.key]}
                    onChange={(event) => {
                      if (/^#[0-9a-f]{6}$/i.test(event.target.value)) ustawPalete(item.key, event.target.value)
                    }}
                    aria-label={`${item.label} — wartość HEX`}
                  />
                </div>
              </label>)}
            </div>
          </div>)}
        </section>}

        {zakladka === 'komponenty' && <section className="personalizacja-sekcja">
          <div className="personalizacja-sekcja__naglowek">
            <div><h2>Komponenty</h2><p>Karty, przyciski, pola, nawigacja i oś czasu korzystają ze wspólnych design tokens.</p></div>
            <SlidersHorizontal aria-hidden="true" />
          </div>
          <div className="personalizacja-form-grid">
            <label className="pole"><span>Cień kart</span><select value={p.komponenty.kartaCien} onChange={(e) => ustawKomponent('kartaCien', e.target.value as KomponentyPersonalizacji['kartaCien'])}><option value="brak">Brak</option><option value="lekki">Lekki</option><option value="sredni">Średni</option><option value="mocny">Mocny</option></select></label>
            <Suwak label="Obramowanie kart" value={p.komponenty.kartaObramowanie} min={0} max={4} step={1} suffix=" px" onChange={(v) => ustawKomponent('kartaObramowanie', v)} />
            <Suwak label="Uniesienie karty na hover" value={p.komponenty.kartaHoverUniesienie} min={0} max={10} step={1} suffix=" px" onChange={(v) => ustawKomponent('kartaHoverUniesienie', v)} />
            <Suwak label="Obramowanie przycisków" value={p.komponenty.przyciskObramowanie} min={0} max={4} step={1} suffix=" px" onChange={(v) => ustawKomponent('przyciskObramowanie', v)} />
            <Suwak label="Obramowanie pól" value={p.komponenty.poleObramowanie} min={0} max={4} step={1} suffix=" px" onChange={(v) => ustawKomponent('poleObramowanie', v)} />
            <Suwak label="Promień pozycji menu" value={p.komponenty.sidebarPromien} min={0} max={20} step={1} suffix=" px" onChange={(v) => ustawKomponent('sidebarPromien', v)} />
            <Suwak label="Promień bloków osi" value={p.komponenty.timelinePromien} min={0} max={20} step={1} suffix=" px" onChange={(v) => ustawKomponent('timelinePromien', v)} />
            <Suwak label="Krycie bloków osi" value={p.komponenty.timelinePrzezroczystosc} min={35} max={100} step={5} suffix="%" onChange={(v) => ustawKomponent('timelinePrzezroczystosc', v)} />
            <Suwak label="Grubość linii osi" value={p.komponenty.timelineLiniaPx} min={1} max={5} step={1} suffix=" px" onChange={(v) => ustawKomponent('timelineLiniaPx', v)} />
            <Suwak label="Rozmiar miniatur" value={p.komponenty.miniaturaRozmiar} min={24} max={96} step={4} suffix=" px" onChange={(v) => ustawKomponent('miniaturaRozmiar', v)} />
          </div>
        </section>}

        {zakladka === 'interakcje' && <section className="personalizacja-sekcja">
          <div className="personalizacja-sekcja__naglowek">
            <div><h2>Hover, active, selected i focus</h2><p>Reakcje są współdzielone przez przyciski, karty i pozycje nawigacji.</p></div>
            <Sparkles aria-hidden="true" />
          </div>
          <label className="ustawienie-wiersz personalizacja-toggle">
            <span><strong>Automatyczne stany kolorystyczne</strong><small>Kolory hover i active pozostają spójne z akcentem.</small></span>
            <input type="checkbox" checked={p.interakcje.autoStany} onChange={(e) => aktualizujPersonalizacje({ ...p, interakcje: { ...p.interakcje, autoStany: e.target.checked } })} />
          </label>
          <div className="personalizacja-form-grid">
            <Suwak label="Jasność hover" value={p.interakcje.hoverJasnosc} min={0.8} max={1.3} step={0.01} suffix="×" onChange={(v) => aktualizujPersonalizacje({ ...p, interakcje: { ...p.interakcje, hoverJasnosc: v } })} />
            <Suwak label="Skala hover" value={p.interakcje.hoverSkala} min={0.94} max={1.08} step={0.005} suffix="×" onChange={(v) => aktualizujPersonalizacje({ ...p, interakcje: { ...p.interakcje, hoverSkala: v } })} />
            <Suwak label="Przesunięcie hover Y" value={p.interakcje.hoverPrzesuniecieY} min={-8} max={8} step={1} suffix=" px" onChange={(v) => aktualizujPersonalizacje({ ...p, interakcje: { ...p.interakcje, hoverPrzesuniecieY: v } })} />
            <Suwak label="Skala active" value={p.interakcje.activeSkala} min={0.9} max={1.04} step={0.005} suffix="×" onChange={(v) => aktualizujPersonalizacje({ ...p, interakcje: { ...p.interakcje, activeSkala: v } })} />
            <Suwak label="Przesunięcie active Y" value={p.interakcje.activePrzesuniecieY} min={-4} max={6} step={1} suffix=" px" onChange={(v) => aktualizujPersonalizacje({ ...p, interakcje: { ...p.interakcje, activePrzesuniecieY: v } })} />
            <Suwak label="Glow zaznaczenia" value={p.interakcje.selectedGlow} min={0} max={32} step={1} suffix=" px" onChange={(v) => aktualizujPersonalizacje({ ...p, interakcje: { ...p.interakcje, selectedGlow: v } })} />
            <Suwak label="Grubość focus" value={p.interakcje.focusGrubosc} min={1} max={6} step={1} suffix=" px" onChange={(v) => aktualizujPersonalizacje({ ...p, interakcje: { ...p.interakcje, focusGrubosc: v } })} />
          </div>
        </section>}

        {zakladka === 'animacje' && <section className="personalizacja-sekcja">
          <div className="personalizacja-sekcja__naglowek">
            <div><h2>Animacje i ruch</h2><p>Profile szybko ustawiają całość. Każda ręczna zmiana przełącza profil na „Własne”.</p></div>
            <Sparkles aria-hidden="true" />
          </div>
          <label className="pole pole--pelne"><span>Profil ruchu</span>
            <select value={p.animacje.profil} onChange={(e) => ustawProfil(e.target.value as ProfilRuchu)}>
              <option value="wylaczone">Wyłączone</option>
              <option value="minimalne">Minimalne</option>
              <option value="standardowe">Standardowe</option>
              <option value="plynne">Płynne</option>
              <option value="dynamiczne">Dynamiczne</option>
              <option value="wlasne">Własne</option>
            </select>
          </label>
          <div className="personalizacja-form-grid">
            <Suwak label="Hover" value={p.animacje.hoverMs} min={0} max={1000} step={10} suffix=" ms" onChange={(v) => ustawAnimacje('hoverMs', v)} />
            <Suwak label="Active" value={p.animacje.activeMs} min={0} max={1000} step={10} suffix=" ms" onChange={(v) => ustawAnimacje('activeMs', v)} />
            <Suwak label="Modal" value={p.animacje.modalMs} min={0} max={1200} step={10} suffix=" ms" onChange={(v) => ustawAnimacje('modalMs', v)} />
            <Suwak label="Dropdown" value={p.animacje.dropdownMs} min={0} max={1000} step={10} suffix=" ms" onChange={(v) => ustawAnimacje('dropdownMs', v)} />
            <Suwak label="Tooltip" value={p.animacje.tooltipMs} min={0} max={1000} step={10} suffix=" ms" onChange={(v) => ustawAnimacje('tooltipMs', v)} />
            <Suwak label="Przejście strony" value={p.animacje.pageMs} min={0} max={1200} step={10} suffix=" ms" onChange={(v) => ustawAnimacje('pageMs', v)} />
            <Suwak label="Karty" value={p.animacje.kartaMs} min={0} max={1000} step={10} suffix=" ms" onChange={(v) => ustawAnimacje('kartaMs', v)} />
            <Suwak label="Drag & drop" value={p.animacje.dragMs} min={0} max={1000} step={10} suffix=" ms" onChange={(v) => ustawAnimacje('dragMs', v)} />
            <label className="pole pole--pelne"><span>Easing</span>
              <select value={p.animacje.easing} onChange={(e) => ustawAnimacje('easing', e.target.value)}>
                <option value="linear">linear</option>
                <option value="ease">ease</option>
                <option value="ease-in">ease-in</option>
                <option value="ease-out">ease-out</option>
                <option value="ease-in-out">ease-in-out</option>
                <option value="cubic-bezier(.2,.8,.2,1)">płynny cubic-bezier</option>
                <option value="cubic-bezier(.2,.9,.25,1.15)">sprężysty cubic-bezier</option>
              </select>
            </label>
          </div>
        </section>}

        {zakladka === 'podglad' && <section className="personalizacja-sekcja">
          <div className="personalizacja-sekcja__naglowek">
            <div><h2>Playground motywu</h2><p>Najedź, kliknij i przejdź klawiaturą po elementach. Cała aplikacja również korzysta z bieżącego podglądu.</p></div>
            <Eye aria-hidden="true" />
          </div>
          <Playground />
        </section>}
      </main>

      <aside className="personalizacja__podglad-sticky">
        <div className="personalizacja__podglad-naglowek"><Eye aria-hidden="true" /><strong>Podgląd na żywo</strong></div>
        <Playground kompaktowy />
      </aside>
    </div>
  </div>
}

function Suwak({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (value: number) => void
}) {
  return <label className="pole personalizacja-suwak">
    <span>{label}: <strong>{Number.isInteger(value) ? value : value.toFixed(3)}{suffix}</strong></span>
    <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
  </label>
}

function Playground({ kompaktowy = false }: { kompaktowy?: boolean }) {
  return <div className={`motyw-playground ${kompaktowy ? 'motyw-playground--kompaktowy' : ''}`}>
    <div className="motyw-playground__sidebar">
      <strong>Ogarniacz</strong>
      <button type="button" className="active">Pulpit</button>
      <button type="button">Zadania</button>
      <button type="button">Projekty</button>
    </div>
    <div className="motyw-playground__main">
      <div className="motyw-playground__toolbar">
        <button type="button" className="przycisk przycisk--glowny">Główny</button>
        <button type="button" className="przycisk przycisk--drugorzedny">Drugorzędny</button>
      </div>
      <div className="karta motyw-playground__karta">
        <span className="tytul-karty">Przykładowa karta</span>
        <strong>Zadanie do wykonania</strong>
        <p>Hover i cień reagują na ustawienia komponentów.</p>
        <input type="text" defaultValue="Pole formularza" aria-label="Przykładowe pole formularza" />
      </div>
      <div className="motyw-playground__statusy">
        <span style={{ background: 'var(--sukces-tlo)', color: 'var(--sukces)' }}>Sukces</span>
        <span style={{ background: 'var(--ostrzezenie-tlo)', color: 'var(--ostrzezenie)' }}>Uwaga</span>
        <span style={{ background: 'var(--blad-tlo)', color: 'var(--blad)' }}>Błąd</span>
      </div>
      <div className="motyw-playground__timeline">
        <i />
        <div className="motyw-playground__blok motyw-playground__blok--zadanie">09:00 · Zadanie</div>
        <div className="motyw-playground__blok motyw-playground__blok--wizyta">11:30 · Wizyta</div>
        <b>teraz</b>
      </div>
    </div>
  </div>
}
