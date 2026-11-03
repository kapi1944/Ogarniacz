import { baza } from '../data/BazaOgarniacza'
import { TABELE_OBRAZU_FZ, czyRekordFz, walidujObrazFz, type ObrazFz } from '../../server/wspolne/WalidacjaPulZobowiazan.ts'
import { schematOchronyDokumentuFinansowego, schematUstawienFz } from '../../server/wspolne/modelePulZobowiazan.ts'
import type { NazwaTabeli } from '../domain/typy'

export const TABELE_BACKUPU_FZ: NazwaTabeli[] = [...TABELE_OBRAZU_FZ, 'dokumenty', 'ustawienia', 'historiaZmian']
export { schematUstawienFz }
type Rekord = Record<string, unknown>
export function czyZakresFz(tabela: string, rekord: Rekord, pule: ReadonlySet<string>, dokumenty: ReadonlySet<string> = new Set()): boolean {
  return czyRekordFz(tabela, rekord) || tabela === 'operacjeKas' && pule.has(String(rekord.kasaId)) || tabela === 'historiaZmian' && (['zakupyPul', 'sprzedazePul', 'osobyFinansowe', 'zobowiazania', 'operacjeZobowiazan'].includes(String(rekord.typEncji)) || dokumenty.has(`${rekord.typEncji}:${rekord.encjaId}`) || rekord.typEncji === 'wspolneKasy' && pule.has(String(rekord.encjaId)))
}
export async function pobierzSekcjeFz(): Promise<Record<string, Rekord[]>> {
  return baza.transaction('r', TABELE_BACKUPU_FZ.map((tabela) => baza.table(tabela)), async () => {
    const dane: Record<string, Rekord[]> = Object.fromEntries(await Promise.all(TABELE_BACKUPU_FZ.map(async (tabela) => [tabela, await baza.table(tabela).toArray() as Rekord[]])))
    const pule = new Set(dane.wspolneKasy.filter((rekord) => rekord.pula).map((rekord) => String(rekord.id)))
    const dokumenty = new Set(dane.dokumenty.filter((rekord) => rekord.finansowe).map((rekord) => String(rekord.id)))
    for (const tabela of TABELE_OBRAZU_FZ) for (const rekord of dane[tabela]) if (czyRekordFz(tabela, rekord) || tabela === 'operacjeKas' && pule.has(String(rekord.kasaId))) dokumenty.add(`${tabela}:${rekord.id}`)
    for (const rekord of dane.dokumenty) if (rekord.finansowe) dokumenty.add(`dokumenty:${rekord.id}`)
    for (const tabela of TABELE_BACKUPU_FZ) dane[tabela] = dane[tabela].filter((rekord) => czyZakresFz(tabela, rekord, pule, dokumenty))
    dane.ustawienia = dane.ustawienia.map(({ id, createdAt, updatedAt, finanseFz }) => ({ id, createdAt, updatedAt, finanseFz }))
    walidujKopieFz(dane)
    return dane
  })
}
export function walidujKopieFz(dane: Record<string, Rekord[]>): void {
  walidujObrazFz(dane as unknown as ObrazFz)
  const dokumenty = dane.dokumenty ?? []
  for (const dokument of dokumenty) {
    schematOchronyDokumentuFinansowego.parse(dokument.finansowe)
    const plik = dokument.plik as { __ogarniaczBlob?: boolean; base64?: string } | undefined
    if (!(plik instanceof Blob) && !(plik?.__ogarniaczBlob === true && typeof plik.base64 === 'string' && plik.base64.length > 0)) throw new Error('Pełny backup FZ wymaga bajtów wszystkich dokumentów.')
  }
  for (const zakup of (dane as unknown as ObrazFz).zakupyPul) for (const id of [...zakup.dokumentyIds, ...zakup.partie.flatMap((partia) => partia.dokumentyIds ?? [])]) if (!dokumenty.some((dokument) => dokument.id === id)) throw new Error('Brak dokumentu lub jego ochrony w kopii FZ.')
  for (const ustawienia of dane.ustawienia ?? []) schematUstawienFz.parse(ustawienia.finanseFz)
}

export function sprawdzWyborDokumentowFz(payload: Record<string, unknown>, wybraneSekcje: readonly string[], dokumentyFinansowe: ReadonlySet<string>): void {
  if (wybraneSekcje.includes('puleZobowiazania')) return
  for (const nazwa of ['wizyty', 'badania', 'zdrowie']) {
    if (!wybraneSekcje.includes(nazwa)) continue
    const sekcja = payload[nazwa] as Record<string, Rekord[]> | undefined
    for (const rekordy of Object.values(sekcja ?? {})) for (const rekord of rekordy) {
      const terapia = rekord.psychoterapia as { dokumentyIds?: string[] } | undefined
      const ids = [rekord.dokumentId, ...(Array.isArray(rekord.dokumentyIds) ? rekord.dokumentyIds : []), ...terapia?.dokumentyIds ?? []]
      if (ids.some((id) => typeof id === 'string' && dokumentyFinansowe.has(id))) throw new Error('Wybrana sekcja wymaga dołączenia sekcji Pule i Zobowiązania z dokumentem finansowym.')
    }
  }
}
