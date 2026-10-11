import { z } from 'zod'
import type { EncjaBazowa, NazwaTabeli } from './typy'

export const KATEGORIE_OSI_ZDROWIA = { leczenie: 'Leczenie', leki: 'Leki', wizyty: 'Wizyty', badania: 'Badania', terapia: 'Terapia', samopoczucie: 'Samopoczucie', dokumenty: 'Dokumenty' } as const
export const KATEGORIE_WAZNYCH_INFORMACJI = {
  diagnoza: 'Ważna diagnoza wpisana przez użytkownika', hospitalizacja: 'Hospitalizacja', zabieg: 'Zabieg', alergia: 'Reakcja alergiczna',
  reakcja_na_lek: 'Poważna reakcja na lek', rozpoczecie_leczenia: 'Rozpoczęcie leczenia', zmiana_leczenia: 'Istotna zmiana leczenia',
  wydarzenie: 'Ważne wydarzenie zdrowotne', plan_wsparcia: 'Plan wsparcia', inne: 'Inne',
} as const
export const STATUSY_POTWIERDZENIA = { do_weryfikacji: 'Do weryfikacji', potwierdzone_przez_uzytkownika: 'Potwierdzone przez użytkownika' } as const
export const TABELE_HISTORII_ZDROWIA = ['leki', 'dziennikLekow', 'wizyty', 'terapie', 'wpisyTerapii', 'wpisySamopoczucia', 'wynikiBadan', 'dokumenty', 'skierowania', 'recepty', 'kontakty', 'wazneInformacjeZdrowotne'] as const satisfies readonly NazwaTabeli[]
export type TabelaHistoriiZdrowia = typeof TABELE_HISTORII_ZDROWIA[number]
export const schematZrodlaZdrowia = z.object({ tabela: z.enum(TABELE_HISTORII_ZDROWIA), id: z.string().min(1), szczegolId: z.string().min(1).optional() }).strict()
export type ZrodloZdrowia = z.infer<typeof schematZrodlaZdrowia>

export const schematDatyZdrowia = z.discriminatedUnion('dokladnosc', [
  z.object({ dokladnosc: z.literal('dzien'), od: z.iso.date() }).strict(),
  z.object({ dokladnosc: z.literal('miesiac'), od: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict(),
  z.object({ dokladnosc: z.literal('rok'), od: z.string().regex(/^\d{4}$/) }).strict(),
  z.object({ dokladnosc: z.literal('okres'), od: z.iso.date(), do: z.iso.date() }).strict().refine((data) => data.do >= data.od, 'Koniec okresu nie może poprzedzać początku.'),
  z.object({ dokladnosc: z.literal('nieznana'), opis: z.string().max(200).optional() }).strict(),
])
export type DataZdrowia = z.infer<typeof schematDatyZdrowia>
export const schematWaznejInformacjiZdrowotnej = z.object({
  id: z.string().min(1), createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }), usunietoAt: z.iso.datetime({ offset: true }).optional(),
  kategoria: z.enum(['diagnoza', 'hospitalizacja', 'zabieg', 'alergia', 'reakcja_na_lek', 'rozpoczecie_leczenia', 'zmiana_leczenia', 'wydarzenie', 'plan_wsparcia', 'inne']),
  tresc: z.string().trim().min(1).max(5000), data: schematDatyZdrowia, zrodlo: schematZrodlaZdrowia.optional(),
  statusPotwierdzenia: z.enum(['do_weryfikacji', 'potwierdzone_przez_uzytkownika']), ostatniPrzeglad: z.iso.date().optional(),
  obowiazujeOd: z.iso.date().optional(), obowiazujeDo: z.iso.date().optional(), ukryjTresc: z.boolean(),
  kontaktyIds: z.array(z.string().min(1)).refine((ids) => new Set(ids).size === ids.length).optional(),
}).strict().refine((informacja) => !informacja.obowiazujeOd || !informacja.obowiazujeDo || informacja.obowiazujeDo >= informacja.obowiazujeOd, 'Sprawdź okres obowiązywania.')
export type WaznaInformacjaZdrowotna = z.infer<typeof schematWaznejInformacjiZdrowotnej> & EncjaBazowa

export interface ZdarzenieZdrowia {
  id: string
  rodzaj: string
  kategoria: keyof typeof KATEGORIE_OSI_ZDROWIA
  data: DataZdrowia
  godzina?: string
  chwila?: string
  opis: string
  zrodlo: ZrodloZdrowia
  dostepnosc: 'dostepne' | 'ograniczone' | 'niedostepne'
  prywatneSzczegoly?: boolean
}

export function opisDatyZdrowia(data: DataZdrowia): string {
  if (data.dokladnosc === 'nieznana') return data.opis ? `Data nieznana: ${data.opis}` : 'Data nieznana'
  if (data.dokladnosc === 'okres') return `${data.od} — ${data.do} (okres)`
  return data.od + (data.dokladnosc === 'rok' ? ' (rok przybliżony)' : data.dokladnosc === 'miesiac' ? ' (miesiąc przybliżony)' : '')
}

export function opisChwiliZdrowia(chwila: string, strefa?: string): string {
  if (!Number.isFinite(Date.parse(chwila))) return 'Data nieznana'
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short', timeZone: strefa }).format(new Date(chwila))
}
