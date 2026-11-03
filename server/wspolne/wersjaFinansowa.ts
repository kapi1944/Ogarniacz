import { z } from 'zod'
const kwota = z.number().int().safe()
export const schematWersjiFinansowej = z.object({
  rewizja: kwota.positive(), idZapisu: z.string().uuid(), oczekiwanaRewizja: kwota.nonnegative(),
  operacja: z.enum(['utworzenie', 'aktualizacja', 'usuniecie', 'przywrocenie', 'rozstrzygniecie']),
  znacznikCzasu: z.string().min(1), podpisPolecenia: z.string(),
  wariantyKonfliktu: z.object({ wybrano: z.enum(['lokalny', 'zdalny']), lokalny: z.record(z.string(), z.json()), zdalny: z.record(z.string(), z.json()) }).strict().optional(),
  idOperacjiZrodlowej: z.string().uuid().optional(), skladOperacji: z.array(z.object({ tabela: z.string().min(1), id: z.string().uuid() }).strict()).optional(),
  przed: z.record(z.string(), z.json()).optional(), po: z.record(z.string(), z.json()),
}).strict()
