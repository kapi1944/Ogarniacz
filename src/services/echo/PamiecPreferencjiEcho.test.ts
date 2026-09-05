import { beforeEach, describe, expect, it } from 'vitest'
import { baza } from '../../data/BazaOgarniacza'
import { AgentEcho } from './AgentEcho'
import { LokalnyOgraniczonyProviderEcho } from './LokalnyOgraniczonyProviderEcho'
import {
  MagazynPreferencjiEcho,
  preferencjePlanowaniaZPamieci,
  rozpoznajTrwalaPreferencjeEcho,
} from './PamiecPreferencjiEcho'

describe('pamięć preferencji Echo', () => {
  beforeEach(async () => {
    await baza.tabela('pamiecEcho').clear()
  })

  it('zapisuje trwałą preferencję, gdy pamięć jest włączona', async () => {
    const agent = new AgentEcho({
      provider: new LokalnyOgraniczonyProviderEcho(),
      magazynPamieci: new MagazynPreferencjiEcho(),
      pamiecPreferencjiWlaczona: true,
    })
    const odpowiedz = await agent.obsluz('Wolę załatwiać sprawy po pracy.')
    expect(odpowiedz.tekst).toContain('Zapamiętam tę preferencję')
    expect(await baza.tabela('pamiecEcho').count()).toBe(1)
  })

  it('nie zapisuje nowej preferencji, gdy pamięć jest wyłączona', async () => {
    const agent = new AgentEcho({
      provider: new LokalnyOgraniczonyProviderEcho(),
      magazynPamieci: new MagazynPreferencjiEcho(),
      pamiecPreferencjiWlaczona: false,
    })
    await agent.obsluz('Nie planuj mi trudnych rzeczy rano.')
    expect(await baza.tabela('pamiecEcho').count()).toBe(0)
  })

  it.each([
    'OC kończy mi się 20 listopada.',
    'Dentysta w czwartek o 16.',
    'Mam 500 zł budżetu na jedzenie.',
    'Biorę lek X o 8.',
  ])('nie klasyfikuje faktu domenowego jako preferencji: %s', (tekst) => {
    expect(rozpoznajTrwalaPreferencjeEcho(tekst)).toBeUndefined()
  })

  it('przekłada wspieraną preferencję na ustawienia Planera', () => {
    const kandydat = rozpoznajTrwalaPreferencjeEcho(
      'Nie planuj mi trudnych rzeczy rano.',
    )!
    expect(preferencjePlanowaniaZPamieci([kandydat])).toEqual({
      godzinySkupieniaOd: '12:00',
      godzinySkupieniaDo: '18:00',
    })
  })
})
