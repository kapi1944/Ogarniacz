import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza } from '../../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { nasluchujZmianDanych } from '../../data/ZdarzeniaDanych'
import { utworzZadanie } from '../ZadaniaService'
import { utworzDomyslnyRejestrNarzedziEcho, WykonawcaNarzedziEcho } from './NarzedziaEcho'

const repozytorium = pobierzRepozytorium('zadania')
const wykonawca = new WykonawcaNarzedziEcho(utworzDomyslnyRejestrNarzedziEcho(), undefined, async () => undefined)

beforeEach(async () => {
  await Promise.all((['zadania', 'kolejkaSynchronizacji', 'historiaZmian'] as const).map((nazwa) => baza.tabela(nazwa).clear()))
})

afterAll(() => baza.close())

describe('complete_task przez Echo', () => {
  it('kończy zwykłe zadanie, zapisuje wykonanoAt, outbox i powiadamia o zmianie', async () => {
    const zadanie = utworzZadanie({ tytul: 'Telefon', opis: 'Notatka', priorytet: 'normalny' })
    await repozytorium.zapisz(zadanie)
    await baza.tabela('kolejkaSynchronizacji').clear()
    const obsluga = vi.fn()
    const odlacz = nasluchujZmianDanych(obsluga)
    try {
      const wynik = await wykonawca.wykonaj({ id: 'zwykle', nazwa: 'complete_task', argumenty: { id: zadanie.id } })
      expect(wynik.status).toBe('wykonane')
      const zapisane = await repozytorium.pobierz(zadanie.id)
      expect(zapisane).toMatchObject({ status: 'wykonane', tytul: 'Telefon', opis: 'Notatka' })
      expect(zapisane?.wykonanoAt).toEqual(expect.any(String))
      expect(Number.isFinite(Date.parse(zapisane!.wykonanoAt!))).toBe(true)
      expect(await repozytorium.lista()).toHaveLength(1)
      expect(await baza.tabela('kolejkaSynchronizacji').toArray()).toMatchObject([
        { tabela: 'zadania', rekordId: zadanie.id, operacja: 'aktualizacja', rekord: { status: 'wykonane', wykonanoAt: zapisane!.wykonanoAt } },
      ])
      expect(obsluga).toHaveBeenCalledWith('zadania')
    } finally {
      odlacz()
    }
  })

  it('tworzy dokładnie jedno otwarte kolejne wystąpienie zadania cyklicznego', async () => {
    const zadanie = {
      ...utworzZadanie({ tytul: 'Co tydzień', opis: '', priorytet: 'normalny', termin: '2026-10-03' }),
      powtarzanie: { typ: 'tygodniowo' as const, coIle: 1 },
    }
    await repozytorium.zapisz(zadanie)
    const wynik = await wykonawca.wykonaj({ id: 'cykliczne', nazwa: 'complete_task', argumenty: { id: zadanie.id } })
    expect(wynik.status).toBe('wykonane')
    const zadania = await repozytorium.lista()
    expect(zadania).toHaveLength(2)
    expect(zadania.find(({ id }) => id === zadanie.id)).toMatchObject({ status: 'wykonane', wykonanoAt: expect.any(String) })
    expect(zadania.filter(({ id }) => id !== zadanie.id)).toMatchObject([
      { status: 'otwarte', termin: '2026-10-10', wykonanoAt: undefined, powtarzanie: zadanie.powtarzanie },
    ])
    expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(2)
  })

  it('zwraca kontrolowany błąd dla brakującego zadania i niczego nie zapisuje', async () => {
    const wynik = await wykonawca.wykonaj({ id: 'brak', nazwa: 'complete_task', argumenty: { id: 'nie-istnieje' } })
    expect(wynik).toMatchObject({ status: 'blad', komunikat: expect.any(String) })
    expect(await repozytorium.lista()).toHaveLength(0)
    expect(await baza.tabela('kolejkaSynchronizacji').count()).toBe(0)
  })
})
