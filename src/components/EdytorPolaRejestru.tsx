import { utworzDefinicjePolaRejestru, type DefinicjaPolaRejestru, type TypPolaRejestru, type WartoscPolaWlasnego } from '../domain/rejestr'
import type { EncjaBazowa } from '../domain/typy'
import { PoleDaty } from './PoleDaty'
import { PoleCzasu } from './PoleCzasu'
import { PoleKwoty } from './PoleKwoty'
import { normalizujKwote, odczytajKwoteFormularza } from '../domain/kwoty'
import { PoleLiczbowe } from './PoleLiczbowe'
import { bladLiczby, czyJednostkaWEtykiecie, liczbaDoModelu, liczbaDoTekstu } from '../domain/liczby'

export interface DefinicjaPola {
  klucz: string
  etykieta: string
  typ?: 'text' | 'textarea' | 'date' | 'time' | 'number' | 'kwota' | 'email' | 'url' | 'select' | 'multiselect'
  kluczWaluty?: string
  wymagane?: boolean
  podpowiedz?: string
  min?: number | string
  max?: number | string
  krok?: number
  jednostka?: string
  opcje?: { wartosc: string; etykieta: string }[]
  widoczne?: (formularz: Record<string, string>) => boolean
  domyslnaWartosc?: string
}

export interface PoleDoEdycjiRejestru {
  definicja: DefinicjaPolaRejestru
  wymagane?: boolean
  podpowiedz?: string
  min?: number | string
  max?: number | string
  krok?: number
  jednostka?: string
  typHtml?: 'email'
  widoczne?: (formularz: Record<string, string>) => boolean
  domyslnaWartosc?: string
}

const typyStarychPol: Record<NonNullable<DefinicjaPola['typ']>, TypPolaRejestru> = {
  text: 'tekst',
  textarea: 'textarea',
  date: 'data',
  time: 'czas',
  number: 'liczba',
  kwota: 'kwota',
  email: 'tekst',
  url: 'url',
  select: 'select',
  multiselect: 'multiselect',
}

// Tymczasowy adapter dla widoków przekazujących dawną definicję formularza.
// Usunąć po przejściu wszystkich wywołań WidokRejestru na polaRejestru.
export function normalizujStarePolaRejestru(pola: DefinicjaPola[]): PoleDoEdycjiRejestru[] {
  return pola.map((pole) => ({
    definicja: {
      id: `system:${pole.klucz}`,
      zrodlo: 'systemowe',
      trybObslugi: 'bezposrednie',
      kluczWlasciwosci: pole.klucz,
      etykieta: pole.etykieta,
      typ: typyStarychPol[pole.typ ?? 'text'],
      kluczWaluty: pole.kluczWaluty,
      jednostka: pole.jednostka,
      opcje: pole.opcje,
    },
    wymagane: pole.wymagane,
    podpowiedz: pole.podpowiedz,
    min: pole.min,
    max: pole.max,
    krok: pole.krok ?? (pole.typ === 'number' ? 1 : undefined),
    jednostka: pole.jednostka,
    typHtml: pole.typ === 'email' ? 'email' : undefined,
    widoczne: pole.widoczne ? (formularz) => pole.widoczne!(Object.fromEntries(
      Object.entries(formularz).map(([klucz, wartosc]) => [klucz.startsWith('system:') ? klucz.slice(7) : klucz, wartosc]),
    )) : undefined,
    domyslnaWartosc: pole.domyslnaWartosc,
  }))
}

export function normalizujPolaRejestru(pola: DefinicjaPolaRejestru[]): PoleDoEdycjiRejestru[] {
  return pola.map((definicja) => ({ definicja: utworzDefinicjePolaRejestru(definicja), min: definicja.min, max: definicja.max, krok: definicja.krok, jednostka: definicja.jednostka }))
}

export function wartoscFormularzaPola(encja: EncjaBazowa | undefined, pole: PoleDoEdycjiRejestru, doWyswietlenia = false): string {
  const { definicja } = pole
  const wartosc = definicja.zrodlo === 'wlasne'
    ? encja?.polaWlasne?.[definicja.id]
    : definicja.trybObslugi === 'bezposrednie' ? (encja as unknown as Record<string, unknown> | undefined)?.[definicja.kluczWlasciwosci] : undefined
  if (Array.isArray(wartosc)) return wartosc.join(',')
  if (wartosc && typeof wartosc === 'object' && 'kwota' in wartosc && typeof wartosc.kwota === 'string' && 'waluta' in wartosc) return doWyswietlenia ? `${wartosc.kwota.replace('.', ',')} ${wartosc.waluta}` : JSON.stringify(wartosc)
  if (typeof wartosc === 'boolean') return String(wartosc)
  if (definicja.typ === 'liczba' && typeof wartosc === 'number') {
    const jednostka = pole.jednostka ?? definicja.jednostka
    return `${liczbaDoTekstu(wartosc)}${doWyswietlenia && jednostka && !czyJednostkaWEtykiecie(definicja.etykieta, jednostka) ? ` ${jednostka}` : ''}`
  }
  return wartosc === undefined || wartosc === null ? pole.domyslnaWartosc ?? '' : String(wartosc)
}

