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
afterEach(() => { cleanup(); baza.close() })

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
