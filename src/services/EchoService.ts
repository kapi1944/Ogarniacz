import { AgentEcho, type OpcjeAgentaEcho } from './echo/AgentEcho'
import type { AkcjaDoPotwierdzeniaEcho, OdpowiedzEcho, ZrodloWejsciaEcho } from './echo/typyEcho'

export type { OdpowiedzEcho, ProviderModeluEcho, StanPracyEcho, TrybEcho } from './echo/typyEcho'
export { LokalnyOgraniczonyProviderEcho } from './echo/LokalnyOgraniczonyProviderEcho'
export { LokalnySemantycznyProviderEcho } from './echo/LokalnySemantycznyProviderEcho'

export class EchoService {
  readonly agent: AgentEcho

  constructor(opcje: OpcjeAgentaEcho = {}) {
    this.agent = new AgentEcho(opcje)
  }

  obsluz(wypowiedz: string, zrodlo: ZrodloWejsciaEcho = 'tekst', sygnal?: AbortSignal): Promise<OdpowiedzEcho> {
    return this.agent.obsluz(wypowiedz, zrodlo, sygnal)
  }

  potwierdz(akcja: AkcjaDoPotwierdzeniaEcho, sygnal?: AbortSignal): Promise<OdpowiedzEcho> {
    return this.agent.potwierdz(akcja, sygnal)
  }

  anulujPotwierdzenie(): void {
    this.agent.anulujPotwierdzenie()
  }
}
