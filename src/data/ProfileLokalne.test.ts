import { describe, it, expect } from 'vitest'
import { BazaOgarniacza } from './BazaOgarniacza'
import { RejestrProfili, zarejestrujProfilSesji, otworzBazeProfilu, aktywujProfil, pobierzSygnalProfilu, zamknijKontekstProfilu } from './ProfileLokalne'
import type { KontoUzytkownika } from '../services/KontaService'

const konto = (id: string): KontoUzytkownika => ({ zalogowany: true, uzytkownikId: id, wlascicielId: id, email: id + '@example.test', rola: 'wlasciciel', granty: [], edytorzy: [] })
describe('izolowane profile lokalne', () => {
  it('rozdziela wszystkie tabele, kolejki i prywatne dane; zamknięcie blokuje ponowne otwarcie', async () => {
    const rejestr = new RejestrProfili('test-profile-' + crypto.randomUUID())
    const a = await zarejestrujProfilSesji('https://serwer.test', konto('a'), rejestr)
    const b = await zarejestrujProfilSesji('https://serwer.test', konto('b'), rejestr)
    const bazaA = await otworzBazeProfilu(a)
    const bazaB = await otworzBazeProfilu(b)
    try {
      for (const tabela of bazaA.tables) await tabela.put({ id: 'prywatny', tresc: 'Dane A' })
      for (const tabela of bazaB.tables) expect(await tabela.count()).toBe(0)
      expect(bazaA.tables.map((tabela) => tabela.name)).toEqual(bazaB.tables.map((tabela) => tabela.name))
      await aktywujProfil(a, rejestr)
      const sygnal = pobierzSygnalProfilu()
      zamknijKontekstProfilu(bazaA)
      expect(sygnal.aborted).toBe(true)
      await expect(bazaA.table('zadania').count()).rejects.toThrow()
      localStorage.setItem('ogarniacz-aktywny-profil', a.id)
      expect(await bazaB.table('wpisyTerapii').count()).toBe(0)
      const ponowny = await zarejestrujProfilSesji('https://serwer.test/', konto('a'), rejestr)
      expect(ponowny.id).toBe(a.id)
      const innySerwer = await zarejestrujProfilSesji('https://inny.test', konto('a'), rejestr)
      expect(innySerwer.id).not.toBe(a.id)
    } finally { await bazaA.delete(); await bazaB.delete(); await rejestr.delete() }
  })
  it('nie otwiera starej bazy jako bazy profilu i zachowuje schemat', async () => {
    const rejestr = new RejestrProfili('test-profile-' + crypto.randomUUID())
    try {
      const profil = await zarejestrujProfilSesji('https://serwer.test', konto('a'), rejestr)
      await expect(otworzBazeProfilu({ ...profil, nazwaBazy: 'ogarniacz-v1' })).rejects.toThrow()
      const stara = new BazaOgarniacza('test-stara-' + crypto.randomUUID())
      const nowa = await otworzBazeProfilu(profil)
      try { await stara.open(); expect(nowa.verno).toBe(stara.verno) }
      finally { await nowa.delete(); await stara.delete() }
    } finally { await rejestr.delete() }
  })
})
