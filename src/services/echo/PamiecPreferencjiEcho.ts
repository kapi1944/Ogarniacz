import { pobierzRepozytorium } from '../../data/Repozytorium'
import { utworzMetadane } from '../../domain/fabryki'
import type { PamiecEcho } from '../../domain/typy'
import type { PreferencjePlanowania } from '../PlanerService'
import type { KandydatPamieciEcho, MagazynPamieciEcho } from './typyEcho'

function uprosc(tekst: string): string {
  return tekst
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
}

export function rozpoznajTrwalaPreferencjeEcho(tekst: string): KandydatPamieciEcho | undefined {
  const tresc = tekst.trim().replace(/\s+/g, ' ')
  const uproszczona = uprosc(tresc)
  const jestPreferencja = /^(wole|nie planuj mi|przypominaj mi)\b/.test(uproszczona)
  if (!jestPreferencja) return undefined
  return {
    tresc,
    typ: 'preferencja',
    zrodlo: 'jawna_prosba',
    utworzonoAt: new Date().toISOString(),
    pewnosc: 0.95,
  }
}

export function preferencjePlanowaniaZPamieci(
  preferencje: readonly KandydatPamieciEcho[],
): Partial<PreferencjePlanowania> {
  const teksty = preferencje.map((preferencja) => uprosc(preferencja.tresc))
  if (teksty.some((tekst) => tekst.includes('nie planuj mi') && tekst.includes('trudn') && tekst.includes('rano'))) {
    return { godzinySkupieniaOd: '12:00', godzinySkupieniaDo: '18:00' }
  }
  if (teksty.some((tekst) => tekst.includes('trudn') && tekst.includes('przed poludniem'))) {
    return { godzinySkupieniaOd: '08:00', godzinySkupieniaDo: '12:00' }
  }
  return {}
}

export class MagazynPreferencjiEcho implements MagazynPamieciEcho {
  private readonly repozytorium = pobierzRepozytorium('pamiecEcho')

  async wyszukaj(zapytanie: string, limit: number): Promise<KandydatPamieciEcho[]> {
    const fraza = uprosc(zapytanie.trim())
    return (await this.repozytorium.lista())
      .filter((wpis) => wpis.typ === 'preferencja')
      .filter((wpis) => !fraza || uprosc(wpis.tresc).includes(fraza))
      .slice(0, limit)
      .map((wpis) => ({
        tresc: wpis.tresc,
        typ: 'preferencja',
        zrodlo: wpis.zrodlo === 'reczne' ? 'reczne' : 'jawna_prosba',
        utworzonoAt: wpis.createdAt,
        pewnosc: 1,
      }))
  }

  async zapisz(kandydat: KandydatPamieciEcho): Promise<string> {
    const istniejacy = (await this.repozytorium.lista()).find(
      (wpis) => wpis.typ === 'preferencja' && uprosc(wpis.tresc) === uprosc(kandydat.tresc),
    )
    if (istniejacy) return istniejacy.id
    const wpis: PamiecEcho = {
      ...utworzMetadane(),
      tresc: kandydat.tresc,
      typ: 'preferencja',
      zrodlo: kandydat.zrodlo,
      wrazliwosc: 'zwykla',
      sposob: kandydat.zrodlo === 'reczne' ? 'reczne' : 'zaproponowane',
    }
    return this.repozytorium.zapisz(wpis)
  }

  usun(id: string): Promise<void> {
    return this.repozytorium.usun(id)
  }
}
