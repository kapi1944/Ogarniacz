import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CarFront, Clock3, RotateCcw, Settings2 } from 'lucide-react'
import { dzisiajIso } from '../../domain/fabryki'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import type {
  HarmonogramDnia,
  PrzedzialHarmonogramuDnia,
  ZakresSnuDnia,
} from './logikaOsiCzasu'
import { NawigatorDnia } from './NawigatorDnia'
import { etykietaStatusuElementu } from './logikaDniaPulpitu'
import { rozmiescZnaczniki } from './rozmieszczenieZnacznikow'
import {
  minutyDnia,
  pozycjaGodzinyNaOsi,
  rozmiarZakresuNaOsi,
} from './logikaOsiCzasu'

const GODZINY_ETYKIET = [
  '00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00',
]

function stylePrzedzialu(
  przedzial: PrzedzialHarmonogramuDnia,
  zakresSnu: ZakresSnuDnia,
): CSSProperties[] {
  const od = pozycjaGodzinyNaOsi(przedzial.od, zakresSnu)
  const doGodziny = pozycjaGodzinyNaOsi(przedzial.do, zakresSnu)

  if (minutyDnia(przedzial.do) > minutyDnia(przedzial.od)) {
    return [{
      left: `${od}%`,
      width: `${rozmiarZakresuNaOsi(przedzial.od, przedzial.do, zakresSnu)}%`,
    }]
  }

  return [
    { left: `${od}%`, width: `${100 - od}%` },
    { left: '0%', width: `${doGodziny}%` },
  ]
}

