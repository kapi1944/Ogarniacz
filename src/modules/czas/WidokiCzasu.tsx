import { useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { Check, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Karta, Komunikat, Modal, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { dzisiajIso, terazIso, utworzMetadane } from '../../domain/fabryki'
import type { BlokCzasu, GrafikPracy, WyjatekGrafiku } from '../../domain/typy'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { zaproponujPlan, type WynikPlanera } from '../../services/PlanerService'

const dni = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']

function zmienCzas(iso: string, godzina: string): string {
  return `${iso.slice(0, 10)}T${godzina}:00`
}

export function WidokPlanera() {
  const [data, ustawDate] = useState(dzisiajIso())
  const [tryb, ustawTryb] = useState<'dzien' | 'wieczor'>('dzien')
  const [wynik, ustawWynik] = useState<WynikPlanera>()
  const [komunikat, ustawKomunikat] = useState('')
  const [reczneDodawanie, ustawReczneDodawanie] = useState(false)
  const { dane: zadania } = useRepozytorium('zadania')
  const { dane: nawyki } = useRepozytorium('nawyki')
  const { dane: wizyty } = useRepozytorium('wizyty')
  const { dane: bloki, repozytorium } = useRepozytorium('blokiCzasu')
  const { dane: grafik } = useRepozytorium('grafikPracy')
  const { dane: wyjatki } = useRepozytorium('wyjatkiGrafiku')
  const blokiDnia = bloki.filter((blok) => blok.poczatek.startsWith(data)).sort((a, b) => a.poczatek.localeCompare(b.poczatek))

  const generuj = (odTeraz = false) => {
    const odGodziny = odTeraz && data === dzisiajIso() ? format(new Date(), 'HH:mm') : undefined
    ustawWynik(zaproponujPlan({ data, tryb, zadania, nawyki, wizyty, bloki: blokiDnia, grafik, wyjatkiGrafiku: wyjatki, odGodziny }))
    ustawKomunikat('Przygotowano lokalną, deterministyczną propozycję. Zmień wybrane bloki albo zaakceptuj całość.')
  }

  const zaakceptujWszystko = async () => {
    if (!wynik) return
    await repozytorium.zapiszWiele(wynik.propozycje.map((blok) => ({ ...blok, status: 'zaakceptowany' as const })))
    ustawWynik(undefined)
    ustawKomunikat('Plan został zaakceptowany i zapisany lokalnie.')
  }

  const aktualizujPropozycje = (id: string, pole: 'poczatek' | 'koniec', godzina: string) => {
    if (!wynik) return
    ustawWynik({ ...wynik, propozycje: wynik.propozycje.map((blok) => blok.id === id ? { ...blok, [pole]: zmienCzas(blok[pole], godzina) } : blok) })
  }

  return <div className="widok">
    <NaglowekWidoku tytul="Planer dnia" opis="Realistyczna propozycja z ochroną pracy, wizyt i twardych bloków. Obowiązki zajmują najwyżej 75% dostępnego czasu." akcje={<button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawReczneDodawanie(true)}><Plus aria-hidden="true" />Blok ręczny</button>} />
    <Karta>
      <div className="pasek-planera">
        <label><span>Dzień</span><input type="date" value={data} onChange={(e) => { ustawDate(e.target.value); ustawWynik(undefined) }} /></label>
        <label><span>Zakres</span><select value={tryb} onChange={(e) => ustawTryb(e.target.value as typeof tryb)}><option value="dzien">Cały dzień</option><option value="wieczor">Wieczór od 16:00</option></select></label>
        <button type="button" className="przycisk przycisk--glowny" onClick={() => generuj(false)}>Zaproponuj plan</button>
        {data === dzisiajIso() && <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => generuj(true)}><RefreshCw aria-hidden="true" />Przebuduj od teraz</button>}
      </div>
    </Karta>
    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}

    {wynik && <Karta klasa="propozycja-planu">
      <div className="naglowek-karty"><div><h2>Propozycja</h2><p>{wynik.minutyObowiazkow} min obowiązków z {wynik.minutyDostepne} min dostępnych ({wynik.wykorzystanieProcent}%). Reszta pozostaje buforem lub czasem wolnym.</p></div><div className="naglowek-widoku__akcje"><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawWynik(undefined)}><X aria-hidden="true" />Odrzuć</button><button type="button" className="przycisk przycisk--glowny" onClick={zaakceptujWszystko}><Check aria-hidden="true" />Akceptuj plan</button></div></div>
      <div className="lista-blokow">{wynik.propozycje.map((blok) => <article className={`blok-planu blok-planu--${blok.typ}`} key={blok.id}><div className="blok-planu__czas"><input aria-label="Początek bloku" type="time" value={blok.poczatek.slice(11, 16)} onChange={(e) => aktualizujPropozycje(blok.id, 'poczatek', e.target.value)} /><span>–</span><input aria-label="Koniec bloku" type="time" value={blok.koniec.slice(11, 16)} onChange={(e) => aktualizujPropozycje(blok.id, 'koniec', e.target.value)} /></div><div><strong>{blok.tytul}</strong><small>{blok.typ} · {blok.elastycznosc}</small></div><button type="button" className="przycisk-ikona" title="Usuń z propozycji" onClick={() => ustawWynik({ ...wynik, propozycje: wynik.propozycje.filter((x) => x.id !== blok.id) })}><Trash2 aria-hidden="true" /></button></article>)}</div>
    </Karta>}

    <Karta>
      <div className="naglowek-karty"><div><h2>Zapisany plan</h2><p>Bloki można przesunąć, oznaczyć jako wykonane lub usunąć.</p></div></div>
      {blokiDnia.length === 0 ? <PustyStan tytul="Brak zapisanych bloków" opis="Wygeneruj propozycję lub dodaj blok ręcznie." /> : <div className="lista-blokow">{blokiDnia.map((blok) => <article className={`blok-planu blok-planu--${blok.typ}`} key={blok.id}><div className="blok-planu__czas"><input aria-label="Początek" type="time" value={blok.poczatek.slice(11, 16)} onChange={(e) => repozytorium.zapisz({ ...blok, poczatek: zmienCzas(blok.poczatek, e.target.value) })} /><span>–</span><input aria-label="Koniec" type="time" value={blok.koniec.slice(11, 16)} onChange={(e) => repozytorium.zapisz({ ...blok, koniec: zmienCzas(blok.koniec, e.target.value) })} /></div><div><strong>{blok.tytul}</strong><small>{blok.typ} · {blok.elastycznosc}</small></div><Znacznik wariant={blok.status === 'wykonany' ? 'sukces' : 'neutralny'}>{blok.status}</Znacznik><button type="button" className="przycisk-ikona przycisk-ikona--sukces" title="Wykonane" onClick={() => repozytorium.zapisz({ ...blok, status: 'wykonany' })}><Check aria-hidden="true" /></button><button type="button" className="przycisk-ikona przycisk-ikona--niebezpieczny" title="Usuń blok" onClick={() => repozytorium.usun(blok.id)}><Trash2 aria-hidden="true" /></button></article>)}</div>}
    </Karta>
    {reczneDodawanie && <FormularzBloku data={data} zamknij={() => ustawReczneDodawanie(false)} zapisz={async (blok) => { await repozytorium.zapisz(blok); ustawReczneDodawanie(false) }} />}
  </div>
}

