import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { przeksztalcElementInbox, sugerujPewnyTypInbox, zapiszDoInbox, zapiszSzybkiZrzut } from './PoczekalniaService'

describe('uniwersalny Inbox', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  it('szybko zapisuje treść ze źródłem i datą utworzenia', async () => {
    const element = await zapiszDoInbox('Sprawdzić ceny opon', 'glos')
    expect(element).toMatchObject({ tresc: 'Sprawdzić ceny opon', zrodlo: 'glos', status: 'do_sklasyfikowania' })
    expect(element.createdAt).toBeTruthy()
  })

  it('oczywisty zakup trafia do istniejącej listy zakupów', async () => {
    const wynik = await zapiszSzybkiZrzut('Kup mleko')
    expect(wynik.wynik?.typ).toBe('zakupy')
    expect(await pobierzRepozytorium('pozycjeZakupow').lista()).toMatchObject([{ nazwa: 'mleko' }])
  })

  it('niejednoznacznego leasingu nie przypisuje arbitralnie do modułu', async () => {
    expect(sugerujPewnyTypInbox('Sprawdzić leasing samochodu')).toBeUndefined()
    const wynik = await zapiszSzybkiZrzut('Sprawdzić leasing samochodu')
    expect(wynik.wynik).toBeUndefined()
    expect((await pobierzRepozytorium('skrzynka').pobierz(wynik.element.id))?.status).toBe('do_sklasyfikowania')
  })

  it('konwertuje element do istniejącej notatki i oznacza źródło jako przetworzone', async () => {
    const element = await zapiszDoInbox('Dokumenty do ubezpieczenia')
    const wynik = await przeksztalcElementInbox(element, 'notatka')
    expect(wynik.typ).toBe('notatki')
    expect((await pobierzRepozytorium('skrzynka').pobierz(element.id))?.status).toBe('przetworzone')
  })

  it('nie traci pełnej treści podczas konwersji', async () => {
    const tresc = 'Pomysł na automatyczne podlewanie z czujnikiem wilgotności'
    const element = await zapiszDoInbox(tresc)
    const wynik = await przeksztalcElementInbox(element, 'notatka')
    expect((await pobierzRepozytorium('notatki').pobierz(wynik.id))?.tresc).toBe(tresc)
  })
})
