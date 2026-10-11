import { terazIso } from '../domain/fabryki'
import { normalizujUstawienia } from '../domain/ustawienia'
import type { Ustawienia } from '../domain/typy'
import { baza } from './BazaOgarniacza'
import { dodajDoKolejkiSynchronizacji, tabelaKolejki, rekordDoSynchronizacji } from './KolejkaSynchronizacji'

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
      if (zapisane.samopoczucie && poprzednie?.samopoczucie) {
        for (const stara of poprzednie.samopoczucie.definicje) {
          const nowa = zapisane.samopoczucie.definicje.find((pole) => pole.id === stara.id && pole.wersja === stara.wersja)
          if (JSON.stringify(nowa) !== JSON.stringify(stara)) throw new Error('Zachowaj wcześniejsze wersje wskaźników. Odśwież ustawienia przed zapisem.')
        }
      }
      zapisane.samopoczucie ??= poprzednie?.samopoczucie
      const porownywalne = (rekord: Ustawienia) => ({ ...rekordDoSynchronizacji('ustawienia', rekord), updatedAt: '' })
      const zmienionoWspolne = !poprzednie || JSON.stringify(porownywalne(zapisane)) !== JSON.stringify(porownywalne(poprzednie))
      if (!zmienionoWspolne && poprzednie) zapisane.updatedAt = poprzednie.updatedAt
      await tabela.put(zapisane)
      if (zmienionoWspolne) await dodajDoKolejkiSynchronizacji('ustawienia', zapisane, poprzednie)
    })
    return zapisane
  }
}

export const repozytoriumUstawien: RepozytoriumUstawien = new RepozytoriumUstawienDexie()
