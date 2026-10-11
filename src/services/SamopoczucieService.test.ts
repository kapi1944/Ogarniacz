import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { domyslneUstawieniaSamopoczucia, schematWpisuSamopoczucia, type WpisSamopoczucia } from '../domain/samopoczucie'
import { chwileObserwacji, dodajWersjeWskaznika, usunWpisSamopoczucia, zapiszWpisSamopoczucia } from './SamopoczucieService'
import { nazwyTabelSynchronizowanych, SyncEngine } from './SyncEngine'
import { obliczChecksum, przygotujBackupDoPrzywracania, przywrocBackup, utworzBackup } from './BackupService'

const czas = '2026-10-11T10:00:00.000Z'
function wpis(id = 'obserwacja'): WpisSamopoczucia {
  return { id, createdAt: czas, updatedAt: czas, dataObserwacji: '2026-10-11', godzinaObserwacji: '12:00', czasObserwacji: czas,
    strefaCzasowa: 'Europe/Warsaw', wskazniki: [], notatka: 'Prywatna refleksja', doOmowienia: true }
}
const dostep = () => true

describe.sequential('Lokalny dziennik samopoczucia', () => {
  beforeEach(async () => { baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze(); await baza.tabela('kolejkaSynchronizacji').clear() })

  it('zapisuje notatkę i wiele obserwacji jednego dnia offline, zachowując zero i brak osobno', async () => {
    await zapiszWpisSamopoczucia(wpis(), dostep)
    await zapiszWpisSamopoczucia({ ...wpis('zero'), notatka: undefined, wskazniki: [{ definicja: domyslneUstawieniaSamopoczucia.definicje[0], wartosc: 0 }] }, dostep)
    baza.close(); await baza.open()
    const dane = await baza.tabela('wpisySamopoczucia').toArray()
    expect(dane).toHaveLength(2)
    expect(dane.find((w) => w.id === 'obserwacja')?.wskazniki).toEqual([])
    expect(dane.find((w) => w.id === 'zero')?.wskazniki[0].wartosc).toBe(0)
    expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(0)
    expect(JSON.stringify(await baza.tabela('historiaZmian').toArray())).not.toContain('Prywatna refleksja')
    await expect(zapiszWpisSamopoczucia({ ...wpis('pusty'), notatka: undefined }, dostep)).rejects.toThrow()
  })

  it('edytuje, odrzuca spóźnioną edycję i usuwa miękko; odmowa dostępu nie zapisuje', async () => {
    await expect(zapiszWpisSamopoczucia(wpis(), () => false)).rejects.toThrow('uprawnienia')
    expect(await baza.tabela('wpisySamopoczucia').count()).toBe(0)
    await zapiszWpisSamopoczucia(wpis(), dostep)
    const pierwotny = (await baza.tabela('wpisySamopoczucia').get('obserwacja'))!
    await zapiszWpisSamopoczucia({ ...pierwotny, notatka: 'Po edycji' }, dostep)
    await expect(zapiszWpisSamopoczucia({ ...pierwotny, notatka: 'Spóźniona' }, dostep)).rejects.toThrow('uległ zmianie')
    await expect(usunWpisSamopoczucia(pierwotny.id, () => false)).rejects.toThrow('uprawnienia')
    await usunWpisSamopoczucia(pierwotny.id, dostep)
    expect((await baza.tabela('wpisySamopoczucia').get(pierwotny.id))?.usunietoAt).toBeTruthy()
    expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(0)
  })

  it('wersjonuje własne skale i preferencje bez reinterpretacji starej obserwacji', async () => {
    const ustawienia = await repozytoriumUstawien.wczytaj()
    const definicja = { ...domyslneUstawieniaSamopoczucia.definicje[0], id: 'wlasny', nazwa: 'Własna skala' }
    const pierwsze = dodajWersjeWskaznika(domyslneUstawieniaSamopoczucia, definicja)
    await repozytoriumUstawien.zapisz({ ...ustawienia, samopoczucie: pierwsze })
    await baza.tabela('kolejkaSynchronizacji').clear()
    await zapiszWpisSamopoczucia({ ...wpis(), wskazniki: [{ definicja, wartosc: 0 }] }, dostep)
    const drugie = { ...dodajWersjeWskaznika(pierwsze, { ...definicja, maksimum: 100, kierunek: 'nizej_lepiej' }), ulubione: ['wlasny'], sekcje: [], tryb: 'rozszerzony' } as const
    await repozytoriumUstawien.zapisz({ ...ustawienia, samopoczucie: drugie })
    expect((await repozytoriumUstawien.wczytaj()).samopoczucie).toEqual(drugie)
    expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(0)
    const dawny = (await baza.tabela('wpisySamopoczucia').get('obserwacja'))!
    await zapiszWpisSamopoczucia({ ...dawny, notatka: 'Edytowana notatka' }, dostep)
    expect((await baza.tabela('wpisySamopoczucia').get(dawny.id))?.wskazniki[0].definicja.maksimum).toBe(10)
    await expect(zapiszWpisSamopoczucia({ ...wpis('nowy'), wskazniki: [{ definicja, wartosc: 0 }] }, dostep)).rejects.toThrow('Definicja')
    await expect(repozytoriumUstawien.zapisz({ ...ustawienia, samopoczucie: pierwsze })).rejects.toThrow('wersje')
  })

  it('rozróżnia jesienne wystąpienia i odrzuca nieistniejącą godzinę oraz niezgodne daty', () => {
    expect(chwileObserwacji('2026-10-25', '02:30', 'Europe/Warsaw')).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z'])
    expect(chwileObserwacji('2026-03-29', '02:30', 'Europe/Warsaw')).toEqual([])
    expect(schematWpisuSamopoczucia.safeParse({ ...wpis(), strefaCzasowa: 'nieistniejaca' }).success).toBe(false)
    expect(schematWpisuSamopoczucia.safeParse({ ...wpis(), godzinaObserwacji: '13:00' }).success).toBe(false)
  })

  it('zachowuje świadome Nie i tekst własnych wskaźników, odrzuca typ i zakres spoza skali', () => {
    const podstawa = domyslneUstawieniaSamopoczucia.definicje[0]
    expect(schematWpisuSamopoczucia.parse({ ...wpis(), wskazniki: [{ definicja: { ...podstawa, typ: 'tak_nie' }, wartosc: false }] }).wskazniki[0].wartosc).toBe(false)
    expect(schematWpisuSamopoczucia.parse({ ...wpis(), wskazniki: [{ definicja: { ...podstawa, typ: 'tekst' }, wartosc: 'Moja obserwacja' }] }).wskazniki[0].wartosc).toBe('Moja obserwacja')
    expect(schematWpisuSamopoczucia.safeParse({ ...wpis(), wskazniki: [{ definicja: podstawa, wartosc: 11 }] }).success).toBe(false)
    expect(schematWpisuSamopoczucia.safeParse({ ...wpis(), wskazniki: [{ definicja: podstawa, wartosc: false }] }).success).toBe(false)
  })

  it('rzeczywisty SyncEngine nie wysyła wpisów ani definicji; pull zachowuje prywatne preferencje', async () => {
    const ustawienia = await repozytoriumUstawien.wczytaj()
    const prywatne = { ...domyslneUstawieniaSamopoczucia, ulubione: ['lek'] }
    await repozytoriumUstawien.zapisz({ ...ustawienia, samopoczucie: prywatne })
    await zapiszWpisSamopoczucia(wpis(), dostep)
    expect(nazwyTabelSynchronizowanych).not.toContain('wpisySamopoczucia')
    const wyslij = vi.fn(async () => {})
    const silnik = new SyncEngine({ czyOnline: () => true, installationId: () => 'test', opoznieniePonowieniaMs: 0 })
    await silnik.synchronizuj({ pobierzZmiany: async () => [], wyslijZmiany: wyslij })
    expect(JSON.stringify(wyslij.mock.calls)).not.toContain('samopoczucie')
    expect(JSON.stringify(wyslij.mock.calls)).not.toContain('Prywatna refleksja')
    await silnik.synchronizuj({ pobierzZmiany: async () => [{ tabela: 'ustawienia', installationId: 'inne', rekord: { ...ustawienia, updatedAt: '2099-01-01T00:00:00.000Z' } }], wyslijZmiany: wyslij })
    expect((await repozytoriumUstawien.wczytaj()).samopoczucie).toEqual(prywatne)
  })

  it('backup odtwarza wpis i historyczną skalę; stary backup nie czyści dziennika ani jego ustawień', async () => {
    const ustawienia = await repozytoriumUstawien.wczytaj()
    const stary = await utworzBackup(['ustawienia'])
    stary.manifest.dexieSchemaVersion = 16
    const { checksum: _checksum, ...manifest } = stary.manifest
    stary.manifest.checksum = await obliczChecksum({ manifest, payload: stary.payload })
    await repozytoriumUstawien.zapisz({ ...ustawienia, samopoczucie: domyslneUstawieniaSamopoczucia })
    await zapiszWpisSamopoczucia({ ...wpis(), wskazniki: [{ definicja: domyslneUstawieniaSamopoczucia.definicje[0], wartosc: 0 }] }, dostep)
    const kopia = await utworzBackup(['samopoczucie', 'ustawienia'])
    await przywrocBackup(await przygotujBackupDoPrzywracania(JSON.stringify(stary)))
    expect(await baza.tabela('wpisySamopoczucia').count()).toBe(1)
    expect((await repozytoriumUstawien.wczytaj()).samopoczucie).toEqual(domyslneUstawieniaSamopoczucia)
    await baza.tabela('wpisySamopoczucia').clear()
    const wynik = await przywrocBackup(await przygotujBackupDoPrzywracania(JSON.stringify(kopia)))
    expect(wynik.backupPrzedPrzywracaniem.manifest.sections).toContain('samopoczucie')
    expect((await baza.tabela('wpisySamopoczucia').get('obserwacja'))?.wskazniki[0].wartosc).toBe(0)
  })
})
