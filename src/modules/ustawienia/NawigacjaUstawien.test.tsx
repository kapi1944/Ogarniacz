import { useState } from 'react'
import Dexie from 'dexie'
import { cleanup as wyczysc, fireEvent as wywolajZdarzenie, render as renderuj, screen as ekran, waitFor as czekajNa, within as wewnatrz } from '@testing-library/react'
import { MemoryRouter as RouterPamieci, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { baza, inicjalizujBaze } from '../../data/BazaOgarniacza'
import { repozytoriumUstawien } from '../../data/RepozytoriumUstawien'
import { DOMYSLNE_USTAWIENIA, normalizujUstawienia } from '../../domain/ustawienia'
import type { Ustawienia } from '../../domain/typy'
import { WidokUstawien } from './WidokUstawien'

const { zapiszEdytora, zapiszUprawnienie, podglad, anulujPodglad } = vi.hoisted(() => ({
  zapiszEdytora: vi.fn(), zapiszUprawnienie: vi.fn(), podglad: vi.fn(), anulujPodglad: vi.fn(),
}))

vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: vi.fn() }))
vi.mock('../../app/DostawcaSesjiEcho', () => ({ useSesjaEcho: () => ({ stanWakeWord: 'niedostepny' }) }))
vi.mock('../../app/DostawcaKonta', () => ({ useKonto: () => ({}), KontoIBezpieczenstwo: () => <h2>Konto i bezpieczeństwo</h2> }))
vi.mock('../../hooks/useRepozytorium', () => ({ useRepozytorium: (nazwa: string) => ({
  dane: [], repozytorium: { zapisz: nazwa === 'edytorzy' ? zapiszEdytora : zapiszUprawnienie },
}) }))
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: (_zapytanie: unknown, _zaleznosci: unknown, domyslne: unknown) => domyslne }))
vi.mock('../../services/DaneDemonstracyjneService', () => ({ czyMoznaWczytacDemo: () => false }))
vi.mock('./PanelAktualizacji', () => ({ PanelAktualizacji: () => <h2>Android APK</h2> }))
vi.mock('./PanelAktualizacjiRaspberry', () => ({ PanelAktualizacjiRaspberry: () => <h2>Raspberry / serwer</h2> }))
vi.mock('./PanelAktualizacjiTestowych', () => ({ PanelAktualizacjiTestowych: () => <h2>Aktualizacje testowe</h2> }))
vi.mock('../../platform/platforma', () => ({ platforma: {
  rodzaj: 'web', natywna: false, powiadomienia: { sprawdzStan: async () => ({}) },
} }))

let ustawieniaPoczatkowe = normalizujUstawienia(undefined)

function OtoczenieUstawien() {
  const [zapisane, ustawZapisane] = useState(ustawieniaPoczatkowe)
  const lokalizacja = useLocation()
  const nawiguj = useNavigate()
  vi.mocked(useAplikacja).mockReturnValue({
    ustawienia: zapisane, zapisaneUstawienia: zapisane,
    ustawPodgladUstawien: podglad, wyczyscPodgladUstawien: anulujPodglad,
    zapiszUstawienia: async (zmiany: Partial<Ustawienia>) => {
      ustawZapisane(await repozytoriumUstawien.zapisz(normalizujUstawienia({ ...zapisane, ...zmiany })))
    },
  } as unknown as ReturnType<typeof useAplikacja>)
  return <>
    <output aria-label="Bieżący adres">{lokalizacja.pathname}{lokalizacja.search}{lokalizacja.hash}</output>
    <button onClick={() => nawiguj(-1)}>Wstecz w historii</button>
    <button onClick={() => nawiguj(1)}>Dalej w historii</button>
    <WidokUstawien />
  </>
}

function pokazUstawienia(adres = '/ustawienia') {
  return renderuj(<RouterPamieci initialEntries={[adres]}><OtoczenieUstawien /></RouterPamieci>)
}

function wybierzKategorie(nazwa: string) {
  wywolajZdarzenie.click(wewnatrz(ekran.getByRole('navigation', { name: 'Kategorie ustawień' })).getByRole('link', { name: nazwa }))
}

beforeEach(async () => {
  baza.close()
  await Dexie.delete('ogarniacz-v1')
  await inicjalizujBaze()
  ustawieniaPoczatkowe = await repozytoriumUstawien.wczytaj()
  vi.clearAllMocks()
})
afterEach(wyczysc)

