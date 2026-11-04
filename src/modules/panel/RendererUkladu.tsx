import { useState, type CSSProperties, type PointerEventHandler, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { definicjaBloku, type BlokKokpitu, type PlanszaKokpitu, type TrybKokpitu } from '../../domain/kokpit'
import { TrescBloku } from './BlokiKokpitu'
import type { KontoUzytkownika } from '../../services/KontaService'
import { czySesjaPozwala } from '../../services/PrywatnoscKokpitu'
import { Modal } from '../../components/Interfejs'

function stylBloku(blok: BlokKokpitu): CSSProperties {
  const { wyglad, x, y, szerokosc, wysokosc } = blok
  const jasnosc = (wyglad.jasnosc ?? 100) - 100
  return {
    gridColumn: x + 1 + ' / span ' + szerokosc,
    gridRow: y + 1 + ' / span ' + wysokosc,
    background: wyglad.tlo && `color-mix(in srgb, color-mix(in srgb, ${wyglad.tlo}, ${jasnosc > 0 ? 'white' : 'black'} ${Math.abs(jasnosc)}%), transparent ${100 - (wyglad.krycie ?? 100)}%)`,
    color: wyglad.tekst, textAlign: wyglad.wyrownanie,
    borderWidth: wyglad.grubosc, borderRadius: wyglad.promien,
    borderColor: wyglad.obramowanie && `color-mix(in srgb, ${wyglad.obramowanie}, transparent ${100 - (wyglad.krycieRamki ?? 100)}%)`,
    '--kokpit-tytul': wyglad.tytul && `${wyglad.tytul}px`,
    '--kokpit-wartosc': wyglad.wartosc && `${wyglad.wartosc}px`,
    '--kokpit-opis': wyglad.opis && `${wyglad.opis}px`,
    '--kokpit-odstep': wyglad.odstep === undefined ? undefined : `${wyglad.odstep}px`,
  } as CSSProperties
}

function BlokNaSiatce({ blok, narzedzia, dzieci, kompakt }: {
  blok: BlokKokpitu; narzedzia?: (blok: BlokKokpitu) => ReactNode; dzieci: ReactNode; kompakt: boolean
}) {
  const [obszarDialogu, ustawObszarDialogu] = useState<Element>()
  const definicja = definicjaBloku(blok.typ)
  const nazwa = definicja?.nazwa ?? 'Nieznany blok'
  return <article className={`kokpit__blok ${blok.typ === 'zegar' ? 'kokpit__blok--zegar' : ''}`} style={stylBloku(blok)} data-kompakt={kompakt}>
    <div className="kokpit__tresc-bloku">
      {(narzedzia || blok.wyglad.pokazTytul !== false) && <h2><span aria-hidden="true">{definicja?.ikona ?? '?'}</span> {nazwa}</h2>}
      {narzedzia ? narzedzia(blok) : !obszarDialogu && dzieci}
    </div>
    {kompakt && <button type="button" className="kokpit__kompakt" aria-label={`Pokaż blok: ${nazwa}`} title={nazwa}
      onClick={(zdarzenie) => ustawObszarDialogu(zdarzenie.currentTarget.closest('.kokpit') ?? document.body)}>{definicja?.ikona ?? '?'}</button>}
    {kompakt && obszarDialogu && createPortal(<Modal tytul={nazwa} zamknij={() => ustawObszarDialogu(undefined)}>{dzieci}</Modal>, obszarDialogu)}
  </article>
}

export function RendererUkladu({ plansza, data, tryb, sesja, etykieta, ciagly, wysokosc, narzedzia, podglad, zdarzenia, zmienPlansze, trybAmbient, czytajModuly = true }: {
  plansza: PlanszaKokpitu; data: string; tryb: TrybKokpitu; etykieta: string; ciagly?: boolean; wysokosc?: string
  sesja?: KontoUzytkownika
  zmienPlansze?: (kierunek: number) => void
  trybAmbient?: boolean
  czytajModuly?: boolean
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
      const dozwolony = definicja && dostepKonta && (!modul || (czytajModuly && gotowyDostep && moze(modul)))
      if (!narzedzia && blok.widocznosc !== 'zawsze' && blok.widocznosc !== tryb) return null
      return <BlokNaSiatce key={`${plansza.id}:${blok.id}:${tryb}`} blok={blok} narzedzia={narzedzia} kompakt={!narzedzia && !trybAmbient}
        dzieci={dozwolony ? <TrescBloku blok={blok} data={data} tryb={tryb} sesja={sesja} zmienPlansze={zmienPlansze} /> : <p>Blok niedostępny.</p>} />
    })}
    {podglad && <div className="kokpit__podglad" data-kolizja={!podglad.poprawny} style={stylBloku({
      ...podglad.blok, wyglad: {},
      x: Math.max(0, Math.min(podglad.blok.x, plansza.kolumny - 1)), y: Math.max(0, Math.min(podglad.blok.y, plansza.wiersze - 1)),
      szerokosc: Math.max(1, Math.min(podglad.blok.szerokosc, plansza.kolumny - Math.max(0, podglad.blok.x))),
      wysokosc: Math.max(1, Math.min(podglad.blok.wysokosc, plansza.wiersze - Math.max(0, podglad.blok.y))),
    })} aria-hidden="true" />}
    {!plansza.bloki.length && <p className="kokpit__pusta">Pusta plansza</p>}
  </section>
}
