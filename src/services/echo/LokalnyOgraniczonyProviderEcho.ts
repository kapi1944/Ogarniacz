import type { DecyzjaModeluEcho, ProviderModeluEcho, ZadanieModeluEcho } from './typyEcho'

export class LokalnyOgraniczonyProviderEcho implements ProviderModeluEcho {
  readonly nazwa = 'lokalny-ograniczony'
  readonly tryb = 'ograniczony_lokalny' as const

  async odpowiedz(_zadanie: ZadanieModeluEcho, sygnal: AbortSignal): Promise<DecyzjaModeluEcho> {
    if (sygnal.aborted) throw new DOMException('Anulowano', 'AbortError')
    return {
      typ: 'pytanie',
      tresc: 'Nie potrafię jeszcze wiarygodnie zinterpretować tej wypowiedzi. Nie chcę zgadywać ani wykonać niewłaściwej zmiany.',
    }
  }
}