const przypadkiKategorii = [
  ['wyglad', 'Wygląd i interfejs', 'Wygląd'],
  ['pulpit', 'Pulpit i organizacja', 'Harmonogram'],
  ['echo', 'Echo AI', 'Pamięć Echo'],
  ['powiadomienia', 'Powiadomienia', 'Notification API'],
  ['konta', 'Konta i uprawnienia', 'Profile i lokalny podgląd'],
  ['synchronizacja', 'Synchronizacja', 'Synchronizacja'],
  ['dane', 'Dane i kopie', 'Dane / Backup'],
  ['system', 'System i diagnostyka', 'Raspberry / serwer'],
] as const

it.each(przypadkiKategorii)('otwiera bezpośredni adres kategorii %s', (identyfikator, nazwa, naglowek) => {
  pokazUstawienia(`/ustawienia?kategoria=${identyfikator}`)
  expect(ekran.getByRole('region', { name: nazwa })).toBeInTheDocument()
  expect(ekran.getAllByRole('heading', { name: naglowek }).length).toBeGreaterThan(0)
  expect(wewnatrz(ekran.getByRole('navigation', { name: 'Kategorie ustawień' })).getByRole('link', { name: nazwa })).toHaveAttribute('aria-current', 'page')
  if (identyfikator !== 'dane') expect(ekran.queryByRole('button', { name: 'Utwórz zaszyfrowany backup' })).not.toBeInTheDocument()
  if (identyfikator !== 'system') expect(ekran.queryByRole('heading', { name: 'Raspberry / serwer' })).not.toBeInTheDocument()
  if (identyfikator !== 'echo') expect(ekran.queryByRole('heading', { name: 'Pamięć Echo' })).not.toBeInTheDocument()
})

it('przełącza wszystkie kategorie oraz obsługuje wstecz i dalej bez utraty innych parametrów', () => {
  pokazUstawienia('/ustawienia?element=test')
  for (const [identyfikator, nazwa] of przypadkiKategorii) {
    wybierzKategorie(nazwa)
    expect(ekran.getByLabelText('Bieżący adres')).toHaveTextContent(`/ustawienia?element=test&kategoria=${identyfikator}`)
    expect(ekran.getByRole('region', { name: nazwa })).toBeInTheDocument()
  }
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Wstecz w historii' }))
  expect(ekran.getByRole('region', { name: 'Dane i kopie' })).toBeInTheDocument()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Dalej w historii' }))
  expect(ekran.getByRole('region', { name: 'System i diagnostyka' })).toBeInTheDocument()
})

it('zachowuje stary odnośnik do synchronizacji i pozwala zmienić kategorię', () => {
  pokazUstawienia('/ustawienia#synchronizacja')
  expect(ekran.getByRole('button', { name: 'Synchronizuj teraz' })).toBeInTheDocument()
  wybierzKategorie('Wygląd i interfejs')
  expect(ekran.getByLabelText('Bieżący adres')).toHaveTextContent('/ustawienia?kategoria=wyglad')
})

it('zmienia kategorię mobilnym wyborem i odzwierciedla ją w adresie', () => {
  pokazUstawienia()
  wywolajZdarzenie.change(ekran.getByRole('combobox', { name: 'Kategoria ustawień' }), { target: { value: 'echo' } })
  expect(ekran.getByRole('region', { name: 'Echo AI' })).toBeInTheDocument()
  expect(ekran.getByLabelText('Bieżący adres')).toHaveTextContent('/ustawienia?kategoria=echo')
})

it('otwiera wygląd dla nieznanej kategorii', () => {
  pokazUstawienia('/ustawienia?kategoria=nieznana')
  expect(ekran.getByRole('region', { name: 'Wygląd i interfejs' })).toBeInTheDocument()
})

it.each([
  ['wysoki kontrast', 'Wygląd i interfejs'], ['dojazd', 'Pulpit i organizacja'],
  ['MIKROFON', 'Echo AI'], ['dokladne alarmy', 'Powiadomienia'],
  ['aktywne sesje', 'Konta i uprawnienia'], ['konflikty', 'Synchronizacja'],
  ['kopia zapasowa', 'Dane i kopie'], ['wersja aplikacji', 'System i diagnostyka'],
])('wyszukuje „%s” i prowadzi do właściwej kategorii', (zapytanie, nazwa) => {
  pokazUstawienia()
  wywolajZdarzenie.change(ekran.getByRole('searchbox', { name: 'Szukaj w ustawieniach' }), { target: { value: zapytanie } })
  const wyniki = ekran.getByRole('list', { name: 'Wyniki wyszukiwania ustawień' })
  wywolajZdarzenie.click(wewnatrz(wyniki).getByRole('link', { name: new RegExp(nazwa) }))
  expect(ekran.getByRole('region', { name: nazwa })).toBeInTheDocument()
  expect(ekran.getByRole('searchbox')).toHaveValue('')
})

