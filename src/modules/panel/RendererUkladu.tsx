import type { CSSProperties, PointerEventHandler, ReactNode } from 'react'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { definicjaBloku, type BlokKokpitu, type PlanszaKokpitu, type TrybKokpitu } from '../../domain/kokpit'
import { TrescBloku } from './BlokiKokpitu'
import type { KontoUzytkownika } from '../../services/KontaService'
import { czySesjaPozwala } from '../../services/PrywatnoscKokpitu'

export function stylBloku(blok: BlokKokpitu): CSSProperties {
  const { wyglad, x, y, szerokosc, wysokosc } = blok
  return {
    gridColumn: x + 1 + ' / span ' + szerokosc,
    gridRow: y + 1 + ' / span ' + wysokosc,
    backgroundColor: wyglad.tlo && `color-mix(in srgb, color-mix(in srgb, ${wyglad.tlo} ${Math.min(wyglad.jasnosc ?? 100, 100)}%, ${(wyglad.jasnosc ?? 100) > 100 ? 'white' : 'black'} ${Math.abs(100 - (wyglad.jasnosc ?? 100))}%), transparent ${100 - (wyglad.krycie ?? 100)}%)`,
    color: wyglad.tekst, textAlign: wyglad.wyrownanie, padding: wyglad.odstep,
    borderWidth: wyglad.grubosc, borderRadius: wyglad.promien,
    borderColor: wyglad.obramowanie && `color-mix(in srgb, ${wyglad.obramowanie}, transparent ${100 - (wyglad.krycieRamki ?? 100)}%)`,
    '--kokpit-tytul': wyglad.tytul && `${wyglad.tytul}px`,
    '--kokpit-wartosc': wyglad.wartosc && `${wyglad.wartosc}px`,
    '--kokpit-opis': wyglad.opis && `${wyglad.opis}px`,
  } as CSSProperties
}

export function RendererUkladu({ plansza, data, tryb, sesja, etykieta, ciagly, wysokosc, narzedzia, podglad, zdarzenia, zmienPlansze }: {
  plansza: PlanszaKokpitu; data: string; tryb: TrybKokpitu; etykieta: string; ciagly?: boolean; wysokosc?: string
  sesja?: KontoUzytkownika
  zmienPlansze?: (kierunek: number) => void
  narzedzia?: (blok: BlokKokpitu) => ReactNode
  podglad?: { blok: BlokKokpitu; poprawny: boolean }
  zdarzenia?: { onPointerDown?: PointerEventHandler; onPointerUp?: PointerEventHandler; onPointerCancel?: PointerEventHandler }
}) {
  const { gotowyDostep, moze } = useAplikacja()
  return <section aria-label={etykieta} className={`kokpit__siatka ${ciagly ? 'kokpit__siatka--ciagla' : ''} ${narzedzia ? 'kokpit__siatka--edycja' : ''}`}
    style={{ '--kolumny': plansza.kolumny, '--wiersze': plansza.wiersze, '--odstep': `${plansza.odstep}px`, minHeight: wysokosc } as CSSProperties}
    {...zdarzenia}>
    {plansza.bloki.map((blok) => {
      const definicja = definicjaBloku(blok.typ)
      const modul = definicja && 'modul' in definicja ? definicja.modul
        : blok.typ === 'skrot' || (blok.typ === 'akcja' && (!blok.akcja || blok.akcja === 'modul')) ? blok.skrot : undefined
      const dostepKonta = !modul || !sesja || czySesjaPozwala(sesja, modul)
      const dozwolony = definicja && dostepKonta && (!modul || (gotowyDostep && moze(modul)))
      if (!narzedzia && blok.widocznosc !== 'zawsze' && blok.widocznosc !== tryb) return null
      return <article key={blok.id} className={`kokpit__blok ${blok.typ === 'zegar' ? 'kokpit__blok--zegar' : ''}`} style={stylBloku(blok)}>
        {(narzedzia || blok.wyglad.pokazTytul !== false) && <h2><span aria-hidden="true">{definicja?.ikona ?? '?'}</span> {definicja?.nazwa ?? 'Nieznany blok'}</h2>}
        {narzedzia ? narzedzia(blok) : dozwolony ? <TrescBloku blok={blok} data={data} tryb={tryb} sesja={sesja} zmienPlansze={zmienPlansze} /> : <p>Blok niedostępny.</p>}
      </article>
    })}
    {podglad && <div className="kokpit__podglad" data-kolizja={!podglad.poprawny} style={stylBloku({ ...podglad.blok, wyglad: {} })} aria-hidden="true" />}
    {!plansza.bloki.length && <p className="kokpit__pusta">Pusta plansza</p>}
  </section>
}
