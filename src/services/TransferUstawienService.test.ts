import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { DOMYSLNE_USTAWIENIA } from '../domain/ustawienia'
import { importujUstawienia, utworzEksportUstawien } from './TransferUstawienService'

describe.sequential('import i eksport ustawień', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  it('błędny import nie zmienia obecnych ustawień', async () => {
    await repozytoriumUstawien.zapisz({ ...DOMYSLNE_USTAWIENIA, powiadomienia: true })
    const przed = await repozytoriumUstawien.wczytaj()

    await expect(importujUstawienia('{"formatVersion":1,"settings":')).rejects.toThrow()

    expect(await repozytoriumUstawien.wczytaj()).toEqual(przed)
  })

  it('poprawny import przechodzi przez normalizator AppSettings', async () => {
    const plik = JSON.stringify({
      formatVersion: 1,
      createdAt: '2026-08-30T10:00:00.000Z',
      settings: {
        wersja: 1,
        wyglad: { promienKart: 999, motyw: 'nieznany' },
        harmonogram: { godzinaRozpoczecia: '25:99', godzinaZakonczenia: '00:00' },
        powiadomienia: true,
      },
    })

    const zapisane = await importujUstawienia(plik)

    expect(zapisane.wyglad.promienKart).toBe(24)
    expect(zapisane.wyglad.motyw).toBe(DOMYSLNE_USTAWIENIA.wyglad.motyw)
    expect(zapisane.harmonogram.godzinaRozpoczecia).toBe(DOMYSLNE_USTAWIENIA.harmonogram.godzinaRozpoczecia)
    expect(zapisane.powiadomienia).toBe(true)
  })

  it('nie zapisuje ustawień z nieobsługiwaną wersją', async () => {
    const przed = await repozytoriumUstawien.wczytaj()
    const plik = JSON.stringify({
      formatVersion: 1,
      createdAt: '2026-08-30T10:00:00.000Z',
      settings: { wersja: 99 },
    })

    await expect(importujUstawienia(plik)).rejects.toThrow('niepoprawny format')

    expect(await repozytoriumUstawien.wczytaj()).toEqual(przed)
  })

  it('eksportuje wersję formatu i znormalizowane settings', async () => {
    const eksport = await utworzEksportUstawien(() => '2026-08-30T10:00:00.000Z')
    expect(eksport).toMatchObject({
      formatVersion: 1,
      createdAt: '2026-08-30T10:00:00.000Z',
      settings: { id: 'glowne', wersja: 1 },
    })
  })
})
