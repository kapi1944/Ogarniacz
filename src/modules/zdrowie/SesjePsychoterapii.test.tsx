import Dexie from 'dexie'
import { cleanup as wyczysc, fireEvent as zdarzenie, render as pokaz, screen as ekran, waitFor as poczekaj } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { utworzMetadane } from '../../domain/fabryki'
import type { NazwaModulu, WpisTerapii } from '../../domain/typy'
import { zapiszSesje, utworzCwiczenie, type DostepPsychoterapii } from '../../services/PsychoterapiaService'
import { SesjePsychoterapii } from './SesjePsychoterapii'

const stan = vi.hoisted(() => ({ odczyt: true, edycja: true, dziennik: true, zadania: true }))
vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: () => ({ moze: (modul: NazwaModulu, operacja = 'odczyt', sekcja?: string) => modul === 'zadania' ? stan.zadania : sekcja === 'samopoczucie' ? stan.dziennik : operacja === 'edycja' ? stan.edycja : stan.odczyt }) }))
const dostep: DostepPsychoterapii = { sesje: () => true, dziennik: () => true, zadania: () => true }
function sesja(id = 'sesja'): WpisTerapii { return { ...utworzMetadane(id), terapiaId: '', dataCzas: '2026-10-01T10:00:00Z', tytul: 'Spotkanie testowe', tresc: 'Notatka testowa', psychoterapia: {} } }
function otworz() { return pokaz(<MemoryRouter><SesjePsychoterapii /></MemoryRouter>) }
afterEach(wyczysc)
beforeEach(async () => { stan.odczyt = true; stan.edycja = true; stan.dziennik = true; stan.zadania = true; baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze() })

