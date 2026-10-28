import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { baza, BazaOgarniacza, ustawBazePrzedUruchomieniem } from '../../data/BazaOgarniacza'
import { ustawBiezacyDostep } from '../../services/UprawnieniaService'
import { utworzRozliczenie, dodajWydatekGrupowy, pobierzBilansRozliczenia, type DaneRozliczenia } from '../../services/RozliczeniaService'
import { obsluzWstecz, zarejestrujObslugeWstecz } from '../../platform/obslugaWstecz'
import { parsujDeepLink } from '../../platform/trasy'
import WidokRozliczen from './WidokRozliczen'

vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: () => ({ gotowyDostep: true }) }))
const polecenie = () => ({ idZapisu: crypto.randomUUID(), oczekiwanaRewizja: 0 })
const grupa: DaneRozliczenia = { nazwa: 'Wyjście z Julką', opis: '', waluta: 'PLN', dataRozpoczecia: '2026-10-29', domyslnyPodzial: 'po_rowno', etap: 'aktywne', uczestnicy: [{ id: 'a', nazwa: 'Kacper' }, { id: 'b', nazwa: 'Julka' }] }
function pokaz(trasa = '/finanse/rozliczenia/r') {
  return render(<MemoryRouter initialEntries={[trasa]}><Routes><Route path="/finanse" element={<h1>Finanse osobiste</h1>} /><Route path="/finanse/rozliczenia" element={<WidokRozliczen />} /><Route path="/finanse/rozliczenia/:rozliczenieId" element={<WidokRozliczen />} /></Routes></MemoryRouter>)
}
const wpisz = (etykieta: string, tekst: string) => fireEvent.change(screen.getByRole('textbox', { name: new RegExp('^' + etykieta) }), { target: { value: tekst } })
beforeEach(async () => {
  localStorage.clear()
  ustawBiezacyDostep(() => true)
  ustawBazePrzedUruchomieniem(new BazaOgarniacza('test-f77-' + crypto.randomUUID()))
  await baza.open()
})
afterEach(async () => { cleanup(); ustawBiezacyDostep(); vi.unstubAllGlobals(); await baza.delete() })

it('tworzy rozliczenie offline z dwoma identycznymi nazwami i trwałymi, różnymi ID', async () => {
  vi.stubGlobal('navigator', { ...navigator, onLine: false })
  pokaz('/finanse/rozliczenia')
  fireEvent.click(screen.getByRole('button', { name: 'Nowe rozliczenie' }))
  wpisz('Nazwa rozliczenia', 'Weekend w górach')
  wpisz('Osoba 1', 'Ala'); wpisz('Osoba 2', 'Ala')
  fireEvent.click(screen.getByRole('button', { name: 'Utwórz rozliczenie' }))
  await screen.findByRole('heading', { name: 'Weekend w górach' })
  const rekord = (await baza.tabela('rozliczenia').toArray())[0]
  expect(new Set(rekord.uczestnicy.map(({ id }) => id)).size).toBe(2)
  expect(screen.getAllByText('Ala (osoba 1)').length).toBeGreaterThan(0)
  expect(await baza.tabela('wydatki').count()).toBe(0)
})

