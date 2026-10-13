import { it, expect, vi, beforeEach, afterEach } from 'vitest'
// @ts-expect-error — test w JSDOM korzysta z natywnego Blob Node dla fake-indexeddb.
import { Blob as BlobWezla } from 'node:buffer'
import { BazaOgarniacza } from '../data/BazaOgarniacza'
import { RejestrProfili, zarejestrujProfilSesji, otworzBazeProfilu } from '../data/ProfileLokalne'
import { migrujDaneDoProfilu, utworzZaszyfrowanaKopieMigracji } from './MigracjaProfili'
import { odszyfrujBackup } from './BackupService'

beforeEach(() => vi.stubGlobal('Blob', BlobWezla))
afterEach(() => vi.unstubAllGlobals())

it('migracja zachowuje wszystkie rekordy, relacje i Blob; przerwanie wycofuje zapis, ponowienie nie duplikuje', async () => {
  const zrodlo = new BazaOgarniacza('test-migracja-' + crypto.randomUUID())
  const rejestr = new RejestrProfili('test-rejestr-' + crypto.randomUUID())
  await zrodlo.open()
  const profil = await zarejestrujProfilSesji('https://serwer.test', { zalogowany: true, uzytkownikId: 'a', wlascicielId: 'a', email: 'a@example.test', rola: 'wlasciciel', granty: [], edytorzy: [] }, rejestr)
  const cel = await otworzBazeProfilu(profil)
  try {
    for (const tabela of zrodlo.tables) await tabela.put({ id: 'rekord', createdAt: '2020-01-01', relacjaId: 'rekord', tresc: 'Prywatne dane', blob: new Blob(['załącznik'], { type: 'text/plain' }) })
    const opcje = { rejestr, nazwaZrodla: zrodlo.name }
    await expect(migrujDaneDoProfilu(profil, { wlascicielId: 'b', potwierdzonoPrzypisanie: true }, opcje)).rejects.toThrow()
    let liczba = 0
    await expect(migrujDaneDoProfilu(profil, { wlascicielId: 'a', potwierdzonoPrzypisanie: true }, { ...opcje, przedZapisemTabeli: () => { if (++liczba === 4) throw new Error('Przerwano') } })).rejects.toThrow('Przerwano')
    for (const tabela of cel.tables) expect(await tabela.count()).toBe(0)
    expect(await rejestr.stan.get('aktywny')).toBeUndefined()
    await migrujDaneDoProfilu(profil, { wlascicielId: 'a', potwierdzonoPrzypisanie: true }, opcje)
    await migrujDaneDoProfilu(profil, { wlascicielId: 'a', potwierdzonoPrzypisanie: true }, opcje)
    for (const tabela of cel.tables) {
      expect(await tabela.count()).toBe(1)
      const rekord = await tabela.get('rekord')
      expect(rekord.relacjaId).toBe('rekord')
      expect(rekord.blob.size).toBe(new Blob(['załącznik']).size)
      expect(await rekord.blob.text()).toBe('załącznik')
      expect(await zrodlo.table(tabela.name).count()).toBe(1)
    }
    expect((await rejestr.profile.get(profil.id))?.migracja).toBeDefined()
    const kopia = await utworzZaszyfrowanaKopieMigracji('bezpieczne-haslo', zrodlo.name)
    expect(JSON.stringify(kopia)).not.toContain('Prywatne dane')
    expect(JSON.parse(await odszyfrujBackup(JSON.stringify(kopia), 'bezpieczne-haslo')).dane.wpisyTerapii).toHaveLength(1)
  } finally { await cel.delete(); await zrodlo.delete(); await rejestr.delete() }
})

it('migracja odmawia nadpisania istniejących danych profilu', async () => {
  const zrodlo = new BazaOgarniacza('test-migracja-' + crypto.randomUUID())
  const rejestr = new RejestrProfili('test-rejestr-' + crypto.randomUUID())
  await zrodlo.open()
  const profil = await zarejestrujProfilSesji('https://serwer.test', { zalogowany: true, uzytkownikId: 'a', wlascicielId: 'a', email: 'a@example.test', rola: 'wlasciciel', granty: [], edytorzy: [] }, rejestr)
  const cel = await otworzBazeProfilu(profil)
  try {
    await zrodlo.table('zadania').put({ id: 'dane-a' })
    await cel.table('zadania').put({ id: 'dane-b' })
    await expect(migrujDaneDoProfilu(profil, { wlascicielId: 'a', potwierdzonoPrzypisanie: true }, { rejestr, nazwaZrodla: zrodlo.name })).rejects.toThrow('inne dane')
    expect(await cel.table('zadania').get('dane-b')).toBeDefined()
    expect(await cel.table('zadania').get('dane-a')).toBeUndefined()
  } finally { await cel.delete(); await zrodlo.delete(); await rejestr.delete() }
})
