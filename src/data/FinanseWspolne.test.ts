import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { BazaOgarniacza } from './BazaOgarniacza'
import { czyTabelaSynchronizowana } from './KolejkaSynchronizacji'
import { schematOperacjiKasy, schematWydatkuGrupowego } from '../domain/modeleFinansowWspolnych'

const tabele = ['wspolneKasy', 'operacjeKas', 'rozliczenia', 'wydatkiGrupowe', 'zwrotyRozliczen'] as const

describe('trwałe wspólne finanse', () => {
  it('tworzy tabele i zachowuje dane przy aktualizacji schematu 19', async () => {
    const wzor = new BazaOgarniacza('wzor-f72a')
    await wzor.open()
    const schemat = Object.fromEntries(wzor.tables.filter((tabela) => !tabele.some((nazwa) => nazwa === tabela.name)).map((tabela) => [tabela.name, [tabela.schema.primKey.src, ...tabela.schema.indexes.map((indeks) => indeks.src)].join(', ')]))
    for (const nazwa of tabele) {
      expect(wzor.table(nazwa).schema.primKey.name).toBe('id')
      expect(czyTabelaSynchronizowana(nazwa)).toBe(false)
    }
    const stara = new Dexie('migracja-f72a')
    stara.version(19).stores(schemat)
    await stara.open()
    const wydatek = { id: 'stary', kwota: 12.5, data: '2026-10-28', kategoria: 'test', opis: '', createdAt: '2026-10-28', updatedAt: '2026-10-28' }
    await stara.table('wydatki').put(wydatek)
    await stara.table('historiaZmian').put({ id: 'historia', encjaId: 'stary' })
    stara.close()
    const nowa = new BazaOgarniacza('migracja-f72a')
    await nowa.open()
    expect(await nowa.tabela('wydatki').get('stary')).toEqual(wydatek)
    expect(await nowa.tabela('historiaZmian').get('historia')).toMatchObject({ encjaId: 'stary' })
    for (const nazwa of tabele) expect(await nowa.tabela(nazwa).count()).toBe(0)
    await nowa.delete()
    await wzor.delete()
  })

  it('odrzuca niebezpieczne kwoty w modelach kopii', () => {
    const metadane = { id: 'test', createdAt: '2026-10-28', updatedAt: '2026-10-28' }
    expect(schematOperacjiKasy.safeParse({ ...metadane, kasaId: 'k', typ: 'wplyw', kwotaGrosze: Number.MAX_SAFE_INTEGER + 1, waluta: 'PLN', dataOperacji: '2026-10-28', kategoria: '', zrodlo: '', opis: '' }).success).toBe(false)
    expect(schematWydatkuGrupowego.safeParse({ ...metadane, rozliczenieId: 'r', nazwa: '', kwotaGrosze: 1.5, waluta: 'PLN', dataOperacji: '2026-10-28', finansujacy: [], metodaPodzialu: 'po_rowno', parametryPodzialu: { metoda: 'po_rowno', uczestnicyIds: [] }, podzialKosztu: [], opis: '' }).success).toBe(false)
  })
})
