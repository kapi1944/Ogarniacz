import { useEffect, useState } from 'react'
import type { EncjaBazowa, KonfliktSynchronizacji, NazwaTabeli } from '../../domain/typy'
import type { RozstrzygniecieKonfliktu, WyborWartosciKonfliktu } from '../../services/SyncEngine'

const NAZWY_RODZAJOW_DANYCH: Partial<Record<NazwaTabeli, string>> = {
  zadania: 'Zadanie',
  projekty: 'Projekt',
  skrzynka: 'Element Poczekalni',
  blokiCzasu: 'Blok czasu',
  grafikPracy: 'Dzień grafiku pracy',
  wyjatkiGrafiku: 'Wyjątek grafiku',
  urlopy: 'Urlop',
  nawyki: 'Nawyk',
  dziennikNawykow: 'Wpis dziennika nawyku',
  leki: 'Lek',
  dziennikLekow: 'Wpis dziennika leku',
  wizyty: 'Wizyta',
  skierowania: 'Skierowanie',
  recepty: 'Recepta',
  terapie: 'Terapia',
  wpisyTerapii: 'Wpis terapii',
  przypomnienia: 'Przypomnienie',
  listyZakupow: 'Lista zakupów',
  pozycjeZakupow: 'Pozycja listy zakupów',
  rachunki: 'Rachunek',
  platnosciRachunkow: 'Płatność rachunku',
  notatki: 'Notatka',
  pomysly: 'Pomysł',
  naPozniej: 'Element „Na później”',
  cele: 'Cel',
  kontakty: 'Kontakt',
  dokumenty: 'Dokument',
  wydatki: 'Wydatek',
  platnosciStale: 'Płatność stała',
  planyRat: 'Plan rat',
  raty: 'Rata',
  budzety: 'Budżet',
  kontaFinansowe: 'Konto finansowe',
  miejsca: 'Miejsce',
  pojazdy: 'Pojazd',
  terminyWaznosci: 'Termin ważności',
  uprawnienia: 'Uprawnienie',
  edytorzy: 'Profil Edytora',
  definicjeWlasnychPolRejestru: 'Własne pole Rejestru',
  widokiRejestru: 'Widok Rejestru',
  ustawienia: 'Ustawienia',
}

const ETYKIETY_POL: Record<string, string> = {
  tytul: 'Tytuł',
  nazwa: 'Nazwa',
  opis: 'Opis',
  tresc: 'Treść',
  status: 'Status',
  stan: 'Stan',
  termin: 'Termin',
  data: 'Data',
  godzina: 'Godzina',
  priorytet: 'Priorytet',
  aktywny: 'Aktywny',
  aktywna: 'Aktywna',
  usunietoAt: 'Stan rekordu',
}

const POLA_NAZWY_REKORDU = ['tytul', 'nazwa', 'tresc', 'opis', 'nazwaPliku', 'numerRejestracyjny']
const POLA_TECHNICZNE = new Set(['id', 'createdAt', 'updatedAt', 'installationId', 'revision'])

interface RoznicaKonfliktu {
  pole: string
  etykieta: string
  lokalna: string
  zdalna: string
  moznaPolaczyc: boolean
}

interface PrezentacjaKonfliktu {
  rodzajDanych: string
  nazwaRekordu: string
  czasLokalny: string
  czasZdalny: string
  roznice: RoznicaKonfliktu[]
}

