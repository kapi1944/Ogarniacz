import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { baza, BazaOgarniacza, ustawBazePrzedUruchomieniem } from '../../data/BazaOgarniacza'
import { ustawBiezacyDostep } from '../../services/UprawnieniaService'
import * as kasy from '../../services/WspolneKasyService'
import { obsluzWstecz } from '../../platform/obslugaWstecz'
import { parsujDeepLink, normalizujSciezkePowiadomienia } from '../../platform/trasy'
import WidokPul from './WidokPul'

vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: () => ({ gotowyDostep: true }) }))
const polecenie = (oczekiwanaRewizja = 0) => ({ idZapisu: crypto.randomUUID(), oczekiwanaRewizja })
let pulaId: string
const wpisz = (etykieta: string, wartosc: string) => fireEvent.change(screen.getByRole('textbox', { name: new RegExp('^' + etykieta) }), { target: { value: wartosc } })
function NawigacjaTestowa() {
  const nawiguj = useNavigate()
  return <><button onClick={() => nawiguj(-1)}>Przeglądarka Wstecz</button><button onClick={() => nawiguj(1)}>Przeglądarka Dalej</button></>
}
function pokaz(trasa = `/finanse/pule/${pulaId}`) {
  return render(<MemoryRouter initialEntries={[trasa]}><NawigacjaTestowa /><Routes><Route path="/finanse" element={<h1>Finanse osobiste</h1>} /><Route path="/finanse/pule" element={<WidokPul />} /><Route path="/finanse/pule/:pulaId" element={<WidokPul />} /></Routes></MemoryRouter>)
}
async function utworz(nazwa = 'Wakacje', celGrosze?: number) {
  await kasy.utworzPuleFinansowa(pulaId, { nazwa, opis: 'Opis Puli', ...(celGrosze ? { celGrosze } : {}) }, polecenie())
}
async function zapiszOperacje(typ: 'wpłatę' | 'wydatek', kwota: string, opis: string) {
  fireEvent.click(screen.getByRole('button', { name: `Zarejestruj ${typ}` }))
  wpisz('Kwota', kwota); wpisz(typ === 'wpłatę' ? 'Opis wpłaty' : 'Nazwa lub opis wydatku', opis)
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz operację' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await screen.findByRole('button', { name: `Popraw operację: ${opis}` })
}
beforeEach(async () => {
  localStorage.clear(); ustawBiezacyDostep(() => true)
  ustawBazePrzedUruchomieniem(new BazaOgarniacza('test-ui-pule-' + crypto.randomUUID())); await baza.open()
  pulaId = crypto.randomUUID()
})
afterEach(async () => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); ustawBiezacyDostep(); localStorage.clear(); await baza.delete() })

it('tworzy pierwszą Pulę offline z PLN i celem, bez uczestników', async () => {
  vi.stubGlobal('navigator', { ...navigator, onLine: false })
  pokaz('/finanse/pule')
  fireEvent.click(await screen.findByRole('button', { name: 'Utwórz pierwszą Pulę' }))
  expect(screen.getByLabelText('Waluta')).toHaveValue('PLN')
  wpisz('Nazwa Puli', 'Wakacje'); wpisz('Opis', 'Latem'); wpisz('Cel finansowy', '1000,00')
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz Pulę' }))
  await screen.findByRole('heading', { name: 'Wakacje' })
  expect(screen.getByText(/Brak połączenia/)).toBeInTheDocument()
  expect(screen.getByText('Pula została utworzona lokalnie.')).toBeInTheDocument()
  const pula = (await kasy.listaPodsumowanPul())[0]
  expect(pula.pula).toMatchObject({ waluta: 'PLN', pula: { celGrosze: 100000 } })
  expect(pula.pula).not.toHaveProperty('uczestnicy')
})

