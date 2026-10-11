import Dexie from 'dexie'
import { act as wykonaj, cleanup as wyczysc, fireEvent as zdarzenie, render as pokaz, screen as ekran, waitFor as poczekaj, within as wewnatrz } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../../data/BazaOgarniacza'
import { utworzMetadane } from '../../domain/fabryki'
import { OsCzasuZdrowia, WazneInformacjeZdrowotne } from './HistoriaZdrowia'
import { zapiszWaznaInformacje } from '../../services/HistoriaZdrowiaService'
import * as historiaZdrowia from '../../services/HistoriaZdrowiaService'
import type { NazwaModulu } from '../../domain/typy'

const stan = vi.hoisted(() => ({ dostep: true, edycja: true, zablokowany: '' }))
const { zapiszPlik } = vi.hoisted(() => ({ zapiszPlik: vi.fn(async (_nazwa: string, _dane: Blob) => true) }))
const moze = (modul: NazwaModulu, operacja: 'odczyt' | 'edycja', sekcja?: string) => stan.dostep && (operacja === 'odczyt' || stan.edycja) && modul !== stan.zablokowany && sekcja !== stan.zablokowany
vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: () => ({ moze }) }))
vi.mock('../../platform/platforma', () => ({ platforma: { rodzaj: 'web', haptyka: { ostrzezenie: async () => {} }, pliki: { zapisz: zapiszPlik } } }))

beforeEach(async () => {
  stan.dostep = true; stan.edycja = true; stan.zablokowany = ''; vi.clearAllMocks()
  baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze()
})
afterEach(() => { wyczysc(); vi.restoreAllMocks() })
async function otworzKarte() { pokaz(<MemoryRouter><WazneInformacjeZdrowotne /></MemoryRouter>); await poczekaj(() => expect(ekran.getByRole('button', { name: 'Przygotuj kartę do eksportu' })).toBeEnabled()) }

