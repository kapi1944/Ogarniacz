import { z } from 'zod'
import type { EncjaBazowa } from './typy'

export const sekcjeSamopoczucia = {
  samopoczucie: 'Samopoczucie i emocje', sen: 'Sen', objawy: 'Objawy i czas ich obserwacji',
  wydarzenia: 'Wydarzenia, wyzwalacze i kontekst', refleksje: 'Myśli i refleksje',
  strategie: 'Strategie radzenia sobie i zaobserwowany efekt', omowienie: 'Pytania i zagadnienia na terapię',
} as const
export type SekcjaSamopoczucia = keyof typeof sekcjeSamopoczucia

export const schematWskaznikaSamopoczucia = z.object({
  id: z.string().min(1), wersja: z.number().int().positive(), nazwa: z.string().trim().min(1).max(100),
  opis: z.string().max(1000), typ: z.enum(['liczba', 'tekst', 'tak_nie']),
  minimum: z.number().finite(), maksimum: z.number().finite(), krok: z.number().positive(),
  etykietaMinimum: z.string().max(100), etykietaMaksimum: z.string().max(100), jednostka: z.string().max(50),
  kierunek: z.enum(['wyzej_lepiej', 'nizej_lepiej', 'neutralny']),
  sekcja: z.enum(['samopoczucie', 'sen', 'objawy', 'wydarzenia', 'refleksje', 'strategie', 'omowienie']), aktywny: z.boolean(),
}).refine((definicja) => definicja.typ !== 'liczba' || definicja.maksimum > definicja.minimum && definicja.etykietaMinimum.trim() && definicja.etykietaMaksimum.trim(), 'Opisz końce skali i podaj zakres od mniejszej do większej wartości.')
export type WskaznikSamopoczucia = z.infer<typeof schematWskaznikaSamopoczucia>
export const schematUstawienSamopoczucia = z.object({
  definicje: z.array(schematWskaznikaSamopoczucia), ulubione: z.array(z.string()),
  sekcje: z.array(z.enum(['samopoczucie', 'sen', 'objawy', 'wydarzenia', 'refleksje', 'strategie', 'omowienie'])),
  tryb: z.enum(['szybki', 'rozszerzony']),
}).refine((ustawienia) => new Set(ustawienia.definicje.map((pole) => `${pole.id}:${pole.wersja}`)).size === ustawienia.definicje.length
  && new Set(ustawienia.ulubione).size === ustawienia.ulubione.length
  && ustawienia.ulubione.every((id) => ustawienia.definicje.some((pole) => pole.id === id)), 'Definicje lub ulubione wskaźniki są niepoprawne.')
export type UstawieniaSamopoczucia = z.infer<typeof schematUstawienSamopoczucia>

const definicjePoczatkowe: [string, string, string, string, WskaznikSamopoczucia['kierunek']][] = [
  ['nastroj', 'Nastrój', 'Bardzo niski', 'Bardzo dobry', 'wyzej_lepiej'],
  ['lek', 'Poziom lęku', 'Brak lęku', 'Bardzo silny lęk', 'nizej_lepiej'],
  ['stres', 'Poziom stresu', 'Brak stresu', 'Bardzo silny stres', 'nizej_lepiej'],
  ['energia', 'Energia', 'Brak energii', 'Bardzo dużo energii', 'wyzej_lepiej'],
  ['motywacja', 'Motywacja', 'Brak motywacji', 'Bardzo duża motywacja', 'wyzej_lepiej'],
  ['koncentracja', 'Koncentracja', 'Bardzo trudna', 'Bardzo dobra', 'wyzej_lepiej'],
  ['drazliwosc', 'Drażliwość', 'Brak drażliwości', 'Bardzo silna drażliwość', 'nizej_lepiej'],
  ['jakosc_snu', 'Jakość snu', 'Bardzo niska', 'Bardzo dobra', 'wyzej_lepiej'],
  ['dlugosc_snu', 'Długość snu', 'Brak snu', '24 godziny', 'neutralny'],
  ['ogolne', 'Ogólne samopoczucie', 'Bardzo złe', 'Bardzo dobre', 'wyzej_lepiej'],
]
export const domyslneUstawieniaSamopoczucia: UstawieniaSamopoczucia = {
  definicje: definicjePoczatkowe.map(([id, nazwa, etykietaMinimum, etykietaMaksimum, kierunek]) => ({
    id, wersja: 1, nazwa, opis: 'Subiektywna obserwacja użytkownika.', typ: 'liczba', minimum: 0,
    maksimum: id === 'dlugosc_snu' ? 24 : 10, krok: id === 'dlugosc_snu' ? 0.25 : 1,
    etykietaMinimum, etykietaMaksimum, jednostka: id === 'dlugosc_snu' ? 'godz.' : '', kierunek,
    sekcja: id.includes('snu') ? 'sen' : 'samopoczucie', aktywny: true,
  })), ulubione: ['nastroj', 'lek', 'energia'], sekcje: Object.keys(sekcjeSamopoczucia) as SekcjaSamopoczucia[], tryb: 'szybki',
}

