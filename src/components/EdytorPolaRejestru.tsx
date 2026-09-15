import type { DefinicjaPolaRejestru, TypPolaRejestru, WartoscPolaWlasnego } from '../domain/rejestr'
import type { EncjaBazowa } from '../domain/typy'

export interface DefinicjaPola {
  klucz: string
  etykieta: string
  typ?: 'text' | 'textarea' | 'date' | 'time' | 'number' | 'email' | 'url' | 'select' | 'multiselect'
  wymagane?: boolean
  podpowiedz?: string
  min?: number
  krok?: number
  opcje?: { wartosc: string; etykieta: string }[]
  widoczne?: (formularz: Record<string, string>) => boolean
  domyslnaWartosc?: string
}

export interface PoleDoEdycjiRejestru {
  definicja: DefinicjaPolaRejestru
  wymagane?: boolean
  podpowiedz?: string
  min?: number
  krok?: number
  typHtml?: 'email'
  widoczne?: (formularz: Record<string, string>) => boolean
  domyslnaWartosc?: string
}

const typyStarychPol: Record<NonNullable<DefinicjaPola['typ']>, TypPolaRejestru> = {
  text: 'tekst',
  textarea: 'dlugi_tekst',
  date: 'data',
  time: 'czas',
  number: 'liczba',
  email: 'tekst',
  url: 'url',
  select: 'select',
  multiselect: 'multiselect',
}

export function normalizujStarePolaRejestru(pola: DefinicjaPola[]): PoleDoEdycjiRejestru[] {
  return pola.map((pole) => ({
    definicja: {
      id: `system:${pole.klucz}`,
      zrodlo: 'systemowe',
      kluczWlasciwosci: pole.klucz,
      etykieta: pole.etykieta,
      typ: typyStarychPol[pole.typ ?? 'text'],
      opcje: pole.opcje,
    },
    wymagane: pole.wymagane,
    podpowiedz: pole.podpowiedz,
    min: pole.min,
    krok: pole.krok,
    typHtml: pole.typ === 'email' ? 'email' : undefined,
    widoczne: pole.widoczne,
    domyslnaWartosc: pole.domyslnaWartosc,
  }))
}

export function normalizujPolaRejestru(pola: DefinicjaPolaRejestru[]): PoleDoEdycjiRejestru[] {
  return pola.map((definicja) => ({ definicja }))
}

export function wartoscFormularzaPola(encja: EncjaBazowa | undefined, pole: PoleDoEdycjiRejestru): string {
  const { definicja } = pole
  const wartosc = definicja.zrodlo === 'wlasne'
    ? encja?.polaWlasne?.[definicja.id]
    : definicja.kluczWlasciwosci ? (encja as unknown as Record<string, unknown> | undefined)?.[definicja.kluczWlasciwosci] : undefined
  if (Array.isArray(wartosc)) return wartosc.join(',')
  if (typeof wartosc === 'boolean') return String(wartosc)
  return wartosc === undefined || wartosc === null ? pole.domyslnaWartosc ?? '' : String(wartosc)
}

export function skonwertujWartoscPolaWlasnego(pole: DefinicjaPolaRejestru, wartosc: string): WartoscPolaWlasnego {
  if (pole.typ === 'checkbox') return wartosc === 'true'
  if (pole.typ === 'multiselect') return wartosc ? wartosc.split(',').filter(Boolean) : []
  if (pole.typ === 'liczba' || pole.typ === 'kwota') {
    if (!wartosc) return null
    const liczba = Number(wartosc)
    if (!Number.isFinite(liczba)) throw new Error(`Pole „${pole.etykieta}” wymaga liczby.`)
    return liczba
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
}

export function EdytorPolaRejestru({ pole, wartosc, zmien }: Wlasciwosci) {
  const { definicja } = pole
  const wspolne = { required: pole.wymagane, placeholder: pole.podpowiedz }

  return (
    <label className={definicja.typ === 'dlugi_tekst' ? 'pole pole--pelne' : 'pole'}>
      <span>{definicja.etykieta}{pole.wymagane && ' *'}</span>
      {definicja.typ === 'dlugi_tekst' ? (
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
