import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../../data/BazaOgarniacza'
import { utworzMetadane } from '../../domain/fabryki'
import type { Lek } from '../../domain/typy'
import { generujDawkiDnia, stanApteczki, zapiszLekZDodanymZapasem } from '../LekiService'
import { AgentEcho } from './AgentEcho'
import { utworzDomyslnyRejestrNarzedziEcho, WykonawcaNarzedziEcho } from './NarzedziaEcho'
import type { DecyzjaModeluEcho, WywolanieNarzedziaEcho } from './typyEcho'

beforeEach(async () => {
  await inicjalizujBaze()
  for (const nazwa of ['leki', 'dziennikLekow', 'kolejkaSynchronizacji', 'dziennikEcho'] as const) await baza.tabela(nazwa).clear()
})

async function przygotuj(zapas = 5, dwieDawki = false) {
  const lek: Lek = { ...utworzMetadane('lek-echo'), nazwa: 'Lek testowy', dawkaInstrukcja: 'Instrukcja źródłowa', godziny: ['08:00'], dawki: [{ id: 'rano', godzina: '08:00', ilosc: 2 }, ...(dwieDawki ? [{ id: 'druga', godzina: '08:00', ilosc: 1 }] : [])], jednostka: 'szt.', aktywny: true }
  await zapiszLekZDodanymZapasem(lek, zapas)
  const dawka = generujDawkiDnia([lek], [], '2026-08-14').find((element) => element.dawka.id === 'rano')!
  const wywolanie: WywolanieNarzedziaEcho = { id: 'przyjecie', nazwa: 'mark_medication_dose', argumenty: { lekId: lek.id, data: dawka.data, idWystapienia: dawka.idWystapienia, status: 'zazyte' } }
  const rejestr = utworzDomyslnyRejestrNarzedziEcho()
  const wykonawca = new WykonawcaNarzedziEcho(rejestr, undefined, async () => undefined)
  return { lek, dawka, wywolanie, rejestr, wykonawca }
}

async function zapasLeku() { return stanApteczki((await baza.tabela('leki').get('lek-echo'))!) }

function utworzAgenta(wywolania: WywolanieNarzedziaEcho[], rejestr: ReturnType<typeof utworzDomyslnyRejestrNarzedziEcho>, wykonawca: WykonawcaNarzedziEcho) {
  const decyzje: DecyzjaModeluEcho[] = [{ typ: 'narzedzia', wywolania }, { typ: 'odpowiedz', tresc: 'Zakończono plan.' }]
  const provider = { nazwa: 'testowy', tryb: 'pelny_agent' as const, odpowiedz: vi.fn(async () => decyzje.shift()!) }
  return { agent: new AgentEcho({ provider, rejestr, wykonawca, pobierzKontekstPlanowania: async () => ({ zajetePrzedzialy: [] }) }), provider }
}

