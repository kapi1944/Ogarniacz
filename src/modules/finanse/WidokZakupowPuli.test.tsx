import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { baza, BazaOgarniacza, ustawBazePrzedUruchomieniem } from '../../data/BazaOgarniacza'
import { ustawBiezacyDostep } from '../../services/UprawnieniaService'
import * as zakupy from '../../services/PuleService'
import { utworzPuleFinansowa, pobierzWidokPuli } from '../../services/WspolneKasyService'
import { obsluzWstecz } from '../../platform/obslugaWstecz'
import WidokPul from './WidokPul'

vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: () => ({ gotowyDostep: true }) }))
const polecenie = (oczekiwanaRewizja = 0) => ({ idZapisu: crypto.randomUUID(), oczekiwanaRewizja })
let pulaId: string
const wpisz = (etykieta: string, wartosc: string) => fireEvent.change(screen.getByRole('textbox', { name: new RegExp('^' + etykieta) }), { target: { value: wartosc } })
const wybierz = (etykieta: string, wartosc: string) => fireEvent.change(screen.getByRole('combobox', { name: etykieta }), { target: { value: wartosc } })
function pokaz(trasa = `/finanse/pule/${pulaId}`) {
  render(<MemoryRouter initialEntries={[trasa]}><Routes><Route path="/finanse" element={<h1>Finanse osobiste</h1>} /><Route path="/finanse/pule" element={<WidokPul />} /><Route path="/finanse/pule/:pulaId" element={<WidokPul />} /></Routes></MemoryRouter>)
}
async function utworz() { await utworzPuleFinansowa(pulaId, { nazwa: 'Sklep lokalny', opis: '', rodzaj: 'zakupowa' }, polecenie()) }
async function kup() {
  fireEvent.click(await screen.findByRole('button', { name: 'Nowy zakup' }))
  wpisz('Nazwa zakupu', 'Pierwsza dostawa'); wpisz('Nazwa produktu', 'Produkt A'); wpisz('Liczba sztuk', '3'); wpisz('Koszt całej partii', '10,00')
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zakup' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await screen.findByRole('heading', { name: 'Pierwsza dostawa' })
}
beforeEach(async () => { localStorage.clear(); ustawBiezacyDostep(() => true); ustawBazePrzedUruchomieniem(new BazaOgarniacza('test-ui-fz4-' + crypto.randomUUID())); await baza.open(); pulaId = crypto.randomUUID() })
afterEach(async () => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); ustawBiezacyDostep(); localStorage.clear(); await baza.delete() })

it('tworzy Pulę zakupową z selektora rodzaju i zapisuje zakup offline', async () => {
  vi.stubGlobal('navigator', { ...navigator, onLine: false })
  pokaz('/finanse/pule'); fireEvent.click(await screen.findByRole('button', { name: 'Nowa Pula' }))
  wpisz('Nazwa Puli', 'Sklep lokalny'); wybierz('Rodzaj Puli', 'zakupowa')
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz Pulę' }))
  await screen.findByRole('heading', { name: 'Sklep lokalny' }); await kup()
  expect(await screen.findByRole('button', { name: 'Szczegóły produktu: Produkt A' })).toBeInTheDocument()
  expect(screen.getByText(/Brak połączenia/)).toBeInTheDocument()
  const id = (await baza.tabela('wspolneKasy').toArray())[0].id
  expect((await pobierzWidokPuli(id)).podsumowanie?.saldoGrosze).toBe(-1000)
})

