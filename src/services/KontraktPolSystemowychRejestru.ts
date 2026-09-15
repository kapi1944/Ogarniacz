import type {
  DefinicjaPolaRejestru,
  IdAkcjiDomenowejPolaRejestru,
  IdResolveraPolaRejestru,
  WartoscPolaRejestru,
} from '../domain/rejestr'
import type { EncjaBazowa } from '../domain/typy'

export interface KontekstPolaSystemowegoRejestru<T extends EncjaBazowa = EncjaBazowa> {
  encja: T
  daneZrodlowe: Readonly<Record<string, unknown>>
}

export type WynikOdczytuPolaSystemowego =
  | { stan: 'gotowe'; wartosc: unknown }
  | { stan: 'blad'; komunikat: string }

export interface ResolverPolaSystemowegoRejestru<T extends EncjaBazowa = EncjaBazowa> {
  id: IdResolveraPolaRejestru
  wyznaczRevision(kontekst: KontekstPolaSystemowegoRejestru<T>): string
  rozwiaz(kontekst: KontekstPolaSystemowegoRejestru<T>): WartoscPolaRejestru
}

interface WpisCacheResolvera {
  revision: string
  wynik: WynikOdczytuPolaSystemowego
}

function komunikatBleduResolvera(przyczyna: unknown): string {
  return przyczyna instanceof Error && przyczyna.message
    ? `Nie udało się wyliczyć wartości: ${przyczyna.message}`
    : 'Nie udało się wyliczyć wartości.'
}

export class RejestrResolverowPolSystemowych {
  private readonly resolvery = new Map<IdResolveraPolaRejestru, ResolverPolaSystemowegoRejestru>()
  private readonly cache = new Map<string, WpisCacheResolvera>()

  zarejestruj<T extends EncjaBazowa>(resolver: ResolverPolaSystemowegoRejestru<T>): void {
    this.resolvery.set(resolver.id, resolver as ResolverPolaSystemowegoRejestru)
  }

  odczytaj<T extends EncjaBazowa>(
    pole: Extract<DefinicjaPolaRejestru, { zrodlo: 'systemowe'; trybObslugi: 'tylko_odczyt' }>,
    kontekst: KontekstPolaSystemowegoRejestru<T>,
  ): WynikOdczytuPolaSystemowego {
    const resolver = this.resolvery.get(pole.resolverId)
    if (!resolver) return { stan: 'blad', komunikat: `Nie zarejestrowano resolvera „${pole.resolverId}”.` }

    let revision: string
    try {
      revision = resolver.wyznaczRevision(kontekst)
    } catch (przyczyna) {
      return { stan: 'blad', komunikat: komunikatBleduResolvera(przyczyna) }
    }

    const kluczCache = `${pole.id}:${kontekst.encja.id}`
    const poprzedni = this.cache.get(kluczCache)
    if (poprzedni?.revision === revision) return poprzedni.wynik

    const wynik: WynikOdczytuPolaSystemowego = (() => {
      try {
        return { stan: 'gotowe', wartosc: resolver.rozwiaz(kontekst) }
      } catch (przyczyna) {
        return { stan: 'blad', komunikat: komunikatBleduResolvera(przyczyna) }
      }
    })()
    this.cache.set(kluczCache, { revision, wynik })
    return wynik
  }
}

export interface AkcjaDomenowaPolaRejestru<T extends EncjaBazowa = EncjaBazowa> {
  id: IdAkcjiDomenowejPolaRejestru
  wykonaj(kontekst: KontekstPolaSystemowegoRejestru<T>): Promise<void>
}

export class RejestrAkcjiDomenowychPolSystemowych {
  private readonly akcje = new Map<IdAkcjiDomenowejPolaRejestru, AkcjaDomenowaPolaRejestru>()

  zarejestruj<T extends EncjaBazowa>(akcja: AkcjaDomenowaPolaRejestru<T>): void {
    this.akcje.set(akcja.id, akcja as AkcjaDomenowaPolaRejestru)
  }

  async uruchom<T extends EncjaBazowa>(
    pole: Extract<DefinicjaPolaRejestru, { zrodlo: 'systemowe'; trybObslugi: 'akcja_domenowa' }>,
    kontekst: KontekstPolaSystemowegoRejestru<T>,
  ): Promise<void> {
    const akcja = this.akcje.get(pole.actionId)
    if (!akcja) throw new Error(`Nie zarejestrowano akcji domenowej „${pole.actionId}”.`)
    await akcja.wykonaj(kontekst)
  }
}

export function zapiszBezposredniaWartoscPolaSystemowego<T extends EncjaBazowa>(
  encja: T,
  pole: Extract<DefinicjaPolaRejestru, { zrodlo: 'systemowe' }>,
  wartosc: unknown,
): T {
  if (pole.trybObslugi !== 'bezposrednie') {
    throw new Error(`Pole „${pole.etykieta}” nie pozwala na bezpośredni zapis.`)
  }
  return { ...encja, [pole.kluczWlasciwosci]: wartosc }
}

export const rejestrResolverowPolSystemowych = new RejestrResolverowPolSystemowych()
export const rejestrAkcjiDomenowychPolSystemowych = new RejestrAkcjiDomenowychPolSystemowych()