describe('transakcyjne dawki przez Echo', () => {
  it('bez potwierdzenia nic nie zapisuje, także przy liberalnej polityce i podrobionym opisie modelu', async () => {
    const { wywolanie, rejestr } = await przygotuj()
    const wykonawca = new WykonawcaNarzedziEcho(rejestr, { ocen: () => ({ dozwolone: true }) }, async () => undefined)
    const { agent } = utworzAgenta([{ ...wywolanie, opisPotwierdzenia: 'To tylko odczyt' }], rejestr, wykonawca)
    const odpowiedz = await agent.obsluz('Przyjąłem lek')
    expect(odpowiedz.wymagaPotwierdzenia).toBe(true)
    expect(odpowiedz.tekst).toContain('Lek testowy')
    expect(odpowiedz.tekst).toContain('2026-08-14 08:00')
    expect(odpowiedz.tekst).not.toContain('To tylko odczyt')
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
    expect(await zapasLeku()).toBe(5)
    agent.anulujPotwierdzenie()
    await agent.potwierdz(odpowiedz.akcjaDoPotwierdzenia!)
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
  })

  it('po świadomym potwierdzeniu zapisuje ilość, czas i outbox oraz podaje rzeczywisty wynik', async () => {
    const { wywolanie, rejestr, wykonawca, lek } = await przygotuj()
    wywolanie.argumenty = { ...wywolanie.argumenty as object, przyjetoAt: '2026-08-14T07:15:00Z', przyjetaIlosc: 1.5, przyjetaJednostka: 'szt.' }
    wywolanie.odpowiedzPoWykonaniu = 'Model wymyślił zakup zapasu'
    const { agent, provider } = utworzAgenta([wywolanie], rejestr, wykonawca)
    const propozycja = await agent.obsluz('Zapisz przyjęcie')
    const wynik = await agent.potwierdz(propozycja.akcjaDoPotwierdzenia!)
    expect(wynik.tekst).toContain('Zapisano przyjęcie')
    expect(wynik.tekst).not.toContain('zakup')
    expect(provider.odpowiedz).toHaveBeenCalledTimes(1)
    expect(await zapasLeku()).toBe(3.5)
    expect(await baza.tabela('dziennikLekow').toArray()).toMatchObject([{ status: 'zazyte', przyjetaIlosc: 1.5, przyjetoAt: '2026-08-14T07:15:00.000Z' }])
    expect(await baza.tabela('kolejkaSynchronizacji').toArray()).toEqual(expect.arrayContaining([expect.objectContaining({ tabela: 'leki', rekord: expect.objectContaining({ zapasJednostek: 3.5 }) }), expect.objectContaining({ tabela: 'dziennikLekow', rekord: expect.objectContaining({ status: 'zazyte' }) })]))
    expect((await baza.tabela('leki').get(lek.id))?.dawki).toEqual(lek.dawki)
    expect((await baza.tabela('leki').get(lek.id))?.dawkaInstrukcja).toBe(lek.dawkaInstrukcja)
  })

  it('nie wybiera pierwszej z dwóch dawek o tej samej godzinie; wymaga konkretnego ID', async () => {
    const { wywolanie, wykonawca } = await przygotuj(5, true)
    const niejasne = { ...wywolanie, argumenty: { lekId: 'lek-echo', data: '2026-08-14', godzina: '08:00', status: 'zazyte' } }
    for (const potwierdzone of [false, true]) {
      const wynik = await wykonawca.wykonaj(niejasne, potwierdzone)
      expect(wynik.status).toBe('zablokowane')
      expect(wynik.komunikat).toContain('Doprecyzuj')
    }
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
    expect((await wykonawca.wykonaj(wywolanie)).komunikat).toContain('wystąpienie 2 z 2')
    expect((await wykonawca.wykonaj(wywolanie, true)).status).toBe('wykonane')
    expect(await zapasLeku()).toBe(3)
    expect(await baza.tabela('dziennikLekow').count()).toBe(1)
  })

  it('ponowne polecenie i równoległe potwierdzenie nie zużywają zapasu ponownie', async () => {
    const { wywolanie, wykonawca } = await przygotuj()
    await wykonawca.wykonaj(wywolanie, true)
    await Promise.all([wykonawca.wykonaj(wywolanie, true), wykonawca.wykonaj({ ...wywolanie, id: 'nowe-polecenie' }, true)])
    expect(await zapasLeku()).toBe(3)
    expect(await baza.tabela('dziennikLekow').count()).toBe(1)
  })

  it('obsługuje pominięcie, odroczenie, cofnięcie i ponowne przyjęcie', async () => {
    const { wywolanie, wykonawca } = await przygotuj()
    const zmiana = (status: string, odroczoneDo?: string) => wykonawca.wykonaj({ ...wywolanie, argumenty: { ...wywolanie.argumenty as object, status, odroczoneDo } }, true)
    expect((await zmiana('pominiete')).status).toBe('wykonane')
    expect(await zapasLeku()).toBe(5)
    expect((await zmiana('odroczone')).status).toBe('blad')
    expect((await zmiana('odroczone', '2099-01-01T10:00:00Z')).status).toBe('wykonane')
    expect(await zapasLeku()).toBe(5)
    expect((await zmiana('zazyte')).status).toBe('wykonane')
    expect(await zapasLeku()).toBe(3)
    expect((await zmiana('oczekuje')).status).toBe('wykonane')
    expect(await zapasLeku()).toBe(5)
    expect((await zmiana('zazyte')).status).toBe('wykonane')
    expect(await zapasLeku()).toBe(3)
  })

  it('niedobór wymaga drugiego potwierdzenia; nie zgłasza sukcesu po odrzuceniu transakcji', async () => {
    const { wywolanie, wykonawca, rejestr } = await przygotuj(1)
    const { agent } = utworzAgenta([wywolanie], rejestr, wykonawca)
    const pierwsza = await agent.obsluz('Przyjąłem lek')
    const rozbieznosc = await agent.potwierdz(pierwsza.akcjaDoPotwierdzenia!)
    expect(rozbieznosc.wymagaPotwierdzenia).toBe(true)
    expect(rozbieznosc.tekst).toContain('Niedobór')
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
    expect(await zapasLeku()).toBe(1)
    const wynik = await agent.potwierdz(rozbieznosc.akcjaDoPotwierdzenia!)
    expect(wynik.tekst).toContain('Zapisano przyjęcie')
    expect(wynik.tekst).toContain('Nierozliczone: 1')
    expect(await zapasLeku()).toBe(0)
    expect(await baza.tabela('dziennikLekow').toArray()).toMatchObject([{ nierozliczonaIlosc: 1 }])
  })

  it('model nie może przekazać zgody na niedobór ani zmiany instrukcji; zgoda nie przechodzi na inne argumenty', async () => {
    const { wywolanie, wykonawca } = await przygotuj(1)
    for (const dodatkowe of [{ potwierdzRozbieznosc: true }, { dawkaInstrukcja: 'Nowe zalecenie' }, { dawki: [] }]) {
      expect((await wykonawca.wykonaj({ ...wywolanie, argumenty: { ...wywolanie.argumenty as object, ...dodatkowe } }, true)).status).toBe('zablokowane')
    }
    expect((await wykonawca.wykonaj(wywolanie, true)).status).toBe('wymaga_potwierdzenia')
    expect((await wykonawca.wykonaj({ ...wywolanie, argumenty: { ...wywolanie.argumenty as object, przyjetaIlosc: 3 } }, true)).status).toBe('wymaga_potwierdzenia')
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
  })

  it('odrzuca nieaktualne wystąpienie i sprawdza dostęp ponownie przy potwierdzeniu', async () => {
    const { wywolanie, rejestr, wykonawca } = await przygotuj()
    const dostep = vi.fn(() => true)
    const zUprawnieniami = new WykonawcaNarzedziEcho(rejestr, undefined, async () => undefined, dostep)
    expect((await zUprawnieniami.wykonaj(wywolanie)).status).toBe('wymaga_potwierdzenia')
    dostep.mockReturnValue(false)
    expect((await zUprawnieniami.wykonaj(wywolanie, true)).status).toBe('zablokowane')
    await baza.tabela('leki').update('lek-echo', { dawki: [{ id: 'zmieniona', godzina: '09:00', ilosc: 1 }] })
    const wynik = await wykonawca.wykonaj(wywolanie, true)
    expect(wynik.status).toBe('zablokowane')
    expect(wynik.komunikat).toContain('nieaktualne')
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
  })

  it('awaria kolejki wycofuje rozliczenie i zwraca błąd zamiast sukcesu', async () => {
    const { wywolanie, wykonawca } = await przygotuj()
    const awaria = vi.spyOn(baza.tabela('kolejkaSynchronizacji'), 'add').mockImplementationOnce(() => { throw new Error('Błąd zapisu kolejki') })
    try {
      const wynik = await wykonawca.wykonaj(wywolanie, true)
      expect(wynik.status).toBe('blad')
      expect(wynik.komunikat).toContain('Błąd zapisu')
    } finally { awaria.mockRestore() }
    expect(await zapasLeku()).toBe(5)
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
  })

  it('agent pokazuje odrzucenie nieaktualnej dawki zamiast wygenerowanego przez model sukcesu', async () => {
    const { wywolanie, rejestr, wykonawca } = await przygotuj()
    const { agent, provider } = utworzAgenta([wywolanie], rejestr, wykonawca)
    const propozycja = await agent.obsluz('Przyjąłem lek')
    await baza.tabela('leki').update('lek-echo', { aktywny: false })
    const wynik = await agent.potwierdz(propozycja.akcjaDoPotwierdzenia!)
    expect(wynik.tekst).toContain('nieaktualne')
    expect(wynik.tekst).not.toContain('Zapisano')
    expect(provider.odpowiedz).toHaveBeenCalledTimes(1)
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
    expect(await zapasLeku()).toBe(5)
  })

  it('awaria dziennika Echo po udanym zapisie nie zmienia wyniku transakcji leku', async () => {
    const { wywolanie, rejestr } = await przygotuj()
    const wykonawca = new WykonawcaNarzedziEcho(rejestr, undefined, async () => { throw new Error('Awaria dziennika Echo') })
    expect((await wykonawca.wykonaj(wywolanie, true)).status).toBe('wykonane')
    expect(await zapasLeku()).toBe(3)
  })

  it('wznawia plan po rozbieżności bez powtarzania wcześniejszej akcji', async () => {
    const { wywolanie, rejestr, wykonawca } = await przygotuj(1)
    const utworzenie: WywolanieNarzedziaEcho = { id: 'notatka', nazwa: 'create_note', argumenty: { tytul: 'Notatka testowa', tresc: 'Treść' } }
    const narzedzie = rejestr.pobierz('create_note')!
    const zapisNotatki = vi.spyOn(narzedzie, 'wykonaj').mockResolvedValue({ id: 'notatka' })
    const { agent } = utworzAgenta([utworzenie, wywolanie], rejestr, wykonawca)
    try {
      const plan = await agent.obsluz('Dodaj notatkę i przyjęcie')
      expect(plan.tekst).toContain('2026-08-14 08:00')
      const rozbieznosc = await agent.potwierdz(plan.akcjaDoPotwierdzenia!)
      expect(rozbieznosc.wymagaPotwierdzenia).toBe(true)
      expect(zapisNotatki).toHaveBeenCalledTimes(1)
      const zakonczony = await agent.potwierdz(rozbieznosc.akcjaDoPotwierdzenia!)
      expect(zakonczony.tekst).toContain('Nierozliczone: 1')
      expect(zapisNotatki).toHaveBeenCalledTimes(1)
      expect(await zapasLeku()).toBe(0)
    } finally { zapisNotatki.mockRestore() }
  })
})
