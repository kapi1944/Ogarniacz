/**
 * ${PATCH_ID}
 * Wspólny silnik lokalnego wyliczania przypomnień dla zadań, leków, wizyt,
 * finansów i samochodu. Nie wysyła natywnych powiadomień systemowych.
 */

export type ModulZrodlaPrzypomnienia =
  | 'zadanie'
  | 'lek'
  | 'wizyta'
  | 'finanse'
  | 'samochod'
  | 'inne'

export interface SourceRefPrzypomnienia {
  module: ModulZrodlaPrzypomnienia | string
  entityId: string
}

export interface RegulaPrzypomnieniaV1 {
  id?: string
  at?: string
  minutesBefore?: number
  enabled?: boolean
}

export interface KandydatPrzypomnieniaV1 {
  id: string
  title: string
  sourceRef?: SourceRefPrzypomnienia
  date?: string
  time?: string
  deadline?: string
  reminders?: readonly RegulaPrzypomnieniaV1[]
}

export interface ZaplanowanePrzypomnienieV1 {
  id: string
  title: string
  sourceRef: SourceRefPrzypomnienia
  at: string
  sourceItemId: string
}

function terminBazowy(item: KandydatPrzypomnieniaV1): Date | null {
  if (item.deadline) {
    const parsed = new Date(item.deadline)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  if (!item.date || !item.time) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return null
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.time)) return null
  const parsed = new Date(`${item.date}T${item.time}:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function sourceRefDla(item: KandydatPrzypomnieniaV1): SourceRefPrzypomnienia {
  return item.sourceRef ?? { module: 'zadanie', entityId: item.id }
}

export function wyznaczPrzypomnieniaV1(
  item: KandydatPrzypomnieniaV1,
): ZaplanowanePrzypomnienieV1[] {
  const wynik: ZaplanowanePrzypomnienieV1[] = []
  const bazowy = terminBazowy(item)
  const rules = item.reminders ?? []

  rules.forEach((rule, index) => {
    if (rule.enabled === false) return
    let at: Date | null = null

    if (rule.at) {
      const parsed = new Date(rule.at)
      if (!Number.isNaN(parsed.getTime())) at = parsed
    } else if (bazowy && Number.isFinite(rule.minutesBefore)) {
      const minutes = Math.max(0, Number(rule.minutesBefore))
      at = new Date(bazowy.getTime() - minutes * 60_000)
    }

    if (!at) return
    wynik.push({
      id: rule.id || `${item.id}:reminder:${index}`,
      title: item.title,
      sourceRef: sourceRefDla(item),
      at: at.toISOString(),
      sourceItemId: item.id,
    })
  })

  return wynik.sort((a, b) => a.at.localeCompare(b.at))
}

export function przypomnieniaWOknieV1(
  items: readonly KandydatPrzypomnieniaV1[],
  teraz: Date = new Date(),
  horyzontMinuty = 24 * 60,
): ZaplanowanePrzypomnienieV1[] {
  const od = teraz.getTime()
  const doCzasu = od + Math.max(0, horyzontMinuty) * 60_000

  return items
    .flatMap(wyznaczPrzypomnieniaV1)
    .filter(reminder => {
      const t = new Date(reminder.at).getTime()
      return t >= od && t <= doCzasu
    })
    .sort((a, b) => a.at.localeCompare(b.at))
}

export function odlozPrzypomnienieV1(
  reminder: ZaplanowanePrzypomnienieV1,
  minuty: number,
): ZaplanowanePrzypomnienieV1 {
  const bazowy = new Date(reminder.at)
  const przesuniecie = Math.max(0, Number.isFinite(minuty) ? minuty : 0)
  return {
    ...reminder,
    at: new Date(bazowy.getTime() + przesuniecie * 60_000).toISOString(),
  }
}
