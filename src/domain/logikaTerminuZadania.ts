/**
 * OGARNIACZ_TASK_DEADLINE_TIME_2026_08_27_V3
 * Wspólna normalizacja trzech trybów terminu zadania.
 */
export function poprawnaGodzinaDeadline(wartosc: unknown): wartosc is string {
  return typeof wartosc === 'string'
    && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(wartosc)
}

export function normalizujDeadlineMode(
  deadlineMode: unknown,
  data: unknown,
  godzina: unknown,
): 'AT_TIME' | 'END_OF_DAY' | 'NO_TIME' {
  if (deadlineMode === 'AT_TIME' && poprawnaGodzinaDeadline(godzina)) return 'AT_TIME'
  if (deadlineMode === 'END_OF_DAY') return 'END_OF_DAY'
  if (deadlineMode === 'NO_TIME') return 'NO_TIME'

  // Zgodność ze starszymi rekordami.
  if (poprawnaGodzinaDeadline(godzina)) return 'AT_TIME'
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) return 'END_OF_DAY'
  return 'NO_TIME'
}

export function godzinaZadaniaNaOsi(input: {
  deadlineMode?: unknown
  date?: unknown
  time?: unknown
}): string | undefined {
  return normalizujDeadlineMode(input.deadlineMode, input.date, input.time) === 'AT_TIME'
    && poprawnaGodzinaDeadline(input.time)
      ? input.time
      : undefined
}
