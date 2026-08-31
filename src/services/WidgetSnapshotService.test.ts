import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { utworzMetadane } from '../domain/fabryki'
import { utworzZadanie } from './ZadaniaService'
import { WidgetSnapshotService } from './WidgetSnapshotService'

describe.sequential('WidgetSnapshotService', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  it('zapisuje wyłącznie małą projekcję dnia, bez całej bazy', async () => {
    await baza.tabela('zadania').put({
      ...utworzZadanie({ tytul: 'Pilne zadanie', opis: 'Opis nie może trafić do widgetu', priorytet: 'krytyczny' }),
      id: 'pilne',
      dataElementu: '2026-08-31',
      godzinaElementu: '14:00',
      updatedAt: '2026-08-31T08:00:00.000Z',
    })
    await baza.tabela('dokumenty').put({
      ...utworzMetadane('tajny-dokument'),
      nazwa: 'Tajny dokument spoza snapshotu',
      powiazania: [],
    })
    const zapis = vi.fn(async () => true)
    const usluga = new WidgetSnapshotService(zapis, () => new Date('2026-08-31T10:00:00.000Z'))

    const snapshot = await usluga.aktualizuj()

    expect(Object.keys(snapshot).sort()).toEqual([
      'data',
      'najblizszeElementyDnia',
      'najblizszePrzypomnienie',
      'pilneIZalegleZadania',
      'updatedAt',
    ].sort())
    expect(snapshot.najblizszeElementyDnia[0]).toMatchObject({ id: 'pilne', typ: 'zadanie', tytul: 'Pilne zadanie' })
    expect(snapshot.pilneIZalegleZadania[0]).toMatchObject({ id: 'pilne', priorytet: 'krytyczny' })
    expect(JSON.stringify(snapshot)).not.toContain('Opis nie może trafić do widgetu')
    expect(JSON.stringify(snapshot)).not.toContain('Tajny dokument')
    expect(zapis).toHaveBeenCalledWith(snapshot)
  })
})