function FormularzBloku({ data, zamknij, zapisz }: { data: string; zamknij: () => void; zapisz: (blok: BlokCzasu) => Promise<void> }) {
  const [tytul, ustawTytul] = useState('')
  const [od, ustawOd] = useState('17:00')
  const [doGodziny, ustawDo] = useState('18:00')
  const [typ, ustawTyp] = useState<BlokCzasu['typ']>('inne')
  return <Modal tytul="Dodaj blok czasu" zamknij={zamknij}><form className="formularz" onSubmit={(e) => { e.preventDefault(); if (!tytul.trim() || doGodziny <= od) return; zapisz({ ...utworzMetadane(), tytul, poczatek: `${data}T${od}:00`, koniec: `${data}T${doGodziny}:00`, typ, elastycznosc: typ === 'wizyta' || typ === 'praca' ? 'twardy' : 'elastyczny', status: 'zaakceptowany' }) }}><label className="pole pole--pelne"><span>Nazwa *</span><input required value={tytul} onChange={(e) => ustawTytul(e.target.value)} /></label><label className="pole"><span>Od</span><input type="time" value={od} onChange={(e) => ustawOd(e.target.value)} /></label><label className="pole"><span>Do</span><input type="time" value={doGodziny} onChange={(e) => ustawDo(e.target.value)} /></label><label className="pole pole--pelne"><span>Typ</span><select value={typ} onChange={(e) => ustawTyp(e.target.value as BlokCzasu['typ'])}><option value="inne">Inne</option><option value="zadanie">Zadanie</option><option value="wizyta">Wizyta</option><option value="nawyk">Nawyk</option><option value="przerwa">Przerwa</option><option value="wolne">Czas wolny</option></select></label><div className="akcje-formularza pole--pelne"><button type="button" className="przycisk przycisk--drugorzedny" onClick={zamknij}>Anuluj</button><button type="submit" className="przycisk przycisk--glowny">Zapisz</button></div></form></Modal>
}