describe('Widoki osi zdrowia', () => {
  it('nie pokazuje terapii przed świadomym otwarciem i nie ustawia autofocus', async () => {
    await baza.tabela('wpisyTerapii').put({ ...utworzMetadane('sesja'), terapiaId: 'terapia', dataCzas: '2026-10-11T10:00:00Z', tresc: 'TAJNA TREŚĆ SESJI', psychoterapia: { wypowiedzi: 'PRYWATNA WYPOWIEDŹ' } })
    pokaz(<MemoryRouter><OsCzasuZdrowia /></MemoryRouter>)
    const przycisk = await ekran.findByRole('button', { name: 'Świadomie otwórz szczegóły' })
    expect(ekran.queryByText('TAJNA TREŚĆ SESJI')).not.toBeInTheDocument()
    expect(document.querySelector('[autofocus]')).toBeNull()
    zdarzenie.click(przycisk)
    expect(await ekran.findByText('TAJNA TREŚĆ SESJI')).toBeInTheDocument()
    expect(ekran.getByText('PRYWATNA WYPOWIEDŹ')).toBeInTheDocument()
  })

  it('wybór wydarzenia tworzy dopiero szkic z odniesieniem, bez automatycznej diagnozy', async () => {
    await baza.tabela('leki').put({ ...utworzMetadane('lek'), nazwa: 'Lek źródłowy', aktywny: true, dataOd: '2026-10-11', dawkaInstrukcja: '', godziny: [] })
    pokaz(<MemoryRouter><OsCzasuZdrowia /></MemoryRouter>)
    zdarzenie.click(await ekran.findByRole('button', { name: 'Dodaj jako ważne' }))
    expect(await baza.tabela('wazneInformacjeZdrowotne').count()).toBe(0)
    expect(ekran.getByLabelText('Treść *')).toHaveValue('')
    expect(ekran.getByLabelText('Status potwierdzenia')).toHaveValue('do_weryfikacji')
    expect(ekran.getByLabelText('Kategoria')).toHaveValue('inne')
    zdarzenie.change(ekran.getByLabelText('Treść *'), { target: { value: 'Fakt wybrany przeze mnie' } })
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz ważną informację' }))
    await poczekaj(async () => expect(await baza.tabela('wazneInformacjeZdrowotne').count()).toBe(1))
    expect((await baza.tabela('wazneInformacjeZdrowotne').toArray())[0]).toMatchObject({ zrodlo: { tabela: 'leki', id: 'lek' }, statusPotwierdzenia: 'do_weryfikacji', ukryjTresc: true })
  })

  it('zapisuje ręczną datę przybliżoną i przegląd; tryb odczytu blokuje edycję', async () => {
    await otworzKarte(); zdarzenie.click(ekran.getByRole('button', { name: 'Dodaj ważną informację' }))
    expect(document.querySelector('[autofocus]')).toBeNull()
    zdarzenie.change(ekran.getByLabelText('Treść *'), { target: { value: 'Wydarzenie historyczne' } })
    zdarzenie.change(ekran.getByLabelText('Dokładność daty'), { target: { value: 'rok' } })
    zdarzenie.change(ekran.getByLabelText('Data lub początek okresu *'), { target: { value: '2020' } })
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz ważną informację' }))
    await poczekaj(async () => expect(await baza.tabela('wazneInformacjeZdrowotne').count()).toBe(1))
    const zapis = (await baza.tabela('wazneInformacjeZdrowotne').toArray())[0]
    expect(zapis.data).toEqual({ dokladnosc: 'rok', od: '2020' })
    wyczysc(); stan.edycja = false; await otworzKarte()
    expect(ekran.queryByRole('button', { name: 'Dodaj ważną informację' })).not.toBeInTheDocument()
    expect(ekran.queryByRole('button', { name: 'Edytuj informację' })).not.toBeInTheDocument()
  })

  it('eksport wymaga podglądu, respektuje wybór sekcji i nie zawiera ukrytego planu', async () => {
    await baza.tabela('leki').put({ ...utworzMetadane('lek'), nazwa: 'Lek źródłowy', aktywny: true, dawkaInstrukcja: '', godziny: [] })
    await zapiszWaznaInformacje({ ...utworzMetadane('plan'), kategoria: 'plan_wsparcia', tresc: 'TAJNY PLAN', data: { dokladnosc: 'nieznana' }, statusPotwierdzenia: 'do_weryfikacji', ukryjTresc: true }, () => true)
    await zapiszWaznaInformacje({ ...utworzMetadane('alergia'), kategoria: 'alergia', tresc: 'Fakt o reakcji', data: { dokladnosc: 'rok', od: '2020' }, statusPotwierdzenia: 'do_weryfikacji', ukryjTresc: false }, () => true)
    await otworzKarte()
    expect(ekran.queryByText('TAJNY PLAN')).not.toBeInTheDocument()
    zdarzenie.click(ekran.getByRole('button', { name: 'Przygotuj kartę do eksportu' }))
    expect(ekran.queryByRole('button', { name: 'Zapisz kartę HTML' })).not.toBeInTheDocument()
    expect(zapiszPlik).not.toHaveBeenCalled()
    zdarzenie.click(ekran.getByRole('checkbox', { name: 'Aktywne leki' }))
    zdarzenie.click(ekran.getByRole('button', { name: 'Otwórz podgląd eksportu' }))
    const podglad = wewnatrz(ekran.getByRole('region', { name: 'Podgląd eksportu' }))
    expect(podglad.getByText('Fakt o reakcji')).toBeInTheDocument()
    expect(podglad.queryByText(/Lek źródłowy/)).not.toBeInTheDocument()
    expect(podglad.queryByText('TAJNY PLAN')).not.toBeInTheDocument()
    expect(document.querySelector('iframe')).toBeNull()
    zdarzenie.click(podglad.getByRole('button', { name: 'Zapisz kartę HTML' }))
    await poczekaj(() => expect(zapiszPlik).toHaveBeenCalledOnce())
    const plik = zapiszPlik.mock.calls[0]?.[1] as unknown as Blob
    const html = await new Promise<string>((rozwiaz) => { const czytnik = new FileReader(); czytnik.onload = () => rozwiaz(String(czytnik.result)); czytnik.readAsText(plik) })
    expect(html).toContain('Fakt o reakcji'); expect(html).not.toContain('Lek źródłowy'); expect(html).not.toContain('TAJNY PLAN')
    zdarzenie.click(ekran.getByRole('checkbox', { name: 'Aktywne leki' }))
    expect(ekran.queryByRole('region', { name: 'Podgląd eksportu' })).not.toBeInTheDocument()
  })

  it('zamknięcie eksportu podczas przygotowania blokuje późniejszy zapis pliku', async () => {
    await otworzKarte()
    zdarzenie.click(ekran.getByRole('button', { name: 'Przygotuj kartę do eksportu' }))
    zdarzenie.click(ekran.getByRole('button', { name: 'Otwórz podgląd eksportu' }))
    let zakoncz!: (html: string) => void
    const oczekujacy = new Promise<string>((rozwiaz) => { zakoncz = rozwiaz })
    vi.spyOn(historiaZdrowia, 'wygenerujKartePoPodgladzie').mockImplementationOnce(() => oczekujacy)
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz kartę HTML' }))
    zdarzenie.click(ekran.getByRole('button', { name: /^Zamknij$/ }))
    await wykonaj(async () => { zakoncz('<html>Karta testowa</html>'); await oczekujacy })
    expect(zapiszPlik).not.toHaveBeenCalled()
    expect(ekran.queryByRole('region', { name: 'Podgląd eksportu' })).not.toBeInTheDocument()
  })

  it('brak uprawnień blokuje kartę oraz odczyt prywatnych źródeł osi', async () => {
    stan.dostep = false
    pokaz(<MemoryRouter><WazneInformacjeZdrowotne /></MemoryRouter>)
    expect(ekran.getByText('Brak uprawnienia do ważnych informacji zdrowotnych.')).toBeInTheDocument()
    expect(ekran.queryByRole('button', { name: 'Przygotuj kartę do eksportu' })).not.toBeInTheDocument()
    wyczysc(); stan.dostep = true; stan.zablokowany = 'psychoterapia'
    await baza.tabela('wpisyTerapii').put({ ...utworzMetadane('sesja'), terapiaId: 'terapia', dataCzas: '2026-10-11T10:00:00Z', tresc: 'TAJNA TREŚĆ SESJI', psychoterapia: {} })
    pokaz(<MemoryRouter><OsCzasuZdrowia /></MemoryRouter>)
    expect(await ekran.findByText('Brak wydarzeń')).toBeInTheDocument()
    expect(ekran.queryByRole('button', { name: 'Świadomie otwórz szczegóły' })).not.toBeInTheDocument()
  })
})
