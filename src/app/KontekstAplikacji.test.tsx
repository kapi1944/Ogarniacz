import { StrictMode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DostawcaAplikacji, useAplikacja } from './KontekstAplikacji'
import { DOMYSLNE_USTAWIENIA } from '../domain/ustawienia'
import type { Ustawienia } from '../domain/typy'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { czyBiezacyDostep, ustawBiezacyDostep } from '../services/UprawnieniaService'

const stan = vi.hoisted(() => ({ ustawienia: undefined as Ustawienia | undefined }))
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => stan.ustawienia }))
vi.mock('../hooks/useRepozytorium', () => ({ useRepozytorium: () => ({ dane: [] }) }))
vi.mock('./DostawcaKonta', () => ({ useKonto: () => ({ konto: undefined }) }))
vi.mock('./SilnikPrzypomnien', () => ({ SilnikPrzypomnien: () => null }))
vi.mock('./SzybkieDodawanie', () => ({ SzybkieDodawanie: () => null }))
vi.mock('./WyszukiwanieGlobalne', () => ({ WyszukiwanieGlobalne: () => null }))
vi.mock('../platform/platforma', () => ({ platforma: { udostepnianie: { nasluchujOdebrania: async () => () => undefined } } }))

function ProbaDostepu() {
  const { moze } = useAplikacja()
  return <span>{String(moze('zdrowie', 'edycja', 'psychoterapia'))}</span>
}

describe('Inicjalizacja kontroli dostępu', () => {
  beforeEach(() => {
    stan.ustawienia = undefined
    ustawBiezacyDostep(undefined)
    localStorage.clear()
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  })
  afterEach(() => { cleanup(); ustawBiezacyDostep(undefined); vi.unstubAllGlobals() })

  it('czeka na lokalne ustawienia, działa po ich odczycie także w StrictMode i blokuje po wyłączeniu kontekstu', () => {
    expect(czyBiezacyDostep('zdrowie', 'edycja', 'psychoterapia')).toBe(false)
    const widok = render(<StrictMode><DostawcaAplikacji><ProbaDostepu /></DostawcaAplikacji></StrictMode>)
    expect(screen.getByText('false')).toBeInTheDocument()
    expect(czyBiezacyDostep('zdrowie', 'edycja', 'psychoterapia')).toBe(false)
    stan.ustawienia = DOMYSLNE_USTAWIENIA
    widok.rerender(<StrictMode><DostawcaAplikacji><ProbaDostepu /></DostawcaAplikacji></StrictMode>)
    expect(screen.getByText('true')).toBeInTheDocument()
    expect(czyBiezacyDostep('zdrowie', 'edycja', 'psychoterapia')).toBe(true)
    widok.unmount()
    expect(czyBiezacyDostep('zdrowie', 'edycja', 'psychoterapia')).toBe(false)
  })

  it('nie zastępuje zapisanego trybu Edytora domyślnym właścicielem podczas uruchomienia', () => {
    const widok = render(<DostawcaAplikacji><ProbaDostepu /></DostawcaAplikacji>)
    expect(czyBiezacyDostep('zdrowie', 'edycja', 'psychoterapia')).toBe(false)
    stan.ustawienia = { ...DOMYSLNE_USTAWIENIA, trybUzytkownika: 'edytor', aktywnyEdytorId: 'edytor' }
    widok.rerender(<DostawcaAplikacji><ProbaDostepu /></DostawcaAplikacji>)
    expect(screen.getByText('false')).toBeInTheDocument()
    expect(czyBiezacyDostep('zdrowie', 'edycja', 'psychoterapia')).toBe(false)
  })

  it('szeregowane zapisy ustawień scalają zmiany zamiast nadpisywać poprzednią', async () => {
    stan.ustawienia = DOMYSLNE_USTAWIENIA
    const zapis = vi.spyOn(repozytoriumUstawien, 'zapisz')
    let kontekst!: ReturnType<typeof useAplikacja>
    function Pobierz() { kontekst = useAplikacja(); return null }
    render(<DostawcaAplikacji><Pobierz /></DostawcaAplikacji>)
    await act(async () => {
      await Promise.all([
        kontekst.zapiszUstawienia({ wyglad: { ...DOMYSLNE_USTAWIENIA.wyglad, motyw: 'ciemny' } }),
        kontekst.zapiszUstawienia({ nawigacja: { ...DOMYSLNE_USTAWIENIA.nawigacja, menuDomyslnieZwiniete: true } }),
      ])
    })
    const ostatnie = zapis.mock.calls.at(-1)![0] as Ustawienia
    expect(ostatnie.wyglad.motyw).toBe('ciemny')
    expect(ostatnie.nawigacja.menuDomyslnieZwiniete).toBe(true)
    zapis.mockRestore()
  })
})
