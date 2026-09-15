import { describe, expect, it, vi } from 'vitest'
import type { Repozytorium } from '../data/Repozytorium'
import { utworzMetadane } from '../domain/fabryki'
import type { PlatnoscStala, Wydatek } from '../domain/typy'
import { zaksiegujPlatnoscStalaPrzezRejestr } from './RejestrPolSystemowychFinansow'

describe('akcja domenowa Rejestru dla finansów', () => {
  it('przez actionId deleguje księgowanie do publicznego FinanseService', async () => {
    const repozytoriumWydatkow = { zapisz: vi.fn().mockResolvedValue('wydatek-1') } as unknown as Repozytorium<Wydatek>
    const platnosc: PlatnoscStala = {
      ...utworzMetadane('sub-1'),
      nazwa: 'Muzyka',
      kwota: 25,
      dzienMiesiaca: 10,
      dataStartu: '2026-01-01',
      kategoria: 'Rozrywka',
      aktywna: true,
      rodzaj: 'subskrypcja',
    }

    await zaksiegujPlatnoscStalaPrzezRejestr(platnosc, '2026-02', repozytoriumWydatkow)

    expect(repozytoriumWydatkow.zapisz).toHaveBeenCalledWith(expect.objectContaining({
      opis: 'Muzyka', kwota: 25, data: '2026-02-10', kategoria: 'Rozrywka', platnoscStalaId: 'sub-1',
    }))
  })
})
