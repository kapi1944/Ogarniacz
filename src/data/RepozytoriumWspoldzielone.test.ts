import { describe, expect, it, vi } from 'vitest'
import { baza } from './BazaOgarniacza'
import { pobierzRepozytorium, pobierzRepozytoriumWspoldzielone } from './Repozytorium'
import { utworzMetadane } from '../domain/fabryki'

const notatka = (id: string) => ({ ...utworzMetadane(id), tytul: id, tresc: '', tagi: [] }) as never

describe('współdzielone odczyty list', () => {
  it('równoległe wywołania czytają tabelę raz, a każdy odbiorca dostaje własną tablicę', async () => {
    const odczyt = vi.spyOn(baza.tabela('notatki'), 'toArray')
    const repozytorium = pobierzRepozytoriumWspoldzielone('notatki')
    await pobierzRepozytorium('notatki').zapiszWiele([notatka('a'), notatka('b')])
    odczyt.mockClear()
    const [pierwsza, druga] = await Promise.all([repozytorium.lista(), repozytorium.lista()])
    expect(odczyt).toHaveBeenCalledTimes(1)
    expect(pierwsza).not.toBe(druga)
    pierwsza.pop()
    expect(druga).toHaveLength(2)
    odczyt.mockRestore()
  })

  it('po zapisie kolejny odczyt widzi nowe dane', async () => {
    const repozytorium = pobierzRepozytoriumWspoldzielone('notatki')
    const przed = (await repozytorium.lista()).length
    await repozytorium.zapisz(notatka('nowa'))
    expect((await repozytorium.lista()).length).toBe(przed + 1)
  })
})
