import { z } from 'zod'
import type { EncjaBazowa } from './typy'

const kwota = z.number().int().safe()
const identyfikator = z.string().min(1)
const pozycja = z.object({ uczestnikId: identyfikator, kwotaGrosze: kwota.nonnegative() })
const podzial = z.discriminatedUnion('metoda', [
  z.object({ metoda: z.literal('po_rowno'), uczestnicyIds: z.array(identyfikator) }),
  z.object({ metoda: z.literal('kwotowo'), pozycje: z.array(pozycja) }),
  z.object({ metoda: z.literal('procentowo'), pozycje: z.array(z.object({ uczestnikId: identyfikator, procentSetne: kwota.nonnegative() })) }),
  z.object({ metoda: z.literal('udzialy'), pozycje: z.array(z.object({ uczestnikId: identyfikator, udzialy: kwota.nonnegative() })) }),
])
const encja = z.object({ id: identyfikator, createdAt: z.string().min(1), updatedAt: z.string().min(1), usunietoAt: z.string().min(1).optional() }).passthrough()
const data = z.iso.date()
const waluta = z.string().min(1)
export const schematWspolnejKasy = encja.extend({ nazwa: z.string(), opis: z.string(), ikona: z.string(), kolor: z.string(), waluta, saldoPoczatkoweGrosze: kwota, status: z.enum(['aktywna', 'zarchiwizowana']) })
export const schematOperacjiKasy = encja.extend({ kasaId: identyfikator, typ: z.enum(['wplyw', 'wydatek', 'korekta']), kwotaGrosze: kwota, waluta, dataOperacji: data, kategoria: z.string(), zrodlo: z.string(), opis: z.string(), kaucja: z.object({ pozycje: z.array(z.object({ nazwa: z.string(), liczbaSztuk: kwota.nonnegative(), stawkaGrosze: kwota.positive() })), sumaGrosze: kwota.nonnegative(), zatwierdzonaKwotaGrosze: kwota.nonnegative().optional(), uzasadnienie: z.string().optional() }).optional() })
export const schematRozliczenia = encja.extend({ nazwa: z.string(), opis: z.string(), waluta, uczestnicy: z.array(z.object({ id: identyfikator, nazwa: z.string(), nieaktywny: z.boolean().optional() })), domyslnyPodzial: z.enum(['po_rowno', 'kwotowo', 'procentowo', 'udzialy']), etap: z.enum(['aktywne', 'oczekuje']), dataRozpoczecia: data, dataZakonczenia: data.optional(), zarchiwizowanoAt: z.string().optional() })
export const schematWydatkuGrupowego = encja.extend({ rozliczenieId: identyfikator, nazwa: z.string(), kwotaGrosze: kwota.positive(), waluta, dataOperacji: data, finansujacy: z.array(pozycja), metodaPodzialu: z.enum(['po_rowno', 'kwotowo', 'procentowo', 'udzialy']), parametryPodzialu: podzial, podzialKosztu: z.array(pozycja), opis: z.string() })
export const schematZwrotuRozliczenia = encja.extend({ rozliczenieId: identyfikator, odUczestnikaId: identyfikator, doUczestnikaId: identyfikator, kwotaGrosze: kwota.positive(), waluta, dataOperacji: data, opis: z.string() })
export type WspolnaKasa = z.infer<typeof schematWspolnejKasy> & EncjaBazowa
export type OperacjaKasy = z.infer<typeof schematOperacjiKasy> & EncjaBazowa
export type Rozliczenie = z.infer<typeof schematRozliczenia> & EncjaBazowa
export type WydatekGrupowy = z.infer<typeof schematWydatkuGrupowego> & EncjaBazowa
export type ZwrotRozliczenia = z.infer<typeof schematZwrotuRozliczenia> & EncjaBazowa
