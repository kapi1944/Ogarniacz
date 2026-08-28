import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertCircle, CheckCircle2, LayoutGrid, Plus } from 'lucide-react'
import { Karta, Komunikat, NaglowekWidoku, PustyStan } from '../../components/Interfejs'
import { utworzMetadane, dzisiajIso } from '../../domain/fabryki'
import { poprawnaGodzinaTerminu } from '../../domain/logikaTerminuZadania'
import type { ZakresZmianyHarmonogramu } from '../../domain/typy'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { DostawcaZadanPulpitu } from '../../providers/DostawcaZadanPulpitu'
import { FormularzHarmonogramuDnia } from './FormularzHarmonogramuDnia'
import { NawigatorDnia } from './NawigatorDnia'
import { OsCzasu } from './OsCzasu'
import {
  utworzHarmonogramDnia,
  utworzNowaReguleHarmonogramu,
  type EdycjaHarmonogramuDnia,
} from './logikaOsiCzasu'

const dostawcaZadan = new DostawcaZadanPulpitu()

function etykietaTerminuBezGodziny(tryb: string | undefined): string {
  if (tryb === 'koniec_dnia') return 'Do końca dnia'
  if (tryb === 'bez_godziny') return 'Bez godziny'
  return 'Wymaga poprawy godziny'
}

function wagaElementuBezGodziny(tryb: string | undefined): number {
  return tryb === 'koniec_dnia' ? 2 : tryb === 'bez_godziny' ? 0 : 1
}

function wagaPriorytetuElementu(priorytet: string | undefined): number {
  return priorytet === 'asap' ? 2 : priorytet === 'pilny' ? 1 : 0
}

function ograniczMinuty(wartosc: number): number {
  return Number.isFinite(wartosc) ? Math.min(180, Math.max(0, Math.round(wartosc))) : 0
}

