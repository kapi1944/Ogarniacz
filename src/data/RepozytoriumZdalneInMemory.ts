import type { RepozytoriumZdalne, ZmianaSynchronizacji } from './DostawcaSynchronizacji'

function klucz(zmiana: ZmianaSynchronizacji): string {
  return `${zmiana.tabela}:${zmiana.rekord.id}`
}

export class RepozytoriumZdalneInMemory implements RepozytoriumZdalne {
  readonly trwale = false
  private readonly zmiany = new Map<string, ZmianaSynchronizacji>()
  private online = true

  ustawOnline(online: boolean): void {
    this.online = online
  }

  async pobierzZmiany(od: string): Promise<ZmianaSynchronizacji[]> {
    this.sprawdzPolaczenie()
    return [...this.zmiany.values()]
      .filter((zmiana) => zmiana.rekord.updatedAt > od)
      .map((zmiana) => structuredClone(zmiana))
  }

  async wyslijZmiany(zmiany: ZmianaSynchronizacji[]): Promise<void> {
    this.sprawdzPolaczenie()
    for (const zmiana of zmiany) this.zmiany.set(klucz(zmiana), structuredClone(zmiana))
  }

  async ustawZmiany(zmiany: ZmianaSynchronizacji[]): Promise<void> {
    for (const zmiana of zmiany) this.zmiany.set(klucz(zmiana), structuredClone(zmiana))
  }

  async pobierzWszystkie(): Promise<ZmianaSynchronizacji[]> {
    return [...this.zmiany.values()].map((zmiana) => structuredClone(zmiana))
  }

  private sprawdzPolaczenie(): void {
    if (!this.online) throw new Error('Testowy provider synchronizacji jest offline.')
  }
}
