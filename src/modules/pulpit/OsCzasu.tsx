import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CarFront, Clock3, RotateCcw, Settings2 } from 'lucide-react'
import { dzisiajIso } from '../../domain/fabryki'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import type { HarmonogramDnia, PrzedzialHarmonogramuDnia } from './logikaOsiCzasu'
import { minutyDnia, pozycjaGodzinyNaOsi } from './logikaOsiCzasu'

function stylPrzedzialu(przedzial: PrzedzialHarmonogramuDnia, harmonogram: HarmonogramDnia): CSSProperties {
  const od = pozycjaGodzinyNaOsi(przedzial.od, harmonogram.zakresAktywny)
  const doGodziny = pozycjaGodzinyNaOsi(przedzial.do, harmonogram.zakresAktywny)
  return { left: `${od}%`, width: `${Math.max(0, doGodziny - od)}%` }
}

export function OsCzasu({
  data,
  harmonogram,
  elementy,
  zezwalajNaPelnaDostepnosc,
  edytujHarmonogram,
  przelaczDostepnosc,
  usunWyjatek,
}: {
  data: string
  harmonogram: HarmonogramDnia
  elementy: ElementOgarniacza[]
  zezwalajNaPelnaDostepnosc: boolean
  edytujHarmonogram: () => void
  przelaczDostepnosc: () => void
  usunWyjatek: () => void
}) {
  const [teraz, ustawTeraz] = useState(new Date())
  useEffect(() => {
    const interwal = window.setInterval(() => ustawTeraz(new Date()), 60_000)
    return () => window.clearInterval(interwal)
  }, [])
  const jestDzisiaj = data === dzisiajIso(teraz)
  const godzinaTeraz = `${String(teraz.getHours()).padStart(2, '0')}:${String(teraz.getMinutes()).padStart(2, '0')}`
  const godzinyEtykiet = useMemo(() => [...new Set([
    '00:00',
    ...harmonogram.przedzialy.flatMap((przedzial) => [przedzial.od, przedzial.do]),
    '23:59',
  ])].sort((a, b) => minutyDnia(a) - minutyDnia(b)), [harmonogram.przedzialy])
  const poczatekAktywny = pozycjaGodzinyNaOsi(harmonogram.zakresAktywny.od, harmonogram.zakresAktywny)
  const koniecAktywny = pozycjaGodzinyNaOsi(harmonogram.zakresAktywny.do, harmonogram.zakresAktywny)

  return (
    <section className="karta karta--os-czasu">
      <div className="naglowek-karty naglowek-osi-czasu">
        <div>
          <h2><Clock3 aria-hidden="true" /> Oś czasu</h2>
          <p>Pełna doba 00:00–23:59. Czas poza aktywną częścią dnia jest skompresowany.</p>
        </div>
        <div>
          {harmonogram.jestWyjatkiem && <button type="button" className="przycisk przycisk--tekstowy" onClick={usunWyjatek}><RotateCcw aria-hidden="true" />Przywróć regułę</button>}
          <button type="button" className="przycisk przycisk--drugorzedny" onClick={edytujHarmonogram}><Settings2 aria-hidden="true" />Zmień dzień</button>
        </div>
      </div>
      <div className="podsumowanie-harmonogramu">
        <span>{harmonogram.pracuje ? `Praca ${harmonogram.odPracy}–${harmonogram.doPracy}` : 'Dzień bez domyślnej pracy'}</span>
        {harmonogram.pracuje && <span><CarFront aria-hidden="true" />Dojazdy: {harmonogram.dojazdDoPracyMinuty} + {harmonogram.powrotZPracyMinuty} min · dostępność {harmonogram.dostepnoscDojazdu === 'pelna' ? 'pełna' : 'częściowa'}</span>}
        {harmonogram.jestWyjatkiem && <span className="znacznik znacznik--informacja">Wyjątek dnia</span>}
      </div>
      <div className="os-czasu-przewijana">
        <div className="os-czasu" aria-label={`Oś czasu dla ${data}`}>
          <div className="os-czasu__aktywny" style={{ left: `${poczatekAktywny}%`, width: `${koniecAktywny - poczatekAktywny}%` }} />
          <div className="os-czasu__linia" />
          {harmonogram.przedzialy.map((przedzial) => <div key={przedzial.id} className={`os-czasu__pas os-czasu__pas--${przedzial.id}`} style={stylPrzedzialu(przedzial, harmonogram)} title={`${przedzial.etykieta}: ${przedzial.od}–${przedzial.do}`}><strong>{przedzial.etykieta}</strong><small>{przedzial.od}–{przedzial.do}</small></div>)}
          {godzinyEtykiet.map((godzina) => <span key={godzina} className={`os-czasu__etykieta ${godzina === '00:00' ? 'os-czasu__etykieta--poczatek' : godzina === '23:59' ? 'os-czasu__etykieta--koniec' : ''}`} style={{ left: `${pozycjaGodzinyNaOsi(godzina, harmonogram.zakresAktywny)}%` }}>{godzina}</span>)}
          {elementy.map((element, indeks) => element.godzina && <div key={element.id} className="os-czasu__marker" style={{ left: `${pozycjaGodzinyNaOsi(element.godzina, harmonogram.zakresAktywny)}%`, top: `${122 + indeks % 3 * 24}px` }} title={`${element.godzina} ${element.tytul}`}><span /><strong>{element.tytul}</strong></div>)}
          {jestDzisiaj && <div className="os-czasu__teraz" style={{ left: `${pozycjaGodzinyNaOsi(godzinaTeraz, harmonogram.zakresAktywny)}%` }}><span>Teraz {godzinaTeraz}</span></div>}
        </div>
      </div>
      {harmonogram.pracuje && zezwalajNaPelnaDostepnosc && (harmonogram.dojazdDoPracyMinuty > 0 || harmonogram.powrotZPracyMinuty > 0) && <div className="akcje-dostepnosci"><p>Częściowa dostępność tylko informuje przyszły planer — nie blokuje Ogarniacza.</p><button type="button" className="przycisk przycisk--maly" onClick={przelaczDostepnosc}>Ustaw dojazdy jako {harmonogram.dostepnoscDojazdu === 'pelna' ? 'częściowo' : 'w pełni'} dostępne</button></div>}
    </section>
  )
}
