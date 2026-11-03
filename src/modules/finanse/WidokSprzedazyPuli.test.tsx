import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { baza, BazaOgarniacza, ustawBazePrzedUruchomieniem } from '../../data/BazaOgarniacza'
import { ustawBiezacyDostep } from '../../services/UprawnieniaService'
import { utworzPuleFinansowa, pobierzWidokPuli } from '../../services/WspolneKasyService'
import { zarejestrujZakupPuli } from '../../services/PuleService'
import { pobierzSprzedazePuli } from '../../services/SprzedazPulService'
import { obsluzWstecz } from '../../platform/obslugaWstecz'
import WidokSprzedazyPuli from './WidokSprzedazyPuli'

const polecenie = () => ({ idZapisu: crypto.randomUUID(), oczekiwanaRewizja: 0 })
let pulaId: string, partiaId: string
async function pokaz() { render(<MemoryRouter><WidokSprzedazyPuli pula={(await pobierzWidokPuli(pulaId)).pula} edycja /></MemoryRouter>); await screen.findByRole('button', { name: 'Nowa sprzedaż' }) }
const wpisz = (nazwa: string, wartosc: string) => fireEvent.change(screen.getByRole('textbox', { name: new RegExp('^' + nazwa) }), { target: { value: wartosc } })
beforeEach(async () => {
  localStorage.clear(); ustawBiezacyDostep(() => true); ustawBazePrzedUruchomieniem(new BazaOgarniacza('test-ui-fz5-' + crypto.randomUUID())); await baza.open()
  pulaId = crypto.randomUUID(); partiaId = crypto.randomUUID()
  await utworzPuleFinansowa(pulaId, { nazwa: 'Pula', opis: '', rodzaj: 'zakupowa' }, polecenie())
  await zarejestrujZakupPuli(pulaId, crypto.randomUUID(), { nazwa: 'Zakup', dataZakupu: '2026-11-01', opis: '', operacjaGotowkiId: crypto.randomUUID(), dokumentyIds: [], kosztyDodatkowe: [], partie: [{ id: partiaId, produktId: crypto.randomUUID(), nazwaProduktu: 'Produkt A', liczbaSztuk: 3, kosztTowaruGrosze: 1000 }] }, polecenie(), 1)
})
afterEach(async () => { cleanup(); vi.restoreAllMocks(); ustawBiezacyDostep(); localStorage.clear(); await baza.delete() })
it('aktualizuje dokładny ułamek, zapisuje 3 sztuki za 10 zł i pokazuje historię', async () => {
  await pokaz(); fireEvent.click(screen.getByRole('button', { name: 'Nowa sprzedaż' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Produkt i partia 1' }), { target: { value: partiaId } })
  wpisz('Liczba sztuk 1', '3'); wpisz('Cena całkowita 1', '10,00')
  expect(screen.getByRole('textbox', { name: 'Cena jednostkowa — dokładny ułamek grosza' })).toHaveValue('1000/3 grosza/szt.')
  fireEvent.click(screen.getByRole('button', { name: 'Potwierdź otrzymanie całej kwoty' }))
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz sprzedaż' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect((await pobierzSprzedazePuli(pulaId)).wynik?.zapas.partie[0].liczbaSztuk).toBe(0)
  expect(await screen.findByText('Szczegóły sprzedaży')).toBeInTheDocument()
})
it('blokuje ułamkowy grosz w cenie jednostkowej i zachowuje szkic po niepełnej płatności', async () => {
  await pokaz(); fireEvent.click(screen.getByRole('button', { name: 'Nowa sprzedaż' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Produkt i partia 1' }), { target: { value: partiaId } })
  wpisz('Liczba sztuk 1', '3')
  fireEvent.change(screen.getByRole('combobox', { name: 'Tryb ceny 1' }), { target: { value: 'jednostkowa' } })
  wpisz('Cena jednostkowa 1', '3.333333')
  expect((screen.getByRole('textbox', { name: /^Cena jednostkowa 1/ }) as HTMLInputElement).checkValidity()).toBe(false)
  wpisz('Cena jednostkowa 1', '3.33'); wpisz('Rzeczywiście otrzymana płatność', '1')
  expect(screen.getByRole('textbox', { name: 'Cena całkowita — wynik' })).toHaveValue('9,99 PLN')
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz sprzedaż' }))
  await screen.findByText('FZ-5 wymaga pełnej zapłaty równej cenie sprzedaży.')
  expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(await baza.tabela('sprzedazePul').count()).toBe(0)
})
it('Wstecz zamyka formularz sprzedaży bez zapisu', async () => {
  await pokaz(); fireEvent.click(screen.getByRole('button', { name: 'Nowa sprzedaż' }))
  await act(async () => { await obsluzWstecz() })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(await baza.tabela('sprzedazePul').count()).toBe(0)
})