describe.sequential('Widok sesji psychoterapii', () => {
  it('zapisuje samą notatkę bez obowiązkowych pól i bez autofocus; pozostałe sekcje są zwinięte', async () => {
    otworz(); zdarzenie.click(ekran.getByRole('button', { name: 'Nowa sesja' }))
    expect(document.querySelector('[autofocus]')).toBeNull()
    expect(ekran.getByLabelText('Terapia')).not.toBeVisible()
    expect(ekran.getByLabelText('Własne refleksje')).not.toBeVisible()
    zdarzenie.change(ekran.getByLabelText('Krótka notatka'), { target: { value: 'Szybka notatka' } })
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz sesję' }))
    await poczekaj(async () => expect(await baza.tabela('wpisyTerapii').count()).toBe(1))
    expect((await baza.tabela('wpisyTerapii').toArray())[0]).toMatchObject({ terapiaId: '', tresc: 'Szybka notatka', psychoterapia: {} })
  })

  it('pokazuje niedostępne źródło dziennika bez usuwania sesji i bez ujawnienia starej treści', async () => {
    await baza.tabela('wpisyTerapii').put({ ...sesja(), psychoterapia: { wpisySamopoczuciaIds: ['usuniety'] } })
    otworz(); zdarzenie.click(await ekran.findByRole('button', { name: 'Otwórz sesję' }))
    expect(ekran.getByText('Niedostępne źródło dziennika')).toBeVisible()
    expect(await baza.tabela('wpisyTerapii').count()).toBe(1)
  })

  it('przygotowanie pokazuje przyszłą sesję i pozwala wybrać ID oznaczonego wpisu i wcześniejszych pytań', async () => {
    await zapiszSesje({ ...sesja('poprzednia'), tematNastepnegoSpotkania: 'Pytanie z poprzedniej sesji' }, dostep)
    await zapiszSesje({ ...sesja('przyszla'), dataCzas: '2099-11-01T10:00:00Z', tytul: 'Zaplanowana sesja' }, dostep)
    await baza.tabela('wpisySamopoczucia').put({ ...utworzMetadane('dziennik'), dataObserwacji: '2026-10-01', godzinaObserwacji: '12:00', czasObserwacji: '2026-10-01T10:00:00Z', strefaCzasowa: 'Europe/Warsaw', notatka: 'Obserwacja testowa', wskazniki: [], doOmowienia: true })
    otworz(); await ekran.findByText('Zaplanowana sesja')
    zdarzenie.click(ekran.getByRole('button', { name: 'Przygotuj się' }))
    const wybory = ekran.getAllByRole('checkbox')
    expect(wybory).toHaveLength(2)
    expect(wybory[0]).not.toBeChecked(); expect(wybory[1]).not.toBeChecked()
    zdarzenie.click(wybory[0]); zdarzenie.click(wybory[1])
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz sesję' }))
    await poczekaj(async () => expect((await baza.tabela('wpisyTerapii').get('przyszla'))?.psychoterapia).toMatchObject({ pytaniaSesjiIds: ['poprzednia'], wpisySamopoczuciaIds: ['dziennik'] }))
    expect(JSON.stringify(await baza.tabela('wpisyTerapii').get('przyszla'))).not.toContain('Obserwacja testowa')
  })

  it('oddziela dostęp do sesji, dziennika i zadań; brak edycji ukrywa działania zapisu', async () => {
    await baza.tabela('wpisyTerapii').put({ ...sesja(), psychoterapia: { wpisySamopoczuciaIds: ['tajne-id'], cwiczeniaZadaniaIds: ['cwiczenie'] } })
    stan.dziennik = false; stan.zadania = false; stan.edycja = false
    const widok = otworz()
    expect(ekran.queryByRole('button', { name: 'Nowa sesja' })).toBeNull()
    zdarzenie.click(await ekran.findByRole('button', { name: 'Otwórz sesję' }))
    expect(ekran.getByText('Dziennik: brak uprawnienia do odczytu')).toBeVisible()
    expect(ekran.getByText('Ćwiczenie: brak uprawnienia do odczytu')).toBeVisible()
    expect(ekran.queryByRole('button', { name: 'Edytuj sesję' })).toBeNull()
    stan.odczyt = false; widok.rerender(<MemoryRouter><SesjePsychoterapii /></MemoryRouter>)
    expect(ekran.getByText('Brak uprawnienia do psychoterapii.')).toBeVisible()
    expect(ekran.queryByText('Notatka testowa')).toBeNull()
  })

  it('ćwiczenie wymaga zatwierdzenia, a widok odczytuje bieżący status zwykłego zadania', async () => {
    await zapiszSesje(sesja(), dostep)
    otworz(); zdarzenie.click(await ekran.findByRole('button', { name: 'Otwórz sesję' }))
    zdarzenie.click(ekran.getByRole('button', { name: 'Dodaj ćwiczenie' }))
    expect(ekran.getByRole('button', { name: 'Utwórz ćwiczenie' })).toBeDisabled()
    zdarzenie.change(ekran.getByLabelText('Tytuł ćwiczenia'), { target: { value: 'Ćwiczenie testowe' } })
    zdarzenie.click(ekran.getByRole('checkbox', { name: 'Zatwierdzam utworzenie zadania powiązanego z sesją' }))
    zdarzenie.click(ekran.getByRole('button', { name: 'Utwórz ćwiczenie' }))
    await poczekaj(async () => expect(await baza.tabela('zadania').count()).toBe(1))
    const zadanie = (await baza.tabela('zadania').toArray())[0]
    await pobierzRepozytorium('zadania', dostep.sesje).zapisz({ ...zadanie, status: 'wykonane' })
    await ekran.findByText('Ćwiczenia: 1/1 wykonanych')
  })

  it('historia porządkuje sesje chronologicznie i filtruje po temacie', async () => {
    await zapiszSesje({ ...sesja('nowsza'), dataCzas: '2026-10-05T10:00:00Z', tytul: 'Nowsze spotkanie' }, dostep)
    await zapiszSesje({ ...sesja('starsza'), tytul: 'Starsze spotkanie' }, dostep)
    await utworzCwiczenie('starsza', 'test', { tytul: 'Zadanie', opis: '' }, true, dostep)
    otworz(); await ekran.findByText('Starsze spotkanie')
    expect(ekran.getAllByRole('heading', { level: 3 }).map((naglowek) => naglowek.textContent)).toEqual(['Nowsze spotkanie', 'Starsze spotkanie'])
    zdarzenie.change(ekran.getByLabelText('Szukaj tematu'), { target: { value: 'Nowsze' } })
    expect(ekran.queryByText('Starsze spotkanie')).toBeNull()
  })
})
