import { useEffect, useId, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { KafelekDnia } from '../../components/kalendarz/KafelekDnia'
import { Komunikat } from '../../components/Interfejs'
import type { DaneDnia } from '../pulpit/logikaDanychDnia'
import { czteryTygodnie, datyZakresu } from './logikaHoryzontu'
import type { ZakresDat } from '../../domain/elementyOgarniacza'
import '../pulpit/tydzien.css'

function WierszTygodnia({ zakres, dzisiaj, dni, ladowanie, wybranaData, wybierz, otwieraDialog }: {
  zakres: ZakresDat
  dzisiaj: string
  dni: DaneDnia[]
  ladowanie: boolean
  wybranaData: string
  wybierz: (data: string, zrodlo: HTMLButtonElement) => void
  otwieraDialog: boolean
}) {
  const wiersz = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = wiersz.current
    const dzisiejszy = element?.querySelector<HTMLButtonElement>('[aria-current="date"]')
    if (element && dzisiejszy) element.scrollLeft = Math.max(0, dzisiejszy.offsetLeft - (element.clientWidth - dzisiejszy.offsetWidth) / 2)
  }, [dzisiaj])
  return <div ref={wiersz} className="wiersz-tygodnia" role="group" aria-label={`Tydzień od ${format(parseISO(zakres.od), 'd MMMM', { locale: pl })}`}>
    {datyZakresu(zakres).map((data) => {
      const dzien = dni.find((dane) => dane.data === data)
      const terminy = otwieraDialog ? dzien?.najwazniejszeTerminy.map((element) => `${element.godzina ? `${element.godzina} · ` : ''}${element.tytul}`) ?? [] : []
      return <KafelekDnia key={data} data={data} dzisiaj={dzisiaj}
        liczbaDzialan={ladowanie ? undefined : dzien?.liczbaOtwartych} terminy={terminy}
        zakresPracy={dzien?.zakresPracy} wybrany={data === wybranaData} otwieraDialog={otwieraDialog} otworz={wybierz} />
    })}
  </div>
}

export function HoryzontTygodniowy({ dzisiaj, dni, ladowanie = false, blad = false, otworz }: {
  dzisiaj: string
  dni: DaneDnia[]
  ladowanie?: boolean
  blad?: boolean
  otworz?: (data: string, zrodlo: HTMLButtonElement) => void
}) {
  const [rozwiniety, ustawRozwiniety] = useState(false)
  const [wybranaData, ustawWybranaDate] = useState(dzisiaj)
  const identyfikator = useId()
  const tygodnie = czteryTygodnie(dzisiaj)
  const wybierz = (data: string, zrodlo: HTMLButtonElement) => {
    ustawWybranaDate(data)
    otworz?.(data, zrodlo)
  }
  const wiersz = (zakres: ZakresDat) => <WierszTygodnia zakres={zakres} dzisiaj={dzisiaj} dni={dni} ladowanie={ladowanie} wybranaData={wybranaData} wybierz={wybierz} otwieraDialog={Boolean(otworz)} />
  return <section className="karta przeglad-tygodnia" aria-label="Horyzont tygodniowy">
    <h2>Ten tydzień</h2>
    {blad && <Komunikat typ="blad">Nie udało się pobrać części danych. Liczniki mogą być niepełne.</Komunikat>}
    {wiersz(tygodnie[0])}
    <button type="button" className="przycisk przycisk--tekstowy" aria-expanded={rozwiniety} aria-controls={identyfikator} onClick={() => ustawRozwiniety((wartosc) => !wartosc)}>{rozwiniety ? 'Zwiń kolejne 3 tygodnie' : 'Pokaż kolejne 3 tygodnie'}</button>
    <div id={identyfikator} hidden={!rozwiniety}>
      {rozwiniety && <div className="przeglad-tygodnia__kolejne">{tygodnie.slice(1).map((zakres) => <div key={zakres.od}>
        <h3>{format(parseISO(zakres.od), 'd MMMM', { locale: pl })} – {format(parseISO(zakres.do), 'd MMMM', { locale: pl })}</h3>
        {wiersz(zakres)}
      </div>)}</div>}
    </div>
  </section>
}
