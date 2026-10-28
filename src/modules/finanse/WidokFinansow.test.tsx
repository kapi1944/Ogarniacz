import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { baza, inicjalizujBaze } from '../../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { dzisiajIso, utworzMetadane } from '../../domain/fabryki'
import { WidokFinansow } from './WidokFinansow'
import { przygotujBackupDoPrzywracania, przywrocBackup, utworzBackup } from '../../services/BackupService'
import { EdytorPolaRejestru, skonwertujWartoscPolaWlasnego, wartoscFormularzaPola } from '../../components/EdytorPolaRejestru'
import { useState } from 'react'
import type { DefinicjaPolaRejestru } from '../../domain/rejestr'

beforeEach(async () => { baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze() })
afterEach(async () => { cleanup(); await baza.transaction('rw', baza.tables, async () => {}); baza.close() })

it('zapisuje offline kwotę i walutę, ponownie je odczytuje i pokazuje rozdzielone podsumowania', async () => {
  const repozytorium = pobierzRepozytorium('wydatki')
  await repozytorium.zapisz({ ...utworzMetadane('stara'), opis: 'Historyczne PLN', kwota: 100, data: dzisiajIso(), kategoria: 'Dom' })
  const { unmount } = render(<WidokFinansow />)
  await screen.findByText('Historyczne PLN')
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj transakcję' }))
  const modal = within(screen.getByRole('dialog'))
  fireEvent.change(modal.getByLabelText(/^Opis/), { target: { value: 'Zakup EUR' } })
  fireEvent.change(modal.getByRole('textbox', { name: /^Kwota/ }), { target: { value: '125,50' } })
  fireEvent.change(modal.getByLabelText('Waluta: Kwota'), { target: { value: 'EUR' } })
  fireEvent.change(modal.getByLabelText(/^Data/), { target: { value: dzisiajIso().split('-').reverse().join('.') } })
  fireEvent.change(modal.getByLabelText(/^Kategoria/), { target: { value: 'Dom' } })
  fireEvent.click(modal.getByRole('button', { name: 'Zapisz' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  const zapisane = (await repozytorium.lista()).find((rekord) => rekord.opis === 'Zakup EUR')!
  expect(zapisane).toMatchObject({ kwota: 125.5, waluta: 'EUR' })
  expect((await repozytorium.pobierz('stara'))?.waluta).toBeUndefined()
  expect(screen.getByText('Bilans okresu').parentElement?.textContent).toContain('-100,00')
  expect(screen.getByText('Transakcje EUR').parentElement?.textContent).toContain('125,50')
  unmount()
  render(<WidokFinansow />)
  const wiersz = (await screen.findByText('Zakup EUR')).closest('article')!
  fireEvent.click(within(wiersz).getByTitle('Edytuj'))
  expect(screen.getByRole('textbox', { name: /^Kwota/ })).toHaveProperty('value', '125.5')
  expect(screen.getByLabelText('Waluta: Kwota')).toHaveProperty('value', 'EUR')
  fireEvent.change(screen.getByLabelText('Waluta: Kwota'), { target: { value: 'USD' } })
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))
  await waitFor(async () => expect(await repozytorium.pobierz(zapisane.id)).toMatchObject({ kwota: 125.5, waluta: 'USD' }))
  const backup = await przygotujBackupDoPrzywracania(JSON.stringify(await utworzBackup(['finanse'])))
  expect(backup.payload.finanse?.wydatki).toEqual(expect.arrayContaining([expect.objectContaining({ id: zapisane.id, kwota: 125.5, waluta: 'USD' })]))
})

it('czyta stare własne kwoty i zachowuje dokładny obiekt kwoty z walutą przez zapis i backup', async () => {
  const definicja: DefinicjaPolaRejestru = { id: 'custom:cena', zrodlo: 'wlasne', etykieta: 'Cena', typ: 'kwota' }
  const encja = { ...utworzMetadane(), opis: 'Własne', kwota: 1, data: dzisiajIso(), kategoria: 'Dom', polaWlasne: { 'custom:cena': 125.5 } }
  function Formularz() {
    const [wartosc, zmien] = useState(wartoscFormularzaPola(encja, { definicja }))
    return <form onSubmit={(zdarzenie) => { zdarzenie.preventDefault(); void pobierzRepozytorium('wydatki').zapisz({ ...encja, polaWlasne: { 'custom:cena': skonwertujWartoscPolaWlasnego(definicja, wartosc) } }) }}>
      <EdytorPolaRejestru pole={{ definicja }} wartosc={wartosc} zmien={zmien} /><button>Zapisz</button>
    </form>
  }
  render(<Formularz />)
  expect(screen.getByLabelText('Cena')).toHaveProperty('value', '125.5')
  expect(screen.getByLabelText('Waluta: Cena')).toHaveProperty('value', 'PLN')
  fireEvent.change(screen.getByLabelText('Cena'), { target: { value: '9007199254740993,01' } })
  fireEvent.change(screen.getByLabelText('Waluta: Cena'), { target: { value: 'EUR' } })
  fireEvent.click(screen.getByText('Zapisz'))
  const oczekiwana = { kwota: '9007199254740993.01', waluta: 'EUR' }
  await waitFor(async () => expect((await pobierzRepozytorium('wydatki').pobierz(encja.id))?.polaWlasne?.['custom:cena']).toEqual(oczekiwana))
  const odczytana = await pobierzRepozytorium('wydatki').pobierz(encja.id)
  expect(wartoscFormularzaPola(odczytana, { definicja })).toBe(JSON.stringify(oczekiwana))
  expect(wartoscFormularzaPola(odczytana, { definicja }, true)).toBe('9007199254740993,01 EUR')
  const backup = await przygotujBackupDoPrzywracania(JSON.stringify(await utworzBackup(['finanse'])))
  expect(backup.payload.finanse?.wydatki[0].polaWlasne).toEqual({ 'custom:cena': oczekiwana })
  cleanup()
  await baza.tabela('wydatki').delete(encja.id)
  await przywrocBackup(backup)
  expect((await pobierzRepozytorium('wydatki').pobierz(encja.id))?.polaWlasne?.['custom:cena']).toEqual(oczekiwana)
})

it('tworzy raty z polskiej kwoty i daty oraz zachowuje obliczenia po nadpłacie', async () => {
  render(<WidokFinansow />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Dodaj zakup na raty' })[0])
  let formularz = within(screen.getByRole('dialog'))
  fireEvent.change(formularz.getByLabelText(/Opis zakupu/), { target: { value: 'Pralka' } })
  fireEvent.change(formularz.getByLabelText(/Kwota końcowa/), { target: { value: '1200,00' } })
  fireEvent.change(formularz.getByLabelText(/Liczba rat/), { target: { value: '3,5' } })
  expect(formularz.getByLabelText(/Liczba rat/)).toBeInvalid()
  fireEvent.change(formularz.getByLabelText(/Liczba rat/), { target: { value: '3' } })
  fireEvent.change(formularz.getByRole('textbox', { name: /Pierwsza rata/ }), { target: { value: '28.10.2026' } })
  fireEvent.change(formularz.getByRole('combobox', { name: /^Kategoria/ }), { target: { value: 'Dom' } })
  for (const pole of screen.getByRole('dialog').querySelectorAll('input')) expect(pole.validationMessage, pole.outerHTML).toBe('')
  fireEvent.click(formularz.getByRole('button', { name: 'Utwórz raty' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  const plan = (await pobierzRepozytorium('planyRat').lista())[0]
  expect(plan).toMatchObject({ kwotaCalkowita: 1200, liczbaRat: 3, dataPierwszejRaty: '2026-10-28' })
  fireEvent.click(screen.getByRole('button', { name: 'Raty' }))
  fireEvent.click(screen.getAllByTitle('Edytuj ratę')[0])
  formularz = within(screen.getByRole('heading', { name: 'Edytuj ratę 1' }).closest('[role=dialog]')!)
  expect(formularz.getByLabelText('Wysokość raty *')).toHaveValue('400')
  fireEvent.change(formularz.getByLabelText('Nadpłata *'), { target: { value: '100,00' } })
  fireEvent.click(formularz.getByLabelText('Rata opłacona'))
  fireEvent.click(formularz.getByRole('button', { name: 'Zapisz ratę' }))
  await waitFor(async () => expect((await pobierzRepozytorium('wydatki').lista())[0]?.kwota).toBe(500))
  const raty = (await pobierzRepozytorium('raty').lista()).sort((a, b) => a.numer - b.numer)
  expect(raty.map((rata) => rata.kwota)).toEqual([400, 350, 350])
})

it.each([['Dodaj płatność stałą', 'Kwota'], ['Dodaj budżet', 'Limit']])('używa kwoty PLN w formularzu %s', async (przycisk, etykieta) => {
  await pobierzRepozytorium('wydatki').zapisz({ ...utworzMetadane(), opis: 'Wpis kontrolny', kwota: 10, data: dzisiajIso(), kategoria: 'Dom' })
  render(<WidokFinansow />)
  await screen.findByText('Wpis kontrolny')
  fireEvent.click(screen.getAllByRole('button', { name: przycisk })[0])
  const pole = within(screen.getByRole('dialog')).getByRole('textbox', { name: new RegExp(etykieta) })
  fireEvent.change(pole, { target: { value: '125,50' } })
  expect(pole).toHaveValue('125,50')
  expect(pole).toBeValid()
  fireEvent.change(pole, { target: { value: '-1' } })
  expect(pole).toBeInvalid()
  expect(screen.queryByLabelText(`Waluta: ${etykieta}`)).toBeNull()
})
