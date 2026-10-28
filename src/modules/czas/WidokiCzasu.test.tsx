import Dexie from 'dexie'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from '../../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { WidokGrafiku } from './WidokiCzasu'

beforeEach(async () => { baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze() })
afterEach(() => { cleanup(); baza.close() })

it('zapisuje offline urlop i wyjątek z ręcznie wpisanych dat i godzin', async () => {
  render(<WidokGrafiku />)
  const urlop = within(screen.getByRole('heading', { name: 'Dodaj urlop / dzień wolny' }).closest('section')!)
  fireEvent.change(urlop.getByRole('textbox', { name: /^Od/ }), { target: { value: '10.11.2026' } })
  fireEvent.change(urlop.getByRole('textbox', { name: /^Do/ }), { target: { value: '09.11.2026' } })
  expect(urlop.getByRole('textbox', { name: /^Do/ })).toBeInvalid()
  fireEvent.change(urlop.getByRole('textbox', { name: /^Do/ }), { target: { value: '12.11.2026' } })
  fireEvent.click(urlop.getByRole('button', { name: 'Dodaj urlop' }))
  await waitFor(async () => expect(await pobierzRepozytorium('urlopy').lista()).toEqual([expect.objectContaining({ dataOd: '2026-11-10', dataDo: '2026-11-12' })]))
  const wyjatek = within(screen.getByRole('heading', { name: 'Dodaj wyjątek' }).closest('section')!)
  fireEvent.change(wyjatek.getByRole('textbox', { name: /^Data/ }), { target: { value: '13.11.2026' } })
  fireEvent.change(wyjatek.getByLabelText('Od', { exact: true }), { target: { value: '09:30' } })
  fireEvent.change(wyjatek.getByLabelText('Do', { exact: true }), { target: { value: '14:15' } })
  fireEvent.click(wyjatek.getByRole('button', { name: 'Dodaj wyjątek' }))
  await waitFor(async () => expect(await pobierzRepozytorium('wyjatkiGrafiku').lista()).toEqual([expect.objectContaining({ data: '2026-11-13', od: '09:30', do: '14:15' })]))
})
