import { z } from 'zod'
import { baza, nazwyTabel } from '../data/BazaOgarniacza'
import { terazIso } from '../domain/fabryki'

const schematKopii = z.object({
  format: z.literal('ogarniacz-backup'),
  wersja: z.literal(1),
  wersjaBazy: z.number().int().positive(),
  wyeksportowanoAt: z.string(),
  dane: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
})

export type KopiaOgarniacza = z.infer<typeof schematKopii>

async function zakodujWartosc(wartosc: unknown): Promise<unknown> {
  if (wartosc instanceof Blob) {
    const bufor = await wartosc.arrayBuffer()
    const bajty = new Uint8Array(bufor)
    let binarne = ''
    for (const bajt of bajty) binarne += String.fromCharCode(bajt)
    return { __typ: 'Blob', mimeType: wartosc.type, base64: btoa(binarne) }
  }
  if (Array.isArray(wartosc)) return Promise.all(wartosc.map(zakodujWartosc))
  if (wartosc && typeof wartosc === 'object') {
    const wynik: Record<string, unknown> = {}
    for (const [klucz, element] of Object.entries(wartosc)) wynik[klucz] = await zakodujWartosc(element)
    return wynik
  }
  return wartosc
}

function odkodujWartosc(wartosc: unknown): unknown {
  if (Array.isArray(wartosc)) return wartosc.map(odkodujWartosc)
  if (wartosc && typeof wartosc === 'object') {
    const rekord = wartosc as Record<string, unknown>
    if (rekord.__typ === 'Blob' && typeof rekord.base64 === 'string') {
      const binarne = atob(rekord.base64)
      const bajty = Uint8Array.from(binarne, (znak) => znak.charCodeAt(0))
      return new Blob([bajty], { type: String(rekord.mimeType ?? '') })
    }
    return Object.fromEntries(Object.entries(rekord).map(([klucz, element]) => [klucz, odkodujWartosc(element)]))
  }
  return wartosc
}

export async function eksportujKopie(): Promise<KopiaOgarniacza> {
  const dane: Record<string, Record<string, unknown>[]> = {}
  for (const nazwa of nazwyTabel) {
    const rekordy = await baza.table(nazwa).toArray()
    dane[nazwa] = (await zakodujWartosc(rekordy)) as Record<string, unknown>[]
  }
  return {
    format: 'ogarniacz-backup',
    wersja: 1,
    wersjaBazy: 2,
    wyeksportowanoAt: terazIso(),
    dane,
  }
}

export function walidujKopie(wartosc: unknown): KopiaOgarniacza {
  return schematKopii.parse(wartosc)
}

export async function importujKopie(kopiaNieznana: unknown, tryb: 'scal' | 'nadpisz'): Promise<void> {
  const kopia = walidujKopie(kopiaNieznana)
  await baza.transaction('rw', nazwyTabel.map((nazwa) => baza.table(nazwa)), async () => {
    if (tryb === 'nadpisz') {
      for (const nazwa of nazwyTabel) await baza.table(nazwa).clear()
    }
    for (const nazwa of nazwyTabel) {
      const rekordy = kopia.dane[nazwa] ?? []
      if (rekordy.length > 0) await baza.table(nazwa).bulkPut(odkodujWartosc(rekordy) as object[])
    }
  })
}

export async function wyczyscDane(): Promise<void> {
  await baza.transaction('rw', nazwyTabel.map((nazwa) => baza.table(nazwa)), async () => {
    for (const nazwa of nazwyTabel) await baza.table(nazwa).clear()
  })
}