it('pokazuje zebrane 500, saldo 300 i 50% celu oraz ostrzega przed ujemnym saldem', async () => {
  await utworz('Wakacje', 100000); pokaz(); await screen.findByRole('heading', { name: 'Wakacje' })
  await zapiszOperacje('wpłatę', '500', 'Oszczędności'); await zapiszOperacje('wydatek', '200', 'Bilety')
  const przeglad = within(screen.getByRole('heading', { name: 'Przegląd Puli' }).closest('section')!)
  await waitFor(() => expect(przeglad.getByText('300,00 PLN')).toBeInTheDocument())
  expect(przeglad.getByText('500,00 PLN')).toBeInTheDocument()
  expect(przeglad.getByText('Postęp zbiórki: 50%')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Zarejestruj wydatek' })); wpisz('Kwota', '400'); wpisz('Nazwa lub opis wydatku', 'Hotel')
  expect(screen.getByText(/Uwaga: ta operacja pozostawi ujemne saldo/)).toBeInTheDocument()
  expect(within(screen.getByRole('dialog')).getByText('-100,00 PLN')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz operację' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect((await kasy.pobierzWidokPuli(pulaId)).podsumowanie?.saldoGrosze).toBe(-10000)
  expect(await baza.tabela('wydatki').count()).toBe(0)
})

it('zachowuje szkic i ID po błędzie zapisu oraz blokuje podwójne kliknięcie', async () => {
  await utworz(); pokaz(); await screen.findByRole('heading', { name: 'Wakacje' })
  const oryginal = kasy.zapiszOperacjePuli
  const zapis = vi.spyOn(kasy, 'zapiszOperacjePuli').mockRejectedValueOnce(new Error('Brak miejsca na dysku'))
  fireEvent.click(screen.getByRole('button', { name: 'Zarejestruj wpłatę' })); wpisz('Kwota', '12,34'); wpisz('Opis wpłaty', 'Szkic')
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz operację' }))
  await screen.findByText('Brak miejsca na dysku')
  expect(screen.getByRole('textbox', { name: /^Kwota/ })).toHaveValue('12,34')
  expect(screen.getByRole('textbox', { name: 'Opis wpłaty' })).toHaveValue('Szkic')
  zapis.mockImplementation(oryginal)
  const przycisk = screen.getByRole('button', { name: 'Zapisz operację' })
  fireEvent.click(przycisk); fireEvent.click(przycisk)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(zapis).toHaveBeenCalledTimes(2)
  expect(zapis.mock.calls[0][1]).toBe(zapis.mock.calls[1][1])
  expect(zapis.mock.calls[0][4]).toEqual(zapis.mock.calls[1][4])
  expect(await baza.tabela('operacjeKas').count()).toBe(1)
})

it('poprawia, usuwa i przywraca operację; pokazuje historię oraz blokadę waluty', async () => {
  await utworz(); pokaz(); await screen.findByRole('heading', { name: 'Wakacje' })
  await zapiszOperacje('wpłatę', '100', 'Pierwsza')
  fireEvent.click(screen.getByRole('button', { name: 'Popraw operację: Pierwsza' })); wpisz('Kwota', '150'); wpisz('Opis wpłaty', 'Poprawiona')
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz operację' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await screen.findByRole('button', { name: 'Popraw operację: Poprawiona' });
  fireEvent.click(screen.getByRole('button', { name: 'Usuń błędną operację' })); fireEvent.click(screen.getByRole('button', { name: 'Potwierdz' }))
  await screen.findByRole('button', { name: 'Przywróć operację' })
  expect(screen.getByRole('heading', { name: 'Wpłata — wpływ · Usunięta' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj Pulę' }))
  expect(screen.getByLabelText('Waluta')).toBeDisabled()
  wpisz('Nazwa Puli', 'Urlop'); wpisz('Opis', 'Nowy opis')
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz Pulę' })); await screen.findByRole('heading', { name: 'Urlop' })
  fireEvent.click(screen.getByRole('button', { name: 'Przywróć operację' })); fireEvent.click(screen.getByRole('button', { name: 'Potwierdz' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect((await kasy.pobierzWidokPuli(pulaId)).operacje[0].historiaWersji).toHaveLength(4)
  expect(screen.getByText('Historia zmian (4)')).toBeInTheDocument()
})

it('archiwizuje po potwierdzeniu, filtruje archiwum, przywraca i wyszukuje', async () => {
  await utworz(); pokaz(); await screen.findByRole('heading', { name: 'Wakacje' })
  fireEvent.click(screen.getByRole('button', { name: 'Archiwizuj Pulę' }))
  expect((await kasy.pobierzWidokPuli(pulaId)).pula.status).toBe('aktywna')
  fireEvent.click(screen.getByRole('button', { name: 'Potwierdz' }))
  await screen.findByRole('button', { name: 'Przywróć Pulę' })
  expect(screen.queryByRole('button', { name: 'Zarejestruj wpłatę' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: '← Pule' }))
  await screen.findByText('Brak pasujących Pul')
  fireEvent.change(screen.getByLabelText('Pokaż Pule'), { target: { value: 'archiwalne' } })
  fireEvent.click(screen.getByRole('link', { name: 'Wakacje' })); await screen.findByRole('button', { name: 'Przywróć Pulę' })
  fireEvent.click(screen.getByRole('button', { name: 'Przywróć Pulę' })); fireEvent.click(screen.getByRole('button', { name: 'Potwierdz' }))
  await screen.findByRole('button', { name: 'Zarejestruj wpłatę' })
  fireEvent.click(screen.getByRole('link', { name: '← Pule' })); await screen.findByRole('link', { name: 'Wakacje' })
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'inne' } })
  expect(screen.getByText('Brak pasujących Pul')).toBeInTheDocument()
})

it('obsługuje bezpośredni URL, Wstecz panel → modal → szczegóły → lista → Finanse', async () => {
  await utworz(); pokaz(); await screen.findByRole('heading', { name: 'Wakacje' })
  fireEvent.click(screen.getByRole('button', { name: 'Zarejestruj wpłatę' }))
  fireEvent.click(screen.getByRole('button', { name: 'Kalendarz: Data operacji' }))
  act(() => { expect(obsluzWstecz()).toBe(true) })
  expect(screen.getByRole('dialog', { name: 'Zarejestruj wpłatę' })).toBeInTheDocument()
  act(() => { obsluzWstecz() }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  act(() => { obsluzWstecz() }); await screen.findByRole('heading', { name: 'Pule' })
  act(() => { obsluzWstecz() }); expect(screen.getByRole('heading', { name: 'Finanse osobiste' })).toBeInTheDocument()
})

it('zachowuje nawigację przeglądarki Wstecz i Dalej', async () => {
  await utworz(); pokaz('/finanse/pule'); fireEvent.click(await screen.findByRole('link', { name: 'Wakacje' }))
  await screen.findByRole('heading', { name: 'Wakacje' })
  fireEvent.click(screen.getByRole('button', { name: 'Przeglądarka Wstecz' })); await screen.findByRole('heading', { name: 'Pule' })
  fireEvent.click(screen.getByRole('button', { name: 'Przeglądarka Dalej' })); await screen.findByRole('heading', { name: 'Wakacje' })
})

it('odróżnia niekompletność od pustej listy i pozostawia historię bez fałszywego salda', async () => {
  await utworz(); await baza.tabela('stanSynchronizacji').put({ id: 'glowny', stan: 'oczekuje', liczbaKonfliktow: 0, liczbaOczekujacych: 0, createdAt: new Date().toISOString(), finanseWspolneNiekompletne: true, updatedAt: new Date().toISOString() })
  pokaz(); await screen.findByText(/Niekompletne dane/)
  expect(screen.queryByText('0,00 PLN')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Historia Puli' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Zarejestruj wpłatę' })).not.toBeInTheDocument()
})

it('przy konflikcie rewizji rodzica zachowuje formularz i nie zapisuje nieaktualnej operacji', async () => {
  await utworz(); pokaz(); await screen.findByRole('heading', { name: 'Wakacje' })
  fireEvent.click(screen.getByRole('button', { name: 'Zarejestruj wpłatę' })); wpisz('Kwota', '10'); wpisz('Opis wpłaty', 'Mój szkic')
  await act(async () => { await kasy.edytujPuleFinansowa(pulaId, { nazwa: 'Nowa nazwa', opis: '' }, polecenie(1)) })
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz operację' }))
  await screen.findByText('Nieaktualna rewizja członka lub zależności operacji.')
  expect(screen.getByRole('textbox', { name: 'Opis wpłaty' })).toHaveValue('Mój szkic')
  expect(screen.getByRole('dialog', { name: 'Zarejestruj wpłatę' })).toBeInTheDocument()
  expect(await baza.tabela('operacjeKas').count()).toBe(0)
})

it('odróżnia brak rekordu, awarię odczytu i odmowę dostępu po wejściu przez URL', async () => {
  const widok = pokaz(); await screen.findByText(/Powiązany rekord nie istnieje/); widok.unmount()
  vi.spyOn(kasy, 'listaPodsumowanPul').mockRejectedValueOnce(new Error('Baza niedostępna'))
  const lista = pokaz('/finanse/pule'); await screen.findByText('Błąd odczytu: Baza niedostępna')
  expect(screen.queryByText('Jeszcze bez Pul')).not.toBeInTheDocument(); lista.unmount()
  ustawBiezacyDostep((modul) => modul === 'finanse'); pokaz()
  expect(screen.getByText(/Brak dostępu. Pule/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Nowa Pula' })).not.toBeInTheDocument()
})

it('dopuszcza deep link Pul z UUID i odrzuca dowolne prefiksy oraz zewnętrzne adresy', () => {
  expect(parsujDeepLink(`ogarniacz://finanse/pule/${pulaId}`)).toBe(`/finanse/pule/${pulaId}`)
  expect(normalizujSciezkePowiadomienia('/finanse/pule')).toBe('/finanse/pule')
  expect(parsujDeepLink('ogarniacz://finanse/pule/obca')).toBeNull()
  expect(parsujDeepLink(`ogarniacz://finanse/pule/${pulaId}/inna`)).toBeNull()
  expect(normalizujSciezkePowiadomienia('https://obca.test/finanse/pule')).toBeNull()
})
