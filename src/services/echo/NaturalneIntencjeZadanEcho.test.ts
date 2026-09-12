import { describe, expect, it } from 'vitest'
import { KontekstRozmowyEcho } from './KontekstRozmowyEcho'
import { LokalnySemantycznyProviderEcho } from './LokalnySemantycznyProviderEcho'
import type { DecyzjaModeluEcho, ZadanieModeluEcho } from './typyEcho'

const czas = {
  teraz: '2026-09-11T08:00:00.000Z',
  dataLokalna: '2026-09-11',
  strefaCzasowa: 'Europe/Warsaw',
}

function przygotujZadanie(kontekst: KontekstRozmowyEcho): ZadanieModeluEcho {
  return {
    instrukcjeSystemowe: [],
    trybRozmowy: 'szybki',
    kontekstCzasu: czas,
    kontekstRozmowy: kontekst.migawka(),
    pamiecPreferencji: [],
    narzedzia: [],
  }
}

function oczekujListyZadan(decyzja: DecyzjaModeluEcho, data: string): void {
  expect(decyzja.typ).toBe('narzedzia')
  if (decyzja.typ !== 'narzedzia') return
  expect(decyzja.wywolania).toHaveLength(1)
  expect(decyzja.wywolania[0]).toMatchObject({
    nazwa: 'list_tasks',
    argumenty: { status: 'otwarte', terminOd: data, terminDo: data },
  })
}

describe('naturalne intencje odczytu zadań Echo', () => {
  it.each([
    'Co mam dzisiaj?',
    'Co mam dziś?',
    'Mam jakieś zadania na dzisiaj?',
    'Jakie zadania mam dzisiaj?',
    'Jakie zadania dzisiaj?',
    'Pokaż zadania na dzisiaj',
    'Pokaż dzisiejsze zadania',
    'Czy mam coś na dziś?',
    'Co jest do zrobienia dzisiaj?',
  ])('rozpoznaje dzisiejszy odczyt: %s', async (wypowiedz) => {
    const kontekst = new KontekstRozmowyEcho()
    kontekst.dodajTure('uzytkownik', wypowiedz)

    const decyzja = await new LokalnySemantycznyProviderEcho().odpowiedz(
      przygotujZadanie(kontekst),
      new AbortController().signal,
    )

    oczekujListyZadan(decyzja, '2026-09-11')
  })

  it.each([
    'Co mam jutro?',
    'Mam jakieś zadania na jutro?',
    'Jakie zadania mam jutro?',
    'Jakie zadania jutro?',
    'Pokaż zadania na jutro',
    'Pokaż jutrzejsze zadania',
    'Czy mam coś na jutro?',
    'Co jest do zrobienia jutro?',
  ])('rozpoznaje jutrzejszy odczyt: %s', async (wypowiedz) => {
    const kontekst = new KontekstRozmowyEcho()
    kontekst.dodajTure('uzytkownik', wypowiedz)

    const decyzja = await new LokalnySemantycznyProviderEcho().odpowiedz(
      przygotujZadanie(kontekst),
      new AbortController().signal,
    )

    oczekujListyZadan(decyzja, '2026-09-12')
  })

  it('utrzymuje temat zadań w krótkim pytaniu A na jutro', async () => {
    const provider = new LokalnySemantycznyProviderEcho()
    const kontekst = new KontekstRozmowyEcho()
    kontekst.dodajTure('uzytkownik', 'Pokaż zadania na dzisiaj')
    const pierwsza = await provider.odpowiedz(przygotujZadanie(kontekst), new AbortController().signal)
    kontekst.zastosujAktualizacje(pierwsza.aktualizacjaKontekstu)
    kontekst.dodajTure('echo', 'Dzisiaj masz dwa zadania.')
    kontekst.dodajTure('uzytkownik', 'A na jutro?')

    const druga = await provider.odpowiedz(przygotujZadanie(kontekst), new AbortController().signal)

    oczekujListyZadan(druga, '2026-09-12')
  })
})
