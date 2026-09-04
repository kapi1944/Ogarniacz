import { terazIso } from '../domain/fabryki'
import { normalizujUstawienia } from '../domain/ustawienia'
import type { Ustawienia } from '../domain/typy'
import { baza } from './BazaOgarniacza'
import { dodajDoKolejkiSynchronizacji, tabelaKolejki } from './KolejkaSynchronizacji'

export interface RepozytoriumUstawien {
  wczytaj(): Promise<Ustawienia>
  zapisz(ustawienia: unknown): Promise<Ustawienia>
}

class RepozytoriumUstawienDexie implements RepozytoriumUstawien {
  async wczytaj(): Promise<Ustawienia> {
    return normalizujUstawienia(await baza.tabela('ustawienia').get('glowne'))
  }

  async zapisz(ustawienia: unknown): Promise<Ustawienia> {
    const znormalizowane = normalizujUstawienia(ustawienia)
    const zapisane = { ...znormalizowane, updatedAt: terazIso() }
    const tabela = baza.tabela('ustawienia')
    await baza.transaction('rw', [tabela, tabelaKolejki()], async () => {
      const poprzednie = await tabela.get(zapisane.id)
      await tabela.put(zapisane)
      await dodajDoKolejkiSynchronizacji('ustawienia', zapisane, poprzednie)
    })
    return zapisane
  }
}

export const repozytoriumUstawien: RepozytoriumUstawien = new RepozytoriumUstawienDexie()
