import { z } from 'zod'
import type { EncjaBazowa } from './typy'

export const KATEGORIE_MEDYCZNE = {
  wynik: 'Wynik badania', wypis: 'Wypis ze szpitala', zaswiadczenie: 'Zaświadczenie',
  skierowanie: 'Skierowanie', recepta: 'Recepta', zalecenia: 'Zalecenia', specjalistyczna: 'Dokumentacja specjalistyczna', inne: 'Inne',
} as const

export const schematMetadanychMedycznych = z.object({
  kategoria: z.enum(Object.keys(KATEGORIE_MEDYCZNE) as [keyof typeof KATEGORIE_MEDYCZNE, ...Array<keyof typeof KATEGORIE_MEDYCZNE>]),
  dataDokumentu: z.iso.date().optional(), dataOtrzymania: z.iso.date().optional(),
  placowka: z.string().optional(), specjalista: z.string().optional(), opis: z.string().optional(), tagi: z.array(z.string()).optional(),
  miejsceId: z.string().min(1).optional(), kontaktId: z.string().min(1).optional(),
  skierowanieId: z.string().min(1).optional(), terapiaId: z.string().min(1).optional(), receptaId: z.string().min(1).optional(),
}).strict()
export type MetadaneMedyczne = z.infer<typeof schematMetadanychMedycznych>

/** Oryginalny zapis pozostaje źródłem; rozpoznajemy jedynie jawny zapis liczby. */
export function odczytajWartoscBadania(oryginalnyWynik: string) {
  const dopasowanie = oryginalnyWynik.trim().match(/^([<>])?\s*([+-]?\d+(?:[.,]\d+)?)$/)
  if (!dopasowanie) return { kwalifikator: 'tekst' as const, wartoscTekstowa: oryginalnyWynik.trim() }
  const wartoscLiczbowa = Number(dopasowanie[2].replace(',', '.'))
  if (!Number.isFinite(wartoscLiczbowa)) throw new Error('Wartość liczbowa jest zbyt duża.')
  return { kwalifikator: dopasowanie[1] === '<' ? 'mniejsze' as const : dopasowanie[1] === '>' ? 'wieksze' as const : 'rowne' as const, wartoscLiczbowa }
}

export const schematWynikuBadania = z.object({
  id: z.string().min(1), createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }), usunietoAt: z.iso.datetime({ offset: true }).optional(),
  parametr: z.string().trim().min(1), dataPobrania: z.iso.date(), dataOtrzymania: z.iso.date().optional(),
  oryginalnyWynik: z.string().refine((tekst) => Boolean(tekst.trim())),
  wartoscLiczbowa: z.number().finite().optional(), wartoscTekstowa: z.string().optional(),
  kwalifikator: z.enum(['rowne', 'mniejsze', 'wieksze', 'tekst']), jednostka: z.string().optional(), metoda: z.string().optional(),
  zakresReferencyjny: z.string().optional(), dokumentId: z.string().min(1), wizytaId: z.string().min(1).optional(),
  grupaId: z.string().min(1).optional(), nazwaGrupy: z.string().trim().min(1).optional(), notatka: z.string().optional(),
}).passthrough().refine((wynik) => {
  let odczyt: ReturnType<typeof odczytajWartoscBadania>
  try { odczyt = odczytajWartoscBadania(wynik.oryginalnyWynik) } catch { return false }
  return wynik.kwalifikator === odczyt.kwalifikator
    && wynik.wartoscLiczbowa === ('wartoscLiczbowa' in odczyt ? odczyt.wartoscLiczbowa : undefined)
    && wynik.wartoscTekstowa === ('wartoscTekstowa' in odczyt ? odczyt.wartoscTekstowa : undefined)
    && Boolean(wynik.grupaId) === Boolean(wynik.nazwaGrupy)
}, 'Wartości muszą odpowiadać oryginalnemu zapisowi, a grupa musi mieć ID i nazwę.')

export interface WynikBadania extends EncjaBazowa {
  parametr: string
  dataPobrania: string
  dataOtrzymania?: string
  oryginalnyWynik: string
  wartoscLiczbowa?: number
  wartoscTekstowa?: string
  kwalifikator: 'rowne' | 'mniejsze' | 'wieksze' | 'tekst'
  jednostka?: string
  metoda?: string
  zakresReferencyjny?: string
  dokumentId: string
  wizytaId?: string
  grupaId?: string
  nazwaGrupy?: string
  notatka?: string
}