it('dodaje uczestnika, zmienia nazwę i wyłącza osobę, zachowując podział wcześniejszego wydatku', async () => {
  await utworzRozliczenie('r', grupa, polecenie())
  await dodajWydatekGrupowy('w', { rozliczenieId: 'r', nazwa: 'Pizza', opis: '', waluta: 'PLN', dataOperacji: '2026-10-29', kwotaGrosze: 4000, finansujacy: [{ uczestnikId: 'a', kwotaGrosze: 4000 }], parametryPodzialu: { metoda: 'po_rowno', uczestnicyIds: ['a', 'b'] } }, polecenie())
  pokaz(); await screen.findByRole('heading', { name: grupa.nazwa })
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj uczestnika' }))
  wpisz('Nazwa osoby', 'Julka'); fireEvent.click(screen.getByRole('button', { name: 'Zapisz osobę' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await screen.findByRole('button', { name: 'Zmień nazwę: Julka (osoba 3)' });
  fireEvent.click(screen.getByRole('button', { name: 'Zmień nazwę: Julka (osoba 2)' }))
  wpisz('Nazwa osoby', 'Julia'); fireEvent.click(screen.getByRole('button', { name: 'Zapisz osobę' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(await screen.findByRole('button', { name: 'Oznacz jako nieaktywną: Julia (osoba 2)' }))
  await screen.findByText('Julia (osoba 2) · Nieaktywna')
  expect((await baza.tabela('wydatkiGrupowe').get('w'))?.podzialKosztu).toEqual([{ uczestnikId: 'a', kwotaGrosze: 2000 }, { uczestnikId: 'b', kwotaGrosze: 2000 }])
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj wydatek' }))
  expect(within(screen.getByRole('dialog')).queryByText('Julia (osoba 2)')).not.toBeInTheDocument()
})

it.each(['po_rowno', 'kwotowo', 'procentowo', 'udzialy'] as const)('zapisuje wielu finansujących i podział %s', async (metoda) => {
  await utworzRozliczenie('r', grupa, polecenie()); pokaz()
  await screen.findByRole('heading', { name: grupa.nazwa })
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj wydatek' }))
  wpisz('Nazwa wydatku', 'Zakupy'); wpisz('Kwota wydatku', '60,00')
  wpisz('Finansowanie: Kacper', '40'); wpisz('Finansowanie: Julka', '20')
  fireEvent.change(screen.getByLabelText('Sposób podziału'), { target: { value: metoda } })
  if (metoda === 'kwotowo') { wpisz('Koszt: Kacper', '30'); wpisz('Koszt: Julka', '30') }
  if (metoda === 'procentowo') { wpisz('Procent: Kacper', '50'); wpisz('Procent: Julka', '50') }
  if (metoda === 'udzialy') { wpisz('Udziały: Kacper', '1'); wpisz('Udziały: Julka', '1') }
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz wydatek' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect((await pobierzBilansRozliczenia('r')).bilanse.find((osoba) => osoba.uczestnikId === 'b')?.doOddaniaGrosze).toBe(1000)
  expect(screen.getByText('Julka (osoba 2) → Kacper (osoba 1): 10,00 PLN')).toBeInTheDocument()
  expect(await baza.tabela('wydatki').count()).toBe(0)
})

it('wyklucza osobę z kosztu i edytuje wydatek bez utraty historii', async () => {
  await utworzRozliczenie('r', grupa, polecenie()); pokaz()
  await screen.findByRole('heading', { name: grupa.nazwa })
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj wydatek' }))
  wpisz('Nazwa wydatku', 'Bilet'); wpisz('Kwota wydatku', '80'); wpisz('Finansowanie: Julka', '80')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Julka (osoba 2)' }))
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz wydatek' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect((await pobierzBilansRozliczenia('r')).sumaWydatkowGrosze).toBe(8000)
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj wydatek: Bilet' }))
  wpisz('Nazwa wydatku', 'Bilet poprawiony')
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz wydatek' }))
  await screen.findByRole('heading', { name: 'Bilet poprawiony' })
  const rekord = (await baza.tabela('wydatkiGrupowe').toArray())[0]
  expect(rekord.historiaWersji).toHaveLength(2)
  expect(rekord.historiaWersji?.[1].przed?.nazwa).toBe('Bilet')
  expect((await pobierzBilansRozliczenia('r')).bilanse.find((osoba) => osoba.uczestnikId === 'a')?.doOddaniaGrosze).toBe(8000)
})

it('nie zapisuje nieprawidłowej sumy finansowania', async () => {
  await utworzRozliczenie('r', grupa, polecenie()); pokaz(); await screen.findByRole('heading', { name: grupa.nazwa })
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj wydatek' }))
  wpisz('Nazwa wydatku', 'Błąd'); wpisz('Kwota wydatku', '40'); wpisz('Finansowanie: Kacper', '30')
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz wydatek' }))
  await screen.findByRole('alert'); expect(await baza.tabela('wydatkiGrupowe').count()).toBe(0)
})

it('blokuje Edytora także przy bezpośrednim wejściu na podstronę', async () => {
  await utworzRozliczenie('r', grupa, polecenie())
  ustawBiezacyDostep((modul) => modul === 'finanse')
  pokaz(); expect(screen.getByRole('alert')).toHaveTextContent('tylko dla właściciela')
  expect(screen.queryByText(grupa.nazwa)).not.toBeInTheDocument()
})

it('Android Wstecz zamyka formularz, następnie wraca do listy i Finansów także po odświeżeniu podstrony', async () => {
  await utworzRozliczenie('r', grupa, polecenie())
  const usunObslugeGlobalna = zarejestrujObslugeWstecz(() => true, 10)
  try {
    pokaz(); await screen.findByRole('heading', { name: grupa.nazwa })
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj wydatek' }))
    await act(async () => { expect(obsluzWstecz()).toBe(true) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => { obsluzWstecz() }); await screen.findByRole('heading', { name: 'Wspólne rozliczenia' })
    await act(async () => { obsluzWstecz() }); expect(screen.getByRole('heading', { name: 'Finanse osobiste' })).toBeInTheDocument()
  } finally { usunObslugeGlobalna() }
})

it('dopuszcza bezpieczne odnośniki platformowe listy i szczegółów', () => {
  expect(parsujDeepLink('ogarniacz://finanse/rozliczenia')).toBe('/finanse/rozliczenia')
  expect(parsujDeepLink('ogarniacz://finanse/rozliczenia/r')).toBe('/finanse/rozliczenia/r')
  expect(parsujDeepLink('ogarniacz://finanse/rozliczenia/r/inna')).toBeNull()
})
