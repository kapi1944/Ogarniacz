import { useEffect, useState, type CSSProperties } from 'react'
import { CarFront, Clock3, RotateCcw, Settings2 } from 'lucide-react'
import { dzisiajIso } from '../../domain/fabryki'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import type {
  HarmonogramDnia,
  PrzedzialHarmonogramuDnia,
  ZakresSnuDnia,
} from './logikaOsiCzasu'
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
}) {
  const [teraz, ustawTeraz] = useState(new Date())
  const [wybranyElementOsi, ustawWybranyElementOsi] = useState<string | null>(null)

  useEffect(() => {
    const interwal = window.setInterval(() => ustawTeraz(new Date()), 60_000)
    return () => window.clearInterval(interwal)
  }, [])

  const jestDzisiaj = data === dzisiajIso(teraz)
  const godzinaTeraz = `${String(teraz.getHours()).padStart(2, '0')}:${String(teraz.getMinutes()).padStart(2, '0')}`

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
      <div className="naglowek-karty naglowek-osi-czasu">
        <div>
          <h2><Clock3 aria-hidden="true" /> Oś czasu</h2>
          <p>Pełna doba 00:00–24:00. Sen {zakresSnu.od}–{zakresSnu.do} jest skompresowany do {Math.round(zakresSnu.skala * 100)}%.</p>
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
            Zmień dzień
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

      <div className="os-czasu-przewijana">
        <div className="os-czasu" aria-label={`Oś czasu dla ${data}`}>
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
              }`}
              style={{
                left: `${pozycjaGodzinyNaOsi(godzina, zakresSnu)}%`,
              }}
            >
              {godzina}
            </span>
          ))}

          {elementy.map((element, indeks) => element.godzina && (
            <button
              type="button"
              key={element.id}
              className={`os-czasu__marker os-czasu__marker--${element.typ} os-czasu__marker--${element.status ?? 'bez-statusu'}`}
              style={{
                left: `${pozycjaGodzinyNaOsi(element.godzina, zakresSnu)}%`,
                top: `${122 + indeks % 3 * 24}px`,
              }}
              title={`${element.godzina} ${element.tytul} · ${element.status ?? 'bez statusu'}`}
              aria-label={`${element.godzina} ${element.tytul} · ${element.status ?? 'bez statusu'}`}
              aria-pressed={wybranyElementOsi === `element:${element.id}`}
              onClick={() => {
                ustawWybranyElementOsi(`element:${element.id}`)
                otworzElement(element)
              }}
            >
              <span />
              <strong>{element.tytul}</strong>
              <small>{element.typ === 'lek' ? 'Lek' : element.typ === 'wizyta' ? 'Wizyta' : element.typ === 'platnosc' ? 'Płatność' : element.typ === 'samochod' ? 'Samochód' : element.typ === 'zakupy' ? 'Zakupy' : 'Zadanie'} · {element.status ?? 'bez statusu'}</small>
            </button>
          ))}

          {jestDzisiaj && (
            <div
              className="os-czasu__teraz"
              style={{
                left: `${pozycjaGodzinyNaOsi(godzinaTeraz, zakresSnu)}%`,
              }}
            >
              <span>Teraz {godzinaTeraz}</span>
            </div>
          )}
        </div>
      </div>

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