it('pokazuje brak wyników i czyści wyszukiwanie', () => {
  pokazUstawienia()
  wywolajZdarzenie.change(ekran.getByRole('searchbox'), { target: { value: 'nieistniejacaopcja' } })
  expect(ekran.getByText(/^Brak wyników/)).toHaveAttribute('role', 'status')
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Wyczyść wyszukiwanie' }))
  expect(ekran.queryByRole('list', { name: 'Wyniki wyszukiwania ustawień' })).not.toBeInTheDocument()
})

it('zachowuje niezapisany szkic między kategoriami i zapisuje go dotychczasowym repozytorium', async () => {
  pokazUstawienia()
  wywolajZdarzenie.change(ekran.getByRole('combobox', { name: 'Motyw' }), { target: { value: 'ciemny' } })
  wybierzKategorie('Pulpit i organizacja')
  wywolajZdarzenie.change(ekran.getByRole('spinbutton', { name: 'Limit alertów' }), { target: { value: '5' } })
  wybierzKategorie('Dane i kopie')
  wybierzKategorie('Wygląd i interfejs')
  expect(ekran.getByRole('combobox', { name: 'Motyw' })).toHaveValue('ciemny')
  expect(anulujPodglad).not.toHaveBeenCalled()
  expect((await repozytoriumUstawien.wczytaj()).wyglad.motyw).toBe(DOMYSLNE_USTAWIENIA.wyglad.motyw)
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Zapisz ustawienia' }))
  await ekran.findByText('Ustawienia zostały zapisane.')
  const zapisane = await repozytoriumUstawien.wczytaj()
  expect(zapisane.wyglad.motyw).toBe('ciemny')
  expect(zapisane.pulpit.limitAlertow).toBe(5)
})

it('resetuje tylko wybraną sekcję, anuluje podgląd i zachowuje globalny reset', async () => {
  pokazUstawienia('/ustawienia?kategoria=pulpit')
  wywolajZdarzenie.change(ekran.getByRole('spinbutton', { name: 'Limit alertów' }), { target: { value: '5' } })
  wybierzKategorie('Wygląd i interfejs')
  wywolajZdarzenie.change(ekran.getByRole('combobox', { name: 'Motyw' }), { target: { value: 'ciemny' } })
  const sekcja = ekran.getByRole('heading', { name: 'Wygląd' }).closest('section')!
  wywolajZdarzenie.click(wewnatrz(sekcja).getByRole('button', { name: 'Resetuj sekcję' }))
  expect(ekran.getByRole('combobox', { name: 'Motyw' })).toHaveValue(DOMYSLNE_USTAWIENIA.wyglad.motyw)
  wybierzKategorie('Pulpit i organizacja')
  expect(ekran.getByRole('spinbutton', { name: 'Limit alertów' })).toHaveValue(5)
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Anuluj podgląd' }))
  expect(ekran.getByRole('spinbutton', { name: 'Limit alertów' })).toHaveValue(DOMYSLNE_USTAWIENIA.pulpit.limitAlertow)
  wywolajZdarzenie.change(ekran.getByRole('spinbutton', { name: 'Limit alertów' }), { target: { value: '9' } })
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Resetuj wszystkie' }))
  expect(ekran.getByRole('spinbutton', { name: 'Limit alertów' })).toHaveValue(DOMYSLNE_USTAWIENIA.pulpit.limitAlertow)
  expect(podglad).toHaveBeenCalled()
})

it('zachowuje formularz Edytora i istniejące odnośniki kont oraz personalizacji', async () => {
  pokazUstawienia('/ustawienia?kategoria=konta')
  expect(ekran.getByRole('link', { name: 'Otwórz konta i użytkowników' })).toHaveAttribute('href', '/ustawienia/konta')
  wywolajZdarzenie.change(ekran.getByPlaceholderText('Nazwa Edytora'), { target: { value: 'Profil próbny' } })
  wybierzKategorie('Wygląd i interfejs')
  expect(ekran.getByRole('link', { name: 'Otwórz edytor motywu' })).toHaveAttribute('href', '/ustawienia/personalizacja')
  wybierzKategorie('Konta i uprawnienia')
  expect(ekran.getByPlaceholderText('Nazwa Edytora')).toHaveValue('Profil próbny')
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Dodaj' }))
  await czekajNa(() => expect(zapiszEdytora).toHaveBeenCalledWith(expect.objectContaining({ nazwa: 'Profil próbny' })))
  expect(ekran.getByPlaceholderText('Nazwa Edytora')).toHaveValue('')
})