it('pokazuje wiele partii, ponowny zakup produktu i dokładną alokację kosztów', async () => {
  await utworz(); pokaz(); await kup()
  const produktId = (await zakupy.pobierzZakupyPuli(pulaId)).zakupy[0].partie[0].produktId
  fireEvent.click(screen.getByRole('button', { name: 'Nowy zakup' }))
  wpisz('Nazwa zakupu', 'Druga dostawa'); wybierz('Produkt — partia 1', produktId); wpisz('Koszt całej partii 1', '10')
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj partię' }))
  wpisz('Nazwa produktu — partia 2', 'Produkt B'); wpisz('Liczba sztuk — partia 2', '2'); wpisz('Koszt całej partii 2', '20')
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj koszt dodatkowy' })); wpisz('Kwota kosztu 1', '10')
  expect(screen.getByText('40,00 PLN')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zakup' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const widok = await zakupy.pobierzZakupyPuli(pulaId)
  expect(widok.zakupy).toHaveLength(2); expect(widok.wynik?.zapas.partie).toHaveLength(3)
  expect(widok.wynik?.wartoscZapasuGrosze).toBe(5000)
  fireEvent.click(await screen.findByRole('button', { name: 'Szczegóły produktu: Produkt A' }))
  expect(within(screen.getByRole('dialog')).getAllByRole('button', { name: /^Partia/ })).toHaveLength(2)
})

it('zachowuje szkic i identyfikatory po błędzie oraz blokuje wielokrotne kliknięcie', async () => {
  await utworz(); pokaz(); const oryginal = zakupy.zarejestrujZakupPuli
  const zapis = vi.spyOn(zakupy, 'zarejestrujZakupPuli').mockRejectedValueOnce(new Error('Brak miejsca'))
  fireEvent.click(await screen.findByRole('button', { name: 'Nowy zakup' }))
  wpisz('Nazwa zakupu', 'Szkic'); wpisz('Nazwa produktu', 'Produkt'); wpisz('Koszt całej partii', '1')
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zakup' })); await screen.findByText('Brak miejsca')
  expect(screen.getByRole('textbox', { name: 'Nazwa zakupu' })).toHaveValue('Szkic')
  zapis.mockImplementation(oryginal)
  const przycisk = screen.getByRole('button', { name: 'Zapisz zakup' }); fireEvent.click(przycisk); fireEvent.click(przycisk)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(zapis).toHaveBeenCalledTimes(2); expect(zapis.mock.calls[0]).toEqual(zapis.mock.calls[1])
  expect(await baza.tabela('operacjeKas').count()).toBe(1)
})

it('koryguje koszt, pokazuje historię i stornuje korektę bez powtórnej płatności', async () => {
  await utworz(); pokaz(); await kup()
  fireEvent.click(screen.getByRole('button', { name: 'Korekta zakupu: Pierwsza dostawa' }))
  wpisz('Zmiana kosztu', '2'); wpisz('Uzasadnienie korekty', 'Zmiana ceny')
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz korektę' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect((await zakupy.pobierzZakupyPuli(pulaId)).wynik?.wartoscZapasuGrosze).toBe(1200)
  fireEvent.click(screen.getByText('Szczegóły zakupu: Pierwsza dostawa'))
  fireEvent.click(screen.getByRole('button', { name: 'Stornuj korektę: Zmiana ceny' })); fireEvent.click(screen.getByRole('button', { name: 'Potwierdz' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect((await zakupy.pobierzZakupyPuli(pulaId)).wynik?.wartoscZapasuGrosze).toBe(1000)
  expect(await baza.tabela('operacjeKas').count()).toBe(1)
  expect(screen.queryByRole('button', { name: 'Popraw operację: Pierwsza dostawa' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Usuń błędną operację' })).not.toBeInTheDocument()
})

it('Wstecz wraca ze szczegółów partii do produktu, następnie Puli i listy', async () => {
  await utworz(); pokaz(); await kup()
  fireEvent.click(screen.getByRole('button', { name: 'Szczegóły produktu: Produkt A' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Partia/ }))
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Partia: Produkt A')
  await act(async () => { await obsluzWstecz() }); expect(screen.getByRole('dialog')).toHaveAccessibleName('Produkt: Produkt A')
  await act(async () => { await obsluzWstecz() }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Nowy zakup' }))
  await act(async () => { await obsluzWstecz() }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(async () => { await obsluzWstecz() }); await screen.findByRole('heading', { name: 'Pule' })
})

it('blokuje niepoprawne ilości i dokument bez ochrony bez częściowego zakupu', async () => {
  await utworz(); pokaz(); fireEvent.click(await screen.findByRole('button', { name: 'Nowy zakup' }))
  wpisz('Nazwa zakupu', 'Błędny'); wpisz('Nazwa produktu', 'Produkt'); wpisz('Koszt całej partii', '10'); wpisz('Liczba sztuk', '1.5')
  expect((screen.getByRole('textbox', { name: /^Liczba sztuk/ }) as HTMLInputElement).checkValidity()).toBe(false)
  wpisz('Liczba sztuk', '3'); wpisz('Identyfikatory dokumentów', crypto.randomUUID())
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zakup' })); await screen.findByText('Zakup wymaga dokumentu z trwałą ochroną finansową.')
  expect(await baza.tabela('zakupyPul').count()).toBe(0); expect(await baza.tabela('operacjeKas').count()).toBe(0)
})