export function WidokPulpitu() {
  const [data, ustawDate] = useState(dzisiajIso())
  const [edycjaHarmonogramu, ustawEdycjeHarmonogramu] = useState(false)
  const [komunikat, ustawKomunikat] = useState('')
  const { ustawienia, zapiszUstawienia, otworzSzybkieDodawanie } = useAplikacja()
  const { dane: wyjatki, repozytorium: repozytoriumWyjatkow } = useRepozytorium('wyjatkiGrafiku')
  const elementyDnia = useLiveQuery(
    () => dostawcaZadan.pobierzElementy({ od: data, do: data }),
    [data],
    [],
  )
  const wyjatekDnia = useMemo(() => [...wyjatki]
    .filter((wyjatek) => wyjatek.data === data)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0], [data, wyjatki])
  const harmonogram = useMemo(
    () => utworzHarmonogramDnia(data, ustawienia.harmonogram, wyjatekDnia),
    [data, ustawienia.harmonogram, wyjatekDnia],
  )
  const elementyOsi = elementyDnia.filter((element) => element.status !== 'wykonany' && element.trybTerminu === 'o_godzinie' && poprawnaGodzinaTerminu(element.godzina))
  const elementyBezGodziny = elementyDnia
    .filter((element) => element.status !== 'wykonany' && !elementyOsi.some((elementOsi) => elementOsi.id === element.id))
    .sort((a, b) => wagaElementuBezGodziny(b.trybTerminu) - wagaElementuBezGodziny(a.trybTerminu)
      || wagaPriorytetuElementu(b.priorytet) - wagaPriorytetuElementu(a.priorytet)
      || a.tytul.localeCompare(b.tytul, 'pl'))
  const elementyWykonane = elementyDnia.filter((element) => element.status === 'wykonany')

  const zapiszWyjatekDnia = async (edycja: EdycjaHarmonogramuDnia) => {
    await repozytoriumWyjatkow.zapisz({
      ...(wyjatekDnia ?? utworzMetadane()),
      data,
      pracuje: edycja.pracuje,
      od: edycja.pracuje ? edycja.odPracy : undefined,
      do: edycja.pracuje ? edycja.doPracy : undefined,
      dojazdDoPracyMinuty: edycja.pracuje ? ograniczMinuty(edycja.dojazdDoPracyMinuty) : 0,
      powrotZPracyMinuty: edycja.pracuje ? ograniczMinuty(edycja.powrotZPracyMinuty) : 0,
      dostepnoscDojazdu: edycja.dostepnoscDojazdu,
      opis: edycja.opis?.trim() || undefined,
    })
  }

  const zapiszZmianeHarmonogramu = async (edycja: EdycjaHarmonogramuDnia, zakres: ZakresZmianyHarmonogramu) => {
    if (zakres === 'tylko_ten_dzien') {
      await zapiszWyjatekDnia(edycja)
      ustawKomunikat('Zapisano wyjątek wyłącznie dla wybranego dnia.')
    } else {
      await zapiszUstawienia({ harmonogram: utworzNowaReguleHarmonogramu(ustawienia.harmonogram, data, edycja) })
      if (wyjatekDnia) await repozytoriumWyjatkow.usun(wyjatekDnia.id)
      ustawKomunikat('Zapisano nową domyślną regułę harmonogramu.')
    }
    ustawEdycjeHarmonogramu(false)
  }

  const przelaczDostepnosc = async () => {
    await zapiszWyjatekDnia({
      pracuje: harmonogram.pracuje,
      odPracy: harmonogram.odPracy,
      doPracy: harmonogram.doPracy,
      dojazdDoPracyMinuty: harmonogram.dojazdDoPracyMinuty,
      powrotZPracyMinuty: harmonogram.powrotZPracyMinuty,
      dostepnoscDojazdu: harmonogram.dostepnoscDojazdu === 'pelna' ? 'czesciowa' : 'pelna',
      opis: wyjatekDnia?.opis,
    })
    ustawKomunikat('Dostępność dojazdów zmieniono tylko dla wybranego dnia.')
  }

  const usunWyjatek = async () => {
    if (!wyjatekDnia) return
    await repozytoriumWyjatkow.usun(wyjatekDnia.id)
    ustawKomunikat('Przywrócono domyślną regułę harmonogramu dla tego dnia.')
  }

  return (
    <div className="widok widok-pulpitu">
      <NaglowekWidoku
        tytul="Pulpit"
        opis="Najważniejsze informacje teraz i w nadchodzących zakresach. Wybrana data steruje osią czasu, nie całym Pulpitem."
        akcje={<button type="button" className="przycisk przycisk--glowny" onClick={otworzSzybkieDodawanie}><Plus aria-hidden="true" />Szybko dodaj</button>}
      />
      <NawigatorDnia data={data} zmienDate={(nowaData) => { ustawDate(nowaData); ustawKomunikat('') }} />
      {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}

      {(ustawienia.pulpit.pokazAlerty || ustawienia.pulpit.pokazKafelki) && <section className="strefy-pulpitu">
        {ustawienia.pulpit.pokazAlerty && <Karta klasa="strefa-pulpitu strefa-pulpitu--alerty"><div className="tytul-karty"><AlertCircle aria-hidden="true" /><span>Alerty</span></div><h2>Obszar najważniejszych sygnałów</h2><p>Ta strefa nie zależy wyłącznie od wybranego dnia. Ranking zaległości i alertów modułowych pojawi się w Etapie 7.</p></Karta>}
        {ustawienia.pulpit.pokazKafelki && <Karta klasa="strefa-pulpitu"><div className="tytul-karty"><LayoutGrid aria-hidden="true" /><span>Kafelki</span></div><h2>Przekrojowe podsumowania</h2><p>Kafelki będą mogły prezentować zakresy 3, 7 i 30 dni niezależnie od daty osi czasu.</p></Karta>}
      </section>}

      {ustawienia.pulpit.pokazOsCzasu && <OsCzasu
        data={data}
        harmonogram={harmonogram}
        zakresSnu={{
          od: ustawienia.harmonogram.poczatekSnu,
          do: ustawienia.harmonogram.koniecSnu,
          skala: ustawienia.harmonogram.skalaSnuNaOsi,
        }}
        elementy={elementyOsi}
        zezwalajNaPelnaDostepnosc={ustawienia.harmonogram.zezwalajNaPelnaDostepnoscDojazdu}
        edytujHarmonogram={() => ustawEdycjeHarmonogramu(true)}
        przelaczDostepnosc={przelaczDostepnosc}
        usunWyjatek={usunWyjatek}
      />}

      <section className="sekcje-elementow-pulpitu">
        <Karta>
          <div className="naglowek-karty"><div><h2>Bez godziny</h2><p>Elementy przypisane do wybranego dnia bez konkretnej godziny.</p></div></div>
          {elementyBezGodziny.length === 0 ? <PustyStan tytul="Brak elementów bez godziny" opis="Zadania z trybem końca dnia i bez konkretnej godziny pojawią się tutaj." /> : <div className="lista-kompaktowa">{elementyBezGodziny.map((element) => <div key={element.id}><div><strong>{element.tytul}</strong><small>{etykietaTerminuBezGodziny(element.trybTerminu)}</small></div></div>)}</div>}
        </Karta>
        {ustawienia.pulpit.pokazWykonane && <Karta>
          <div className="naglowek-karty"><div><h2><CheckCircle2 aria-hidden="true" /> Wykonane</h2><p>Elementy zakończone dla wybranej daty.</p></div></div>
          {elementyWykonane.length === 0 ? <p className="tekst-pomocniczy">Brak wykonanych elementów.</p> : <div className="lista-kompaktowa">{elementyWykonane.map((element) => <div key={element.id}><div><strong>{element.tytul}</strong><small>{element.godzina ?? 'Bez godziny'}</small></div></div>)}</div>}
        </Karta>}
      </section>

      {edycjaHarmonogramu && <FormularzHarmonogramuDnia
        harmonogram={harmonogram}
        opis={wyjatekDnia?.opis}
        domyslnyZakres={ustawienia.harmonogram.domyslnyZakresZmiany}
        zezwalajNaPelnaDostepnosc={ustawienia.harmonogram.zezwalajNaPelnaDostepnoscDojazdu}
        zamknij={() => ustawEdycjeHarmonogramu(false)}
        zapisz={zapiszZmianeHarmonogramu}
      />}
    </div>
  )
}
