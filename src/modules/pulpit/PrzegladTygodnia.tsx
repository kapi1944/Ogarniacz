import { useState } from 'react'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { pl } from 'date-fns/locale'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import { KafelekDnia } from '../../components/kalendarz/KafelekDnia'
import { SkupienieDnia, type ZrodloSkupieniaDnia } from '../../components/kalendarz/SkupienieDnia'
import { Komunikat } from '../../components/Interfejs'
import { useElementyPlanuDnia } from './useElementyPlanuDnia'
import { PlanWybranegoDnia } from './PlanWybranegoDnia'
import './tydzien.css'

function WierszTygodnia({ poczatek, dzisiaj, elementy, otworz }: {
  poczatek: Date
  dzisiaj: string
  elementy: ElementOgarniacza[] | undefined
  otworz: (data: string, zrodlo: HTMLButtonElement) => void
}) {
  return <div className="wiersz-tygodnia" role="group" aria-label={`Tydzień od ${format(poczatek, 'd MMMM', { locale: pl })}`}>
    {Array.from({ length: 7 }, (_, indeks) => {
      const data = format(addDays(poczatek, indeks), 'yyyy-MM-dd')
      const dzialania = elementy?.filter((element) => element.data === data && element.status !== 'wykonany' && element.status !== 'anulowany' && element.status !== 'pominiety')
      const terminy = dzialania?.filter((element) => element.typ === 'wizyta' || element.typ === 'platnosc' || element.typ === 'samochod' || element.trybTerminu === 'koniec_dnia' || element.priorytet === 'pilny' || element.priorytet === 'asap')
        .slice(0, 2).map((element) => `${element.godzina ? `${element.godzina} · ` : ''}${element.tytul}`) ?? []
      return <KafelekDnia key={data} data={data} dzisiaj={dzisiaj} liczbaDzialan={dzialania?.length} terminy={terminy} otworz={otworz} />
    })}
  </div>
}

export function PrzegladTygodnia({ dzisiaj }: { dzisiaj: string }) {
  const [rozwiniety, ustawRozwiniety] = useState(false)
  const [wybranyDzien, ustawWybranyDzien] = useState<{ data: string; zrodlo: ZrodloSkupieniaDnia } | null>(null)
  const poczatek = startOfWeek(parseISO(dzisiaj), { weekStartsOn: 1 })
  const dane = useElementyPlanuDnia({ od: format(poczatek, 'yyyy-MM-dd'), do: format(addDays(poczatek, rozwiniety ? 27 : 6), 'yyyy-MM-dd') })
  const otworz = (data: string, element: HTMLButtonElement) => ustawWybranyDzien({ data, zrodlo: { element, prostokat: element.getBoundingClientRect() } })
  return <section className="karta przeglad-tygodnia pulpit-sekcja--tydzien" aria-label="Tydzień">
    <h2>Tydzień</h2>
    {dane?.blad && <Komunikat typ="blad">Nie udało się pobrać części danych. Liczniki i terminy mogą być niepełne.</Komunikat>}
    <WierszTygodnia poczatek={poczatek} dzisiaj={dzisiaj} elementy={dane?.elementy} otworz={otworz} />
    <button type="button" className="przycisk przycisk--tekstowy" aria-expanded={rozwiniety} onClick={() => ustawRozwiniety((wartosc) => !wartosc)}>{rozwiniety ? 'Zwiń kolejne 3 tygodnie' : 'Pokaż kolejne 3 tygodnie'}</button>
    {rozwiniety && <div className="przeglad-tygodnia__kolejne">{[7, 14, 21].map((przesuniecie) => <div key={przesuniecie}>
      <h3>{format(addDays(poczatek, przesuniecie), 'd MMMM', { locale: pl })} – {format(addDays(poczatek, przesuniecie + 6), 'd MMMM', { locale: pl })}</h3>
      <WierszTygodnia poczatek={addDays(poczatek, przesuniecie)} dzisiaj={dzisiaj} elementy={dane?.elementy} otworz={otworz} />
    </div>)}</div>}
    {wybranyDzien && <SkupienieDnia tytul={format(parseISO(wybranyDzien.data), 'EEEE, d MMMM yyyy', { locale: pl })} zrodlo={wybranyDzien.zrodlo} zamknieto={() => ustawWybranyDzien(null)}>
      {(zamknij) => <PlanWybranegoDnia data={wybranyDzien.data} zamknij={zamknij} />}
    </SkupienieDnia>}
  </section>
}
