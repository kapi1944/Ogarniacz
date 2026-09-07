import { describe, expect, it, vi } from 'vitest'
import { LokalnyModelProviderEcho } from './LokalnyModelProviderEcho'
import { KontekstRozmowyEcho } from './KontekstRozmowyEcho'
import type { ZadanieModeluEcho } from './typyEcho'

const intencja = { typ: 'przeloz_zadanie', pewnosc: 0.95, wartosci: [{ pole: 'data', wartosc: '2026-09-11', zrodlo: 'wypowiedz' }], encje: [], brakujacePola: [], konflikty: [], korekta: true }
const decyzja = { intencja, typ: 'narzedzie', tresc: '', narzedzie: 'update_task', argumenty: JSON.stringify({ id: 'zadanie-1', zmiany: { termin: '2026-09-11' } }), kandydaci: [] }

function zadanie(): ZadanieModeluEcho {
  const kontekst = new KontekstRozmowyEcho()
  kontekst.dodajTure('uzytkownik', 'Przełóż spotkanie z Kubą na jutro.')
  kontekst.dodajTure('echo', 'Spotkanie zostało przełożone.')
  kontekst.dodajTure('uzytkownik', 'Nie, yy jednak na piątek.')
  return {
    instrukcjeSystemowe: [], trybRozmowy: 'szybki', kontekstCzasu: { teraz: '2026-09-06T12:00:00Z', dataLokalna: '2026-09-06', strefaCzasowa: 'Europe/Warsaw' },
    kontekstRozmowy: kontekst.migawka(), pamiecPreferencji: [],
    narzedzia: [
      { nazwa: 'update_task', opis: 'Zmień zadanie', rodzaj: 'zapis', ryzyko: 'niskie', schematArgumentow: {} },
      { nazwa: 'search_tasks', opis: 'Znajdź zadania', rodzaj: 'odczyt', ryzyko: 'niskie', schematArgumentow: {} },
    ],
    wynikiBiezacejTury: [{ wywolanieId: 'odczyt', nazwa: 'search_tasks', status: 'wykonane', dane: [{ id: 'zadanie-1', tytul: 'Spotkanie z Kubą' }] }],
  }
}

function utworzProvider(wynik: unknown) {
  const pobierz = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: { content: JSON.stringify(wynik) } })))
  return { model: new LokalnyModelProviderEcho('http://localhost:11434/api/chat', 'model-testowy', pobierz), pobierz }
}

describe('Lokalny model Echo — kontrakt i granica danych', () => {
  it('przekazuje potoczną wypowiedź, historię, schemat i aktualne dane do lokalnego modelu', async () => {
    const { model, pobierz } = utworzProvider(decyzja)
    const wynik = await model.odpowiedz(zadanie(), new AbortController().signal)
    expect(wynik.typ).toBe('narzedzia')
    expect(wynik.aktualizacjaKontekstu?.intencjaSemantyczna?.korekta).toBe(true)
    const wyslane = JSON.parse(String(pobierz.mock.calls[0][1]?.body))
    expect(wyslane.format.type).toBe('object')
    expect(wyslane.messages[1].content).toContain('Nie, yy jednak na piątek.')
    expect(wyslane.messages[1].content).toContain('zadanie-1')
    expect(wyslane.stream).toBe(false)
  })

  it.each([
    { ...intencja, pewnosc: 0.4 },
    { ...intencja, brakujacePola: ['godzina'] },
    { ...intencja, konflikty: ['Dwa terminy'] },
    { ...intencja, wartosci: [{ pole: 'godzina', wartosc: '08:00', zrodlo: 'propozycja' }] },
  ])('nie zapisuje niepewnej, niepełnej ani proponowanej intencji', async (niepelna) => {
    const { model } = utworzProvider({ ...decyzja, intencja: niepelna })
    expect((await model.odpowiedz(zadanie(), new AbortController().signal)).typ).toBe('pytanie')
  })

  it('nie uznaje historii za aktualny odczyt przed zmianą', async () => {
    const dane = zadanie()
    dane.kontekstRozmowy.ostatnieWynikiNarzedzi = dane.wynikiBiezacejTury!
    dane.wynikiBiezacejTury = []
    expect((await utworzProvider(decyzja).model.odpowiedz(dane, new AbortController().signal)).typ).toBe('pytanie')
  })

  it('odrzuca wymyślony identyfikator', async () => {
    const { model } = utworzProvider({ ...decyzja, argumenty: '{"id":"fikcyjny"}' })
    expect((await model.odpowiedz(zadanie(), new AbortController().signal)).typ).toBe('pytanie')
  })

  it('proponuje potwierdzenie faworyta i nie wykonuje zmiany', async () => {
    const { model } = utworzProvider({ ...decyzja, kandydaci: [{ id: 'zadanie-1', etykieta: 'Spotkanie z Kubą', pewnosc: 0.95 }] })
    expect(await model.odpowiedz(zadanie(), new AbortController().signal)).toMatchObject({ typ: 'pytanie', tresc: 'Chodzi Ci o „Spotkanie z Kubą”?' })
  })

  it('pokazuje numerowane wyniki bez samodzielnego wyboru', async () => {
    const dane = zadanie()
    dane.wynikiBiezacejTury![0].dane = [{ id: '1' }, { id: '2' }, { id: '3' }]
    const { model } = utworzProvider({ ...decyzja, kandydaci: [1, 2, 3].map((numer) => ({ id: String(numer), etykieta: `Spotkanie ${numer}`, pewnosc: 0.6 })) })
    const wynik = await model.odpowiedz(dane, new AbortController().signal)
    expect(wynik).toMatchObject({ typ: 'pytanie' })
    if (wynik.typ === 'pytanie') expect(wynik.tresc).toContain('3. Spotkanie 3')
  })

  it('odrzuca niepoprawny JSON i nie przełącza po cichu wykonawcy', async () => {
    expect(await utworzProvider({ typ: 'narzedzie' }).model.odpowiedz(zadanie(), new AbortController().signal)).toMatchObject({ typ: 'odpowiedz', tresc: expect.stringContaining('niepoprawną odpowiedź') })
  })

  it('anulowana prośba nie uruchamia modelu', async () => {
    const { model, pobierz } = utworzProvider(decyzja)
    await expect(model.odpowiedz(zadanie(), AbortSignal.abort())).rejects.toThrow()
    expect(pobierz).not.toHaveBeenCalled()
  })
})