export function WidokGrafiku() {
  const { dane: grafik, repozytorium: repoGrafiku } = useRepozytorium('grafikPracy')
  const { dane: wyjatki, repozytorium: repoWyjatkow } = useRepozytorium('wyjatkiGrafiku')
  const [formularz, ustawFormularz] = useState({ data: '', pracuje: true, od: '08:00', do: '16:00', opis: '' })
  const [komunikat, ustawKomunikat] = useState('')
  const uporzadkowany = [...grafik].sort((a, b) => (a.dzienTygodnia === 0 ? 7 : a.dzienTygodnia) - (b.dzienTygodnia === 0 ? 7 : b.dzienTygodnia))

  const zmienGrafik = (wpis: GrafikPracy, zmiany: Partial<GrafikPracy>) => repoGrafiku.zapisz({ ...wpis, ...zmiany, updatedAt: terazIso() })
  const dodajWyjatek = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    if (!formularz.data) return
    const wyjatek: WyjatekGrafiku = { ...utworzMetadane(), data: formularz.data, pracuje: formularz.pracuje, od: formularz.pracuje ? formularz.od : undefined, do: formularz.pracuje ? formularz.do : undefined, opis: formularz.opis || undefined }
    await repoWyjatkow.zapisz(wyjatek)
    ustawFormularz({ data: '', pracuje: true, od: '08:00', do: '16:00', opis: '' })
    ustawKomunikat('Wyjątek grafiku zapisany.')
  }

  return <div className="widok">
    <NaglowekWidoku tytul="Grafik pracy" opis="Stałe godziny tygodnia i wyjątki dla konkretnych dat. Planer traktuje pracę jako ograniczenie." />
    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}
    <Karta>
      <h2>Standardowy tydzień</h2>
      <div className="grafik-tygodnia">{uporzadkowany.map((wpis) => <div className="grafik-wiersz" key={wpis.id}><label className="przelacznik"><input type="checkbox" checked={wpis.aktywny} onChange={(e) => zmienGrafik(wpis, { aktywny: e.target.checked })} /><span /></label><strong>{dni[wpis.dzienTygodnia]}</strong><input aria-label={`Od ${dni[wpis.dzienTygodnia]}`} type="time" disabled={!wpis.aktywny} value={wpis.od} onChange={(e) => zmienGrafik(wpis, { od: e.target.value })} /><span>–</span><input aria-label={`Do ${dni[wpis.dzienTygodnia]}`} type="time" disabled={!wpis.aktywny} value={wpis.do} onChange={(e) => zmienGrafik(wpis, { do: e.target.value })} /></div>)}</div>
    </Karta>
    <section className="siatka-dwie-kolumny">
      <Karta><h2>Dodaj wyjątek</h2><form className="formularz" onSubmit={dodajWyjatek}><label className="pole pole--pelne"><span>Data *</span><input type="date" required value={formularz.data} onChange={(e) => ustawFormularz({ ...formularz, data: e.target.value })} /></label><label className="pole pole--pelne pole-checkbox"><input type="checkbox" checked={formularz.pracuje} onChange={(e) => ustawFormularz({ ...formularz, pracuje: e.target.checked })} /><span>W tym dniu pracuję</span></label>{formularz.pracuje && <><label className="pole"><span>Od</span><input type="time" value={formularz.od} onChange={(e) => ustawFormularz({ ...formularz, od: e.target.value })} /></label><label className="pole"><span>Do</span><input type="time" value={formularz.do} onChange={(e) => ustawFormularz({ ...formularz, do: e.target.value })} /></label></>}<label className="pole pole--pelne"><span>Opis</span><input value={formularz.opis} onChange={(e) => ustawFormularz({ ...formularz, opis: e.target.value })} placeholder="np. urlop, krótszy dzień" /></label><button type="submit" className="przycisk przycisk--glowny pole--pelne">Dodaj wyjątek</button></form></Karta>
      <Karta><h2>Wyjątki</h2>{wyjatki.length === 0 ? <PustyStan tytul="Brak wyjątków" opis="Obowiązuje standardowy tydzień." /> : <div className="lista-kompaktowa">{[...wyjatki].sort((a, b) => a.data.localeCompare(b.data)).map((wpis) => <div key={wpis.id}><div><strong>{wpis.data}</strong><small>{wpis.pracuje ? `${wpis.od}–${wpis.do}` : 'Dzień wolny'}{wpis.opis ? ` · ${wpis.opis}` : ''}</small></div><button className="przycisk-ikona przycisk-ikona--niebezpieczny" type="button" title="Usuń wyjątek" onClick={() => repoWyjatkow.usun(wpis.id)}><Trash2 aria-hidden="true" /></button></div>)}</div>}</Karta>
    </section>
  </div>
}