export function OsCzasu({
  data,
  harmonogram,
  zakresSnu,
  elementy,
  zezwalajNaPelnaDostepnosc,
  edytujHarmonogram,
  przelaczDostepnosc,
  usunWyjatek,
  otworzElement,
  zmienDate,
}: {
  data: string
  harmonogram: HarmonogramDnia
  zakresSnu: ZakresSnuDnia
  elementy: ElementOgarniacza[]
  zezwalajNaPelnaDostepnosc: boolean
  edytujHarmonogram: () => void
  przelaczDostepnosc: () => void
  usunWyjatek: () => void
  otworzElement: (element: ElementOgarniacza) => void
  zmienDate?: (data: string) => void
}) {
  const [teraz, ustawTeraz] = useState(new Date())
  const [wybranyElementOsi, ustawWybranyElementOsi] = useState<string | null>(null)
  const wybranyPrzedzial = harmonogram.przedzialy.find((przedzial) => `przedzial:${przedzial.id}` === wybranyElementOsi)
  const { od, do: doSnu, skala } = zakresSnu
  const znaczniki = useMemo(() => rozmiescZnaczniki(elementy, { od, do: doSnu, skala }), [elementy, od, doSnu, skala])
  const liczbaWierszy = znaczniki.reduce((liczba, znacznik) => Math.max(liczba, znacznik.wiersz + 1), 0)
  const wysokosc = `max(205px, calc(128px + ${liczbaWierszy} * 4rem))`

  useEffect(() => {
    const interwal = window.setInterval(() => ustawTeraz(new Date()), 60_000)
    return () => window.clearInterval(interwal)
  }, [])

  const jestDzisiaj = data === dzisiajIso(teraz)
  const godzinaTeraz = `${String(teraz.getHours()).padStart(2, '0')}:${String(teraz.getMinutes()).padStart(2, '0')}`
  const pozycjaTeraz = pozycjaGodzinyNaOsi(godzinaTeraz, zakresSnu)

  const poczatekAktywny = pozycjaGodzinyNaOsi(
    harmonogram.zakresAktywny.od,
    zakresSnu,
  )
  const koniecAktywny = pozycjaGodzinyNaOsi(
    harmonogram.zakresAktywny.do,
    zakresSnu,
  )

  return (
    <section className="karta karta--os-czasu pulpit-sekcja--os-czasu">
      {zmienDate && <NawigatorDnia data={data} zmienDate={zmienDate} />}
      <div className="naglowek-karty naglowek-osi-czasu">
        <div>
          <h2><Clock3 aria-hidden="true" /> Oś czasu</h2>
          <p>Doba 00:00–24:00 · sen {zakresSnu.od}–{zakresSnu.do} × {Math.round(zakresSnu.skala * 100)}%.</p>
        </div>
        <div>
          {harmonogram.jestWyjatkiem && (
            <button
              type="button"
              className="przycisk przycisk--tekstowy"
              onClick={usunWyjatek}
            >
              <RotateCcw aria-hidden="true" />
              Przywróć regułę
            </button>
          )}
          <button
            type="button"
            className="przycisk przycisk--drugorzedny"
            onClick={edytujHarmonogram}
          >
            <Settings2 aria-hidden="true" />
            Edytuj harmonogram
          </button>
        </div>
      </div>

      <div className="podsumowanie-harmonogramu">
        <span>
          {harmonogram.pracuje
            ? `Praca ${harmonogram.odPracy}–${harmonogram.doPracy}`
            : 'Dzień bez domyślnej pracy'}
        </span>

        {harmonogram.pracuje && (
          <span>
            <CarFront aria-hidden="true" />
            Dojazdy: {harmonogram.dojazdDoPracyMinuty} + {harmonogram.powrotZPracyMinuty} min · dostępność {harmonogram.dostepnoscDojazdu === 'pelna' ? 'pełna' : 'częściowa'}
          </span>
        )}

        {harmonogram.jestWyjatkiem && (
          <span className="znacznik znacznik--informacja">
            Wyjątek dnia
          </span>
        )}
      </div>

      <div className="os-czasu-przewijana" role="region" aria-label="Oś czasu doby z harmonogramem i wydarzeniami" tabIndex={0}>
        <div className="os-czasu" style={{ height: wysokosc }} aria-label={`Oś czasu dla ${data}`}>
          <div
            className="os-czasu__aktywny"
            style={{
              left: `${poczatekAktywny}%`,
              width: `${koniecAktywny - poczatekAktywny}%`,
            }}
          />

          <div className="os-czasu__linia" />

          {harmonogram.przedzialy.flatMap((przedzial) => stylePrzedzialu(przedzial, zakresSnu).map((styl, indeksFragmentu) => (
            <button
              type="button"
              key={`${przedzial.id}:${indeksFragmentu}`}
              className={`os-czasu__pas os-czasu__pas--${przedzial.id}`}
              style={styl}
              title={`${przedzial.etykieta}: ${przedzial.od}–${przedzial.do}`}
              aria-label={`${przedzial.etykieta}: ${przedzial.od}–${przedzial.do}`}
              aria-pressed={wybranyElementOsi === `przedzial:${przedzial.id}`}
              onClick={() => ustawWybranyElementOsi(`przedzial:${przedzial.id}`)}
            >
              <strong>{przedzial.etykieta}</strong>
              <small>{przedzial.od}–{przedzial.do}</small>
            </button>
          )))}

          {GODZINY_ETYKIET.map((godzina) => (
            <span
              key={godzina}
              className={`os-czasu__etykieta ${
                godzina === '00:00'
                  ? 'os-czasu__etykieta--poczatek'
                  : godzina === '24:00'
                    ? 'os-czasu__etykieta--koniec'
                    : ''
              } ${godzina === '03:00' || godzina === '06:00' || godzina === '21:00' ? 'os-czasu__etykieta--pomocnicza' : ''}`}
              style={{
                left: `${pozycjaGodzinyNaOsi(godzina, zakresSnu)}%`,
              }}
            >
              {godzina}
            </span>
          ))}

          {znaczniki.map(({ element, pozycja }) => <span key={`punkt:${element.id}`} className="os-czasu__punkt-elementu" style={{ left: `${pozycja}%` }} aria-hidden="true" />)}
          {znaczniki.map(({ element, lewa, wiersz }) => (
            <button
              type="button"
              key={element.id}
              className={`os-czasu__marker os-czasu__marker--${element.typ} os-czasu__marker--${element.status ?? 'bez-statusu'}`}
              style={{
                left: `${lewa}%`,
                top: `calc(128px + ${wiersz} * 4rem)`,
              }}
              title={`${element.godzina} ${element.tytul} · ${etykietaStatusuElementu(element)}`}
              aria-label={`${element.godzina} ${element.tytul} · ${etykietaStatusuElementu(element)}`}
              aria-pressed={wybranyElementOsi === `element:${element.id}`}
              onClick={() => {
                ustawWybranyElementOsi(`element:${element.id}`)
                otworzElement(element)
              }}
            >
              <strong>{element.godzina} · {element.tytul}</strong>
              <small>{etykietaStatusuElementu(element)}{element.priorytet === 'asap' ? ' · Najpilniejsze' : element.priorytet === 'pilny' ? ' · Pilne' : ''}</small>
            </button>
          ))}

          {jestDzisiaj && (
            <div
              className={`os-czasu__teraz ${pozycjaTeraz < 15 ? 'os-czasu__teraz--poczatek' : pozycjaTeraz > 85 ? 'os-czasu__teraz--koniec' : ''}`}
              style={{
                left: `${pozycjaTeraz}%`,
              }}
            >
              <span>Teraz {godzinaTeraz}</span>
            </div>
          )}
        </div>
      </div>

      {wybranyPrzedzial && <p className="os-czasu__szczegoly" role="status">{wybranyPrzedzial.etykieta}: {wybranyPrzedzial.od}–{wybranyPrzedzial.do}</p>}
      {harmonogram.pracuje
        && zezwalajNaPelnaDostepnosc
        && (harmonogram.dojazdDoPracyMinuty > 0 || harmonogram.powrotZPracyMinuty > 0)
        && (
          <div className="akcje-dostepnosci">
            <p>
              Częściowa dostępność tylko informuje przyszły planer — nie blokuje Ogarniacza.
            </p>
            <button
              type="button"
              className="przycisk przycisk--maly"
              onClick={przelaczDostepnosc}
            >
              Ustaw dojazdy jako {harmonogram.dostepnoscDojazdu === 'pelna' ? 'częściowo' : 'w pełni'} dostępne
            </button>
          </div>
        )}
    </section>
  )
}
