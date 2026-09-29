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
    kontekstPlanowania: {
      praca: { od: '07:45', do: '16:00', polowa: '11:52:30', zrodlo: 'grafik' },
      zajetePrzedzialy: [],
      dni: [{
        data: '2026-09-07', pracuje: true, jestWyjatkiem: true,
        praca: { od: '2026-09-07T08:30:00', do: '2026-09-07T15:30:00', polowa: '2026-09-07T12:00:00', zrodlo: 'wyjatek' },
        przedPraca: { od: '2026-09-07T07:00:00', do: '2026-09-07T08:30:00' },
        poPracy: { od: '2026-09-07T15:30:00', do: '2026-09-07T22:00:00' },
        wolneOkna: [{ poczatek: '2026-09-07T16:40:00', koniec: '2026-09-07T18:00:00', minuty: 80 }],
        zajetePrzedzialy: [],
      }],
    },
    narzedzia: [
      { nazwa: 'update_task', opis: 'Zmień zadanie', rodzaj: 'zapis', ryzyko: 'niskie', schematArgumentow: {} },
      { nazwa: 'search_tasks', opis: 'Znajdź zadania', rodzaj: 'odczyt', ryzyko: 'niskie', schematArgumentow: {} },
      { nazwa: 'find_free_slots', opis: 'Znajdź wolne okna', rodzaj: 'odczyt', ryzyko: 'niskie', schematArgumentow: {} },
      { nazwa: 'list_calendar', opis: 'Sprawdź kalendarz', rodzaj: 'odczyt', ryzyko: 'niskie', schematArgumentow: {} },
    ],
    wynikiBiezacejTury: [{ wywolanieId: 'odczyt', nazwa: 'search_tasks', status: 'wykonane', dane: [{ id: 'zadanie-1', tytul: 'Spotkanie z Kubą' }] }],
  }
}

function utworzProvider(wynik: unknown) {
  const pobierz = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: { content: JSON.stringify(wynik) } })))
  return { model: new LokalnyModelProviderEcho('https://ogarniacz.test/api/echo/model', pobierz, () => 'csrf-testowy'), pobierz }
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
    expect(wyslane.messages[1].content).toContain('2026-09-07T16:40:00')
    expect(wyslane.messages[1].content).toContain('2026-09-07T12:00:00')
    expect(wyslane.messages[0].content).toContain('wyliczonej połowy pracy')
    expect(wyslane.messages[0].content).toContain('find_free_slots')
    expect(wyslane.messages[0].content).toContain('list_calendar')
    expect(wyslane.messages[0].content).toContain('Pusta lista wolnych okien')
    expect(wyslane).not.toHaveProperty('model')
    expect(pobierz).toHaveBeenCalledWith('https://ogarniacz.test/api/echo/model', expect.objectContaining({
      credentials: 'include',
      headers: expect.objectContaining({ 'X-Ogarniacz-CSRF': 'csrf-testowy' }),
    }))
  })

  it('pozwala modelowi wywołać istniejące narzędzie wolnych okien dla wybranego dnia', async () => {
    const decyzjaTerminu = {
      intencja: { ...intencja, typ: 'znajdz_wolny_termin', wartosci: [{ pole: 'data', wartosc: '2026-09-07', zrodlo: 'kontekst' }] },
      typ: 'narzedzie', tresc: '', narzedzie: 'find_free_slots',
      argumenty: JSON.stringify({ data: '2026-09-07', minuty: 30 }), kandydaci: [],
    }

    expect(await utworzProvider(decyzjaTerminu).model.odpowiedz(zadanie(), new AbortController().signal)).toMatchObject({
      typ: 'narzedzia',
      wywolania: [{ nazwa: 'find_free_slots', argumenty: { data: '2026-09-07', minuty: 30 } }],
    })
  })

  it('jawna korekta zastępuje wcześniejszą propozycję terminu w decyzji modelu', async () => {
    const dane = zadanie()
    dane.kontekstRozmowy.oczekujacaAkcja = { intencja: 'przeloz_zadanie', dane: { proponowanaGodzina: '16:40' } }
    dane.kontekstRozmowy.tury.push({ rola: 'uzytkownik', tresc: 'Nie, ustaw 17:30.', znacznikCzasu: '2026-09-06T12:05:00.000Z' })
    const poprawiona = {
      ...decyzja,
      intencja: {
        ...intencja,
        wartosci: [{ pole: 'godzina', wartosc: '17:30', zrodlo: 'wypowiedz' }],
        korekta: true,
      },
    }
    const { model, pobierz } = utworzProvider(poprawiona)

    const wynik = await model.odpowiedz(dane, new AbortController().signal)
    const wyslane = JSON.parse(String(pobierz.mock.calls[0][1]?.body))

    expect(wyslane.messages[1].content).toContain('16:40')
    expect(wyslane.messages[1].content).toContain('Nie, ustaw 17:30.')
    expect(wynik.aktualizacjaKontekstu?.intencjaSemantyczna?.wartosci).toEqual([
      { pole: 'godzina', wartosc: '17:30', zrodlo: 'wypowiedz' },
    ])
  })

  it('zwraca uporządkowany plan kilku istniejących narzędzi z zależnościami', async () => {
    const { model } = utworzProvider({
      ...decyzja,
      kroki: [
        { id: 'k1', narzedzie: 'search_tasks', argumenty: '{}', zaleznosci: [] },
        { id: 'k2', narzedzie: 'update_task', argumenty: decyzja.argumenty, zaleznosci: ['k1'] },
      ],
    })
    expect(await model.odpowiedz(zadanie(), new AbortController().signal)).toMatchObject({
      typ: 'narzedzia',
      wywolania: [
        { id: 'k1', nazwa: 'search_tasks', zaleznosci: [] },
        { id: 'k2', nazwa: 'update_task', zaleznosci: ['k1'] },
      ],
    })
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

  it('odrzuca odpowiedź niezgodną ze schematem i nie przełącza po cichu wykonawcy', async () => {
    expect(await utworzProvider({ typ: 'narzedzie' }).model.odpowiedz(zadanie(), new AbortController().signal)).toMatchObject({ typ: 'odpowiedz', tresc: expect.stringContaining('niepoprawną odpowiedź') })
  })

  it('odrzuca niepoprawny JSON backendu kontrolowanym komunikatem', async () => {
    const pobierz = vi.fn<typeof fetch>().mockResolvedValue(new Response('{nie-json'))
    const model = new LokalnyModelProviderEcho('https://ogarniacz.test/api/echo/model', pobierz)
    expect(await model.odpowiedz(zadanie(), new AbortController().signal)).toMatchObject({
      typ: 'odpowiedz',
      tresc: expect.stringContaining('niepoprawną odpowiedź'),
    })
  })

  it('zwraca kontrolowany komunikat, gdy backend modelu jest niedostępny', async () => {
    const pobierz = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }))
    const model = new LokalnyModelProviderEcho('https://ogarniacz.test/api/echo/model', pobierz)
    expect(await model.odpowiedz(zadanie(), new AbortController().signal)).toMatchObject({
      typ: 'odpowiedz',
      tresc: expect.stringContaining('nie jest teraz dostępny'),
    })
  })

  it('anulowana prośba nie uruchamia modelu', async () => {
    const { model, pobierz } = utworzProvider(decyzja)
    await expect(model.odpowiedz(zadanie(), AbortSignal.abort())).rejects.toThrow()
    expect(pobierz).not.toHaveBeenCalled()
  })
})