export function skonwertujWartoscPolaWlasnego(pole: DefinicjaPolaRejestru, wartosc: string): WartoscPolaWlasnego {
  if (pole.typ === 'checkbox') return wartosc === 'true'
  if (pole.typ === 'multiselect') return wartosc ? wartosc.split(',').filter(Boolean) : []
  if (pole.typ === 'kwota') {
    const dane = odczytajKwoteFormularza(wartosc)
    return dane.kwota ? { kwota: normalizujKwote(dane.kwota, dane.waluta), waluta: dane.waluta } : null
  }
  if (pole.typ === 'liczba') {
    if (!wartosc) return null
    const blad = bladLiczby(wartosc, pole)
    if (blad) throw new Error(`Pole „${pole.etykieta}”: ${blad}`)
    return liczbaDoModelu(wartosc)
  }
  if (!wartosc) return null
  if (pole.typ === 'url') {
    try {
      new URL(wartosc)
    } catch {
      throw new Error(`Pole „${pole.etykieta}” wymaga prawidłowego adresu URL.`)
    }
  }
  return wartosc
}

interface Wlasciwosci {
  pole: PoleDoEdycjiRejestru
  wartosc: string
  zmien: (wartosc: string) => void
  waluta?: string
  zmienWalute?: (waluta: string) => void
}

export function EdytorPolaRejestru({ pole, wartosc, zmien, waluta, zmienWalute }: Wlasciwosci) {
  const { definicja } = pole
  const wspolne = { required: pole.wymagane, placeholder: pole.podpowiedz }
  const tylkoOdczyt = definicja.zrodlo === 'systemowe' && definicja.trybObslugi === 'tylko_odczyt'
  const jednostka = pole.jednostka ?? definicja.jednostka

  if (definicja.typ === 'data' && !tylkoOdczyt) return <PoleDaty etykieta={definicja.etykieta} wartosc={wartosc} zmien={zmien} wymagane={pole.wymagane} min={typeof pole.min === 'string' ? pole.min : undefined} max={typeof pole.max === 'string' ? pole.max : undefined} krok={pole.krok} />
  if (definicja.typ === 'czas' && !tylkoOdczyt) return <PoleCzasu etykieta={definicja.etykieta} wartosc={wartosc} zmien={zmien} wymagane={pole.wymagane} min={typeof pole.min === 'string' ? pole.min : undefined} max={typeof pole.max === 'string' ? pole.max : undefined} krok={pole.krok} />
  if (definicja.typ === 'liczba' && !tylkoOdczyt) return <PoleLiczbowe etykieta={definicja.etykieta} wartosc={wartosc} zmien={zmien} wymagane={pole.wymagane} podpowiedz={pole.podpowiedz}
    min={pole.min ?? definicja.min} max={pole.max ?? definicja.max} krok={pole.krok ?? definicja.krok} jednostka={pole.jednostka ?? definicja.jednostka} />
  if (definicja.typ === 'kwota' && !tylkoOdczyt) {
    const wlasne = definicja.zrodlo === 'wlasne'
    const dane = wlasne ? odczytajKwoteFormularza(wartosc) : { kwota: wartosc, waluta: waluta ?? 'PLN' }
    return <PoleKwoty etykieta={definicja.etykieta} wartosc={dane.kwota} waluta={dane.waluta} wymagane={pole.wymagane} min={pole.min} max={pole.max} krok={pole.krok} modelLiczbowy={!wlasne}
      zmien={(kwota) => zmien(wlasne ? JSON.stringify({ ...dane, kwota }) : kwota)}
      zmienWalute={wlasne ? (waluta) => zmien(JSON.stringify({ ...dane, waluta })) : zmienWalute} />
  }

  return (
    <label className={definicja.typ === 'textarea' ? 'pole pole--pelne' : 'pole'}>
      <span>{definicja.etykieta}{pole.wymagane && ' *'}</span>
      {tylkoOdczyt ? <output>{wartosc || '—'}{wartosc && definicja.typ === 'liczba' && jednostka && !czyJednostkaWEtykiecie(definicja.etykieta, jednostka) ? ` ${jednostka}` : ''}</output> : definicja.typ === 'textarea' ? (
        <textarea {...wspolne} value={wartosc} onChange={(zdarzenie) => zmien(zdarzenie.target.value)} />
      ) : definicja.typ === 'checkbox' ? (
        <input type="checkbox" checked={wartosc === 'true'} onChange={(zdarzenie) => zmien(String(zdarzenie.target.checked))} />
      ) : definicja.typ === 'select' ? (
        <select required={pole.wymagane} value={wartosc} onChange={(zdarzenie) => zmien(zdarzenie.target.value)}>
          {!pole.wymagane && <option value="">—</option>}
          {definicja.opcje?.map((opcja) => <option key={opcja.wartosc} value={opcja.wartosc}>{opcja.etykieta}</option>)}
        </select>
      ) : definicja.typ === 'multiselect' ? (
        <select multiple value={wartosc.split(',').filter(Boolean)} onChange={(zdarzenie) => zmien(Array.from(zdarzenie.target.selectedOptions, (opcja) => opcja.value).join(','))}>
          {definicja.opcje?.map((opcja) => <option key={opcja.wartosc} value={opcja.wartosc}>{opcja.etykieta}</option>)}
        </select>
      ) : (
        <input
          {...wspolne}
          type={pole.typHtml ?? (definicja.typ === 'tekst' ? 'text' : definicja.typ === 'liczba' || definicja.typ === 'kwota' ? 'number' : definicja.typ)}
          min={pole.min}
          step={pole.krok ?? (definicja.typ === 'kwota' ? 0.01 : undefined)}
          value={wartosc}
          onChange={(zdarzenie) => zmien(zdarzenie.target.value)}
        />
      )}
    </label>
  )
}
