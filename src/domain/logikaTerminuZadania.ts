import type { TrybTerminuElementu } from './elementyOgarniacza'

export function poprawnaGodzinaDeadline(wartosc: unknown): wartosc is string {
  return typeof wartosc === 'string'
    && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(wartosc)
}

export const poprawnaGodzinaTerminu = poprawnaGodzinaDeadline

function poprawnyTrybTerminuElementu(wartosc: unknown): wartosc is TrybTerminuElementu {
  return wartosc === 'o_godzinie' || wartosc === 'koniec_dnia' || wartosc === 'bez_godziny'
}

function trybHistoryczny(deadlineMode: unknown): TrybTerminuElementu | undefined {
  if (deadlineMode === 'AT_TIME') return 'o_godzinie'
  if (deadlineMode === 'END_OF_DAY') return 'koniec_dnia'
  if (deadlineMode === 'NO_TIME') return 'bez_godziny'
  return undefined
}

export function normalizujTerminZadania(tryb: unknown, godzina: unknown): { tryb: TrybTerminuElementu; godzina?: string } {
  const poprawnyTryb = poprawnyTrybTerminuElementu(tryb) ? tryb : 'bez_godziny'
  return poprawnyTryb === 'o_godzinie' && poprawnaGodzinaDeadline(godzina)
    ? { tryb: poprawnyTryb, godzina }
    : { tryb: poprawnyTryb }
}

export function odczytajTerminZadania(rekord: Record<string, unknown>): { data?: string; tryb: TrybTerminuElementu; godzina?: string } {
  const terminHistoryczny = typeof rekord.termin === 'string' ? rekord.termin : undefined
  const dopasowanieHistorycznegoTerminu = terminHistoryczny?.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/)
  const data = typeof rekord.dataElementu === 'string' ? rekord.dataElementu : dopasowanieHistorycznegoTerminu?.[1]
  const godzinaZHistorycznegoTerminu = dopasowanieHistorycznegoTerminu?.[2]
  const trybKanoniczny = poprawnyTrybTerminuElementu(rekord.trybTerminuElementu) ? rekord.trybTerminuElementu : undefined
  const godzinaHistoryczna = rekord.godzinaElementu ?? rekord.time ?? godzinaZHistorycznegoTerminu
  const tryb = trybKanoniczny ?? trybHistoryczny(rekord.deadlineMode) ?? (poprawnaGodzinaDeadline(godzinaHistoryczna) ? 'o_godzinie' : data ? 'koniec_dnia' : 'bez_godziny')
  const godzina = trybKanoniczny ? rekord.godzinaElementu : godzinaHistoryczna
  return { ...(data ? { data } : {}), ...normalizujTerminZadania(tryb, godzina) }
}

export function normalizujDeadlineMode(deadlineMode: unknown, data: unknown, godzina: unknown): 'AT_TIME' | 'END_OF_DAY' | 'NO_TIME' {
  if (deadlineMode === 'AT_TIME' && poprawnaGodzinaDeadline(godzina)) return 'AT_TIME'
  if (deadlineMode === 'END_OF_DAY') return 'END_OF_DAY'
  if (deadlineMode === 'NO_TIME') return 'NO_TIME'
  if (poprawnaGodzinaDeadline(godzina)) return 'AT_TIME'
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) return 'END_OF_DAY'
  return 'NO_TIME'
}

export function godzinaZadaniaNaOsi(input: {
  trybTerminuElementu?: unknown
  godzinaElementu?: unknown
  deadlineMode?: unknown
  date?: unknown
  time?: unknown
}): string | undefined {
  return odczytajTerminZadania({
    dataElementu: input.date,
    trybTerminuElementu: input.trybTerminuElementu,
    godzinaElementu: input.godzinaElementu,
    deadlineMode: input.deadlineMode,
    time: input.time,
  }).godzina
}