function rozdzielNazweTechniczna(nazwa: string): string {
  const tekst = nazwa
    .replace(/([a-ząćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return tekst ? `${tekst[0].toLocaleUpperCase('pl-PL')}${tekst.slice(1)}` : 'Pole'
}

function czyPoleTechniczne(pole: string): boolean {
  return POLA_TECHNICZNE.has(pole) || /Ids?$/i.test(pole)
}

function kanonizuj(wartosc: unknown): string {
  if (wartosc === null || typeof wartosc !== 'object') return JSON.stringify(wartosc) ?? 'undefined'
  if (typeof Blob !== 'undefined' && wartosc instanceof Blob) return JSON.stringify({ typ: wartosc.type, rozmiar: wartosc.size })
  if (Array.isArray(wartosc)) return `[${wartosc.map(kanonizuj).join(',')}]`
  return `{${Object.entries(wartosc)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([klucz, element]) => `${JSON.stringify(klucz)}:${kanonizuj(element)}`)
    .join(',')}}`
}

function pokazWartosc(pole: string, wartosc: unknown): string {
  if (pole === 'usunietoAt') {
    if (!wartosc) return 'rekord istnieje'
    return `rekord usunięty (${sformatujCzas(String(wartosc))})`
  }
  if (wartosc === undefined || wartosc === null) return 'brak'
  if (wartosc === '') return 'pusta wartość'
  if (typeof wartosc === 'boolean') return wartosc ? 'tak' : 'nie'
  if (typeof wartosc === 'string' || typeof wartosc === 'number') return String(wartosc)
  if (typeof Blob !== 'undefined' && wartosc instanceof Blob) return `plik ${wartosc.type || 'bez typu'} (${wartosc.size} B)`
  return JSON.stringify(wartosc, null, 2) ?? String(wartosc)
}

function czyProstaWartosc(wartosc: unknown): boolean {
  return wartosc === undefined || wartosc === null || ['string', 'number', 'boolean'].includes(typeof wartosc)
}

function sformatujCzas(wartosc: string): string {
  const data = new Date(wartosc)
  return Number.isNaN(data.getTime()) ? 'czas nieznany' : data.toLocaleString('pl-PL')
}

function jakoRekord(encja: EncjaBazowa): Record<string, unknown> {
  return encja as unknown as Record<string, unknown>
}

function znajdzNazweRekordu(lokalny: EncjaBazowa, zdalny: EncjaBazowa): string {
  const rekordy = [jakoRekord(lokalny), jakoRekord(zdalny)]
  for (const pole of POLA_NAZWY_REKORDU) {
    for (const rekord of rekordy) {
      const wartosc = rekord[pole]
      if (typeof wartosc === 'string' && wartosc.trim()) {
        return wartosc.trim().length > 100 ? `${wartosc.trim().slice(0, 97)}…` : wartosc.trim()
      }
    }
  }
  return 'Rekord bez nazwy'
}

function przygotujPrezentacjeKonfliktu(konflikt: KonfliktSynchronizacji): PrezentacjaKonfliktu {
  const lokalny = jakoRekord(konflikt.lokalny)
  const zdalny = jakoRekord(konflikt.zdalny)
  const pola = [...new Set([...Object.keys(lokalny), ...Object.keys(zdalny)])]
    .filter((pole) => !czyPoleTechniczne(pole) && kanonizuj(lokalny[pole]) !== kanonizuj(zdalny[pole]))
    .sort((a, b) => a.localeCompare(b, 'pl-PL'))

  return {
    rodzajDanych: NAZWY_RODZAJOW_DANYCH[konflikt.tabela as NazwaTabeli] ?? rozdzielNazweTechniczna(konflikt.tabela),
    nazwaRekordu: znajdzNazweRekordu(konflikt.lokalny, konflikt.zdalny),
    czasLokalny: sformatujCzas(konflikt.lokalny.updatedAt),
    czasZdalny: sformatujCzas(konflikt.zdalny.updatedAt),
    roznice: pola.map((pole) => ({
      pole,
      etykieta: ETYKIETY_POL[pole] ?? rozdzielNazweTechniczna(pole),
      lokalna: pokazWartosc(pole, lokalny[pole]),
      zdalna: pokazWartosc(pole, zdalny[pole]),
      moznaPolaczyc: pole !== 'usunietoAt' && czyProstaWartosc(lokalny[pole]) && czyProstaWartosc(zdalny[pole]),
    })),
  }
}

interface KonfliktSynchronizacjiProps {
  konflikt: KonfliktSynchronizacji
  rozstrzygnij: (id: string, rozstrzygniecie: RozstrzygniecieKonfliktu) => void | Promise<void>
}

export function KartaKonfliktuSynchronizacji({ konflikt, rozstrzygnij }: KonfliktSynchronizacjiProps) {
  const prezentacja = przygotujPrezentacjeKonfliktu(konflikt)
  const [tryb, ustawTryb] = useState<RozstrzygniecieKonfliktu['typ']>()
  const [wybranePola, ustawWybranePola] = useState<Record<string, WyborWartosciKonfliktu>>({})
  const [rozstrzyganie, ustawRozstrzyganie] = useState(false)
  const [bladRozstrzygania, ustawBladRozstrzygania] = useState('')
  const moznaPolaczycRecznie = !konflikt.lokalny.usunietoAt
    && !konflikt.zdalny.usunietoAt
    && prezentacja.roznice.length > 0
    && prezentacja.roznice.every(({ moznaPolaczyc }) => moznaPolaczyc)

  useEffect(() => {
    ustawTryb(undefined)
    ustawWybranePola({})
    ustawRozstrzyganie(false)
    ustawBladRozstrzygania('')
  }, [konflikt.id, konflikt.updatedAt])

  const wybierzTryb = (nowyTryb: RozstrzygniecieKonfliktu['typ']) => {
    ustawTryb(nowyTryb)
    if (nowyTryb === 'reczny') {
      ustawWybranePola(Object.fromEntries(prezentacja.roznice.map(({ pole }) => [pole, 'lokalny'])))
    }
  }

  const zatwierdz = async () => {
    if (!tryb) return
    const rozstrzygniecie: RozstrzygniecieKonfliktu = tryb === 'reczny'
      ? { typ: 'reczny', pola: wybranePola }
      : { typ: tryb }
    ustawRozstrzyganie(true)
    ustawBladRozstrzygania('')
    try {
      await rozstrzygnij(konflikt.id, rozstrzygniecie)
    } catch {
      ustawBladRozstrzygania('Nie udało się zapisać rozwiązania konfliktu. Spróbuj ponownie.')
    } finally {
      ustawRozstrzyganie(false)
    }
  }

  return <article className="konflikt-synchronizacji">
    <header>
      <span>{prezentacja.rodzajDanych}</span>
      <h4>{prezentacja.nazwaRekordu}</h4>
    </header>
    <div className="konflikt-synchronizacji__czasy">
      <div><strong>Wersja z tego urządzenia</strong><time dateTime={konflikt.lokalny.updatedAt}>{prezentacja.czasLokalny}</time></div>
      <div><strong>Wersja z serwera</strong><time dateTime={konflikt.zdalny.updatedAt}>{prezentacja.czasZdalny}</time></div>
    </div>
    <h5>Różniące się pola</h5>
    {prezentacja.roznice.length > 0 ? <div className="konflikt-synchronizacji__tabela"><table>
      <thead><tr><th>Pole</th><th>To urządzenie</th><th>Serwer</th></tr></thead>
      <tbody>{prezentacja.roznice.map((roznica) => <tr key={roznica.pole}><th>{roznica.etykieta}</th>
        <td>{tryb === 'reczny' ? <label className="konflikt-synchronizacji__wybor-pola"><input type="radio" name={`${konflikt.id}-${roznica.pole}`} checked={wybranePola[roznica.pole] === 'lokalny'} onChange={() => ustawWybranePola((obecne) => ({ ...obecne, [roznica.pole]: 'lokalny' }))} /><span>{roznica.lokalna}</span></label> : roznica.lokalna}</td>
        <td>{tryb === 'reczny' ? <label className="konflikt-synchronizacji__wybor-pola"><input type="radio" name={`${konflikt.id}-${roznica.pole}`} checked={wybranePola[roznica.pole] === 'zdalny'} onChange={() => ustawWybranePola((obecne) => ({ ...obecne, [roznica.pole]: 'zdalny' }))} /><span>{roznica.zdalna}</span></label> : roznica.zdalna}</td>
      </tr>)}</tbody>
    </table></div> : <p className="tekst-pomocniczy">Wersje różnią się tylko metadanymi technicznymi.</p>}
    <p className="tekst-pomocniczy">Obie wersje pozostaną zapisane do czasu zatwierdzenia decyzji.</p>
    <div className="akcje-backupu konflikt-synchronizacji__tryby">
      <button type="button" className="przycisk przycisk--drugorzedny" aria-pressed={tryb === 'lokalny'} onClick={() => wybierzTryb('lokalny')}>Wybierz wersję z tego urządzenia</button>
      <button type="button" className="przycisk przycisk--drugorzedny" aria-pressed={tryb === 'zdalny'} onClick={() => wybierzTryb('zdalny')}>Wybierz wersję z serwera</button>
      {moznaPolaczycRecznie && <button type="button" className="przycisk przycisk--drugorzedny" aria-pressed={tryb === 'reczny'} onClick={() => wybierzTryb('reczny')}>Połącz pola ręcznie</button>}
    </div>
    {tryb === 'reczny' && <p className="tekst-pomocniczy">W każdym wierszu wybierz wartość, którą chcesz zachować.</p>}
    {bladRozstrzygania && <p className="komunikat komunikat--blad" role="alert">{bladRozstrzygania}</p>}
    <div className="akcje-backupu">
      <button type="button" className="przycisk przycisk--glowny" disabled={!tryb || rozstrzyganie} onClick={() => void zatwierdz()}>{rozstrzyganie ? 'Zapisywanie…' : 'Zatwierdź rozwiązanie'}</button>
    </div>
  </article>
}
