import { baza } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { tabelaKolejki } from '../data/KolejkaSynchronizacji'
import { biezaceWskazniki, domyslneUstawieniaSamopoczucia, schematUstawienSamopoczucia, schematWpisuSamopoczucia, type UstawieniaSamopoczucia, type WpisSamopoczucia, type WskaznikSamopoczucia } from '../domain/samopoczucie'

export async function zapiszWpisSamopoczucia(wpis: WpisSamopoczucia, dostep: () => boolean): Promise<void> {
  if (!dostep()) throw new Error('Brak uprawnienia do edycji dziennika samopoczucia.')
  const poprawny = schematWpisuSamopoczucia.parse(wpis)
  await baza.transaction('rw', [baza.tabela('wpisySamopoczucia'), baza.tabela('ustawienia'), tabelaKolejki()], async () => {
    const poprzedni = await baza.tabela('wpisySamopoczucia').get(wpis.id)
    if (!dostep()) throw new Error('Brak uprawnienia do edycji dziennika samopoczucia.')
    if (poprzedni && (poprzedni.usunietoAt || poprzedni.updatedAt !== wpis.updatedAt)) throw new Error('Wpis uległ zmianie. Otwórz go ponownie przed edycją.')
    const ustawienia = (await baza.tabela('ustawienia').get('glowne'))?.samopoczucie ?? domyslneUstawieniaSamopoczucia
    for (const obserwacja of poprawny.wskazniki) {
      const zachowana = poprzedni?.wskazniki.find((pole) => pole.definicja.id === obserwacja.definicja.id)
      const definicja = zachowana?.definicja ?? biezaceWskazniki(ustawienia).find((pole) => pole.id === obserwacja.definicja.id && pole.aktywny)
      if (!definicja || JSON.stringify(definicja) !== JSON.stringify(obserwacja.definicja)) throw new Error('Definicja wskaźnika uległa zmianie. Odśwież formularz.')
    }
    await pobierzRepozytorium('wpisySamopoczucia').zapisz({ ...poprawny, createdAt: poprzedni?.createdAt ?? poprawny.createdAt })
  })
}

export async function usunWpisSamopoczucia(id: string, dostep: () => boolean): Promise<void> {
  if (!dostep()) throw new Error('Brak uprawnienia do edycji dziennika samopoczucia.')
  await pobierzRepozytorium('wpisySamopoczucia').usun(id)
}

export function dodajWersjeWskaznika(ustawienia: UstawieniaSamopoczucia, definicja: WskaznikSamopoczucia): UstawieniaSamopoczucia {
  const wersja = Math.max(0, ...ustawienia.definicje.filter((pole) => pole.id === definicja.id).map((pole) => pole.wersja)) + 1
  return schematUstawienSamopoczucia.parse({ ...ustawienia, definicje: [...ustawienia.definicje, { ...definicja, wersja }] })
}

/** Wszystkie możliwe chwile wskazanej lokalnej minuty w strefie IANA, również cofnięcie zegara. */
export function chwileObserwacji(data: string, godzina: string, strefa: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(godzina)) return []
  try {
    const formatowanie = new Intl.DateTimeFormat('sv-SE', { timeZone: strefa, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    const srodek = Date.parse(`${data}T${godzina}:00Z`)
    const wynik: string[] = []
    for (let minuty = -14 * 60; minuty <= 14 * 60; minuty += 15) {
      const czas = new Date(srodek + minuty * 60_000)
      if (formatowanie.format(czas) === `${data} ${godzina}`) wynik.push(czas.toISOString())
    }
    return wynik
  } catch { return [] }
}