export const schematObserwacjiWskaznika = z.object({ definicja: schematWskaznikaSamopoczucia, wartosc: z.union([z.number().finite(), z.string().trim().min(1).max(2000), z.boolean()]) })
  .refine(({ definicja, wartosc }) => definicja.typ === 'liczba' ? typeof wartosc === 'number' && wartosc >= definicja.minimum && wartosc <= definicja.maksimum
    : definicja.typ === 'tekst' ? typeof wartosc === 'string' : typeof wartosc === 'boolean', 'Wartość nie pasuje do skali.')
export type ObserwacjaWskaznika = z.infer<typeof schematObserwacjiWskaznika>
export interface WpisSamopoczucia extends EncjaBazowa {
  dataObserwacji: string
  godzinaObserwacji: string
  czasObserwacji: string
  strefaCzasowa: string
  notatka?: string
  wskazniki: ObserwacjaWskaznika[]
  szczegoly?: Partial<Record<SekcjaSamopoczucia, string>>
  doOmowienia: boolean
  powiazania?: { typ: 'lek' | 'wizyta' | 'wpisTerapii'; id: string }[]
}
export const schematWpisuSamopoczucia = z.object({
  id: z.string().min(1), createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }), usunietoAt: z.iso.datetime({ offset: true }).optional(),
  dataObserwacji: z.iso.date(), godzinaObserwacji: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  czasObserwacji: z.iso.datetime({ offset: true }), strefaCzasowa: z.string().refine((strefa) => { try { new Intl.DateTimeFormat('pl-PL', { timeZone: strefa }); return true } catch { return false } }, 'Nieprawidłowa strefa czasowa.'),
  notatka: z.string().max(20000).optional(), wskazniki: z.array(schematObserwacjiWskaznika),
  szczegoly: z.record(z.enum(['samopoczucie', 'sen', 'objawy', 'wydarzenia', 'refleksje', 'strategie', 'omowienie']), z.string().max(20000)).optional(),
  doOmowienia: z.boolean(), powiazania: z.array(z.object({ typ: z.enum(['lek', 'wizyta', 'wpisTerapii']), id: z.string().min(1) })).optional(),
}).refine((wpis) => wpis.wskazniki.length > 0 || Boolean(wpis.notatka?.trim()) || Object.values(wpis.szczegoly ?? {}).some((tekst) => tekst?.trim()), 'Dodaj obserwację lub krótką notatkę.')
  .refine((wpis) => new Set(wpis.wskazniki.map((pole) => pole.definicja.id)).size === wpis.wskazniki.length, 'Wskaźnik występuje więcej niż raz.')
  .refine((wpis) => {
    try {
      const czesci = new Intl.DateTimeFormat('sv-SE', { timeZone: wpis.strefaCzasowa, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(wpis.czasObserwacji))
      return czesci === `${wpis.dataObserwacji} ${wpis.godzinaObserwacji}`
    } catch { return false }
  }, 'Data, godzina i strefa obserwacji nie są zgodne z jej pełnym czasem.')

export function biezaceWskazniki(ustawienia: UstawieniaSamopoczucia): WskaznikSamopoczucia[] {
  const najnowsze = new Map<string, WskaznikSamopoczucia>()
  for (const pole of ustawienia.definicje) if (!najnowsze.has(pole.id) || najnowsze.get(pole.id)!.wersja < pole.wersja) najnowsze.set(pole.id, pole)
  return [...najnowsze.values()]
}
