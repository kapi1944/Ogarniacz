import { baza } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { tabelaKolejki } from '../data/KolejkaSynchronizacji'
import { odczytajWartoscBadania, schematMetadanychMedycznych, schematWynikuBadania, type WynikBadania } from '../domain/badania'
import type { Dokument, Wizyta } from '../domain/typy'

export type DostepBadan = (operacja: 'odczyt' | 'edycja') => boolean
export type DostepZrodel = (tabela: 'dokumenty' | 'wizyty' | 'skierowania' | 'terapie' | 'recepty' | 'kontakty' | 'miejsca', operacja: 'odczyt' | 'edycja') => boolean

function sprawdzEdycje(dostep: DostepBadan) {
  if (!dostep('odczyt') || !dostep('edycja')) throw new Error('Brak uprawnienia do edycji wyników badań.')
}

export async function zapiszWynikBadania(wynik: WynikBadania, dostep: DostepBadan, zrodla: DostepZrodel): Promise<void> {
  sprawdzEdycje(dostep)
  const poprawny = schematWynikuBadania.parse({ ...wynik, wartoscLiczbowa: undefined, wartoscTekstowa: undefined, ...odczytajWartoscBadania(wynik.oryginalnyWynik) }) as WynikBadania
  await baza.transaction('rw', [baza.tabela('wynikiBadan'), baza.tabela('wpisyTerapii'), baza.tabela('dokumenty'), baza.tabela('wizyty'), tabelaKolejki()], async () => {
    sprawdzEdycje(dostep)
    const poprzedni = await baza.tabela('wynikiBadan').get(wynik.id)
    if (poprzedni && (poprzedni.usunietoAt || poprzedni.updatedAt !== wynik.updatedAt)) throw new Error('Wynik uległ zmianie. Otwórz go ponownie.')
    for (const [tabela, id, poprzednieId] of [['dokumenty', poprawny.dokumentId, poprzedni?.dokumentId], ['wizyty', poprawny.wizytaId, poprzedni?.wizytaId]] as const) {
      if (!id || id === poprzednieId) continue
      if (!zrodla(tabela, 'odczyt')) throw new Error('Brak uprawnienia do źródła wyniku.')
      const rekord = await pobierzRepozytorium(tabela, (operacja) => zrodla(tabela, operacja)).pobierz(id)
      if (!rekord || rekord.usunietoAt) throw new Error('Źródło wyniku jest niedostępne.')
    }
    if (poprawny.grupaId) {
      const grupa = (await baza.tabela('wynikiBadan').where('grupaId').equals(poprawny.grupaId).toArray()).filter((element) => !element.usunietoAt && element.id !== poprawny.id)
      if (grupa.some((element) => element.dokumentId !== poprawny.dokumentId || element.nazwaGrupy !== poprawny.nazwaGrupy || element.dataPobrania !== poprawny.dataPobrania)) throw new Error('Parametry grupy muszą mieć wspólną nazwę, datę pobrania i dokument źródłowy.')
    }
    await pobierzRepozytorium('wynikiBadan', dostep).zapisz({ ...poprawny, createdAt: poprzedni?.createdAt ?? poprawny.createdAt })
  })
}

export async function usunWynikBadania(id: string, dostep: DostepBadan): Promise<void> {
  sprawdzEdycje(dostep)
  await pobierzRepozytorium('wynikiBadan', dostep).usun(id)
}

/** Niedestrukcyjna suma relacji po ID, używana również przed uzgodnieniem dawnych zapisów. */
export function dokumentyWizyty(wizyta: Wizyta, dokumenty: Dokument[]): string[] {
  return [...new Set([...wizyta.dokumentyIds, ...dokumenty.filter((dokument) => dokument.powiazania.some((relacja) => relacja.typ === 'wizyty' && relacja.id === wizyta.id)).map((dokument) => dokument.id)])]
}

const tabeleRelacji = () => [baza.tabela('wynikiBadan'), baza.tabela('wpisyTerapii'), baza.tabela('dokumenty'), baza.tabela('wizyty'), baza.tabela('przypomnienia'), baza.tabela('historiaZmian'), tabelaKolejki()]

export async function zapiszWizyteZDokumentami(wizyta: Wizyta, dostep: DostepZrodel): Promise<string> {
  if (!dostep('wizyty', 'edycja')) throw new Error('Brak uprawnienia do wizyt.')
  return baza.transaction('rw', tabeleRelacji(), async () => {
    const id = await pobierzRepozytorium('wizyty').zapisz(wizyta)
    if (dostep('dokumenty', 'odczyt') && dostep('dokumenty', 'edycja') && dostep('wizyty', 'odczyt')) await uzgodnijRelacjeDokumentow(dostep)
    return id
  })
}

/** Dokument.powiazania jest kanoniczny; dokumentyIds pozostaje zgodną projekcją starszych widoków. */
export async function uzgodnijRelacjeDokumentow(dostep: DostepZrodel): Promise<void> {
  if (!dostep('dokumenty', 'odczyt') || !dostep('dokumenty', 'edycja') || !dostep('wizyty', 'odczyt') || !dostep('wizyty', 'edycja')) throw new Error('Brak uprawnień do uzgodnienia dokumentów i wizyt.')
  await baza.transaction('rw', tabeleRelacji(), async () => {
    const dokumenty = await pobierzRepozytorium('dokumenty').lista()
    const wizyty = await pobierzRepozytorium('wizyty').lista()
    for (const dokument of dokumenty) {
      const unikalne = dokument.powiazania.filter((relacja, indeks, wszystkie) => wszystkie.findIndex((element) => element.typ === relacja.typ && element.id === relacja.id) === indeks)
      if (unikalne.length !== dokument.powiazania.length) {
        dokument.powiazania = unikalne
        await pobierzRepozytorium('dokumenty').zapisz(dokument)
      }
    }
    for (const wizyta of wizyty) {
      const ids = dokumentyWizyty(wizyta, dokumenty)
      for (const dokument of dokumenty.filter((element) => ids.includes(element.id))) {
        if (!dokument.powiazania.some((relacja) => relacja.typ === 'wizyty' && relacja.id === wizyta.id)) {
          dokument.powiazania = [...dokument.powiazania, { typ: 'wizyty', id: wizyta.id }]
          await pobierzRepozytorium('dokumenty').zapisz(dokument)
        }
      }
      if (JSON.stringify(ids) !== JSON.stringify(wizyta.dokumentyIds)) await pobierzRepozytorium('wizyty').zapisz({ ...wizyta, dokumentyIds: ids })
    }
  })
}

export async function zapiszDokumentMedyczny(dokument: Dokument, dostep: DostepZrodel): Promise<void> {
  if (!dostep('dokumenty', 'odczyt') || !dostep('dokumenty', 'edycja')) throw new Error('Brak uprawnienia do dokumentów.')
  const medyczne = schematMetadanychMedycznych.parse(dokument.medyczne)
  if (!dokument.nazwa.trim()) throw new Error('Podaj nazwę dokumentu.')
  await baza.transaction('rw', [...tabeleRelacji(), ...(['skierowania', 'terapie', 'recepty', 'kontakty', 'miejsca'] as const).map((tabela) => baza.tabela(tabela))], async () => {
    const poprzedni = await baza.tabela('dokumenty').get(dokument.id)
    if (poprzedni && (poprzedni.usunietoAt || poprzedni.updatedAt !== dokument.updatedAt)) throw new Error('Dokument uległ zmianie. Otwórz go ponownie.')
    for (const [tabela, id, stareId] of [
      ['skierowania', medyczne.skierowanieId, poprzedni?.medyczne?.skierowanieId], ['terapie', medyczne.terapiaId, poprzedni?.medyczne?.terapiaId],
      ['recepty', medyczne.receptaId, poprzedni?.medyczne?.receptaId], ['kontakty', medyczne.kontaktId, poprzedni?.medyczne?.kontaktId], ['miejsca', medyczne.miejsceId, poprzedni?.medyczne?.miejsceId],
    ] as const) {
      if (!id || id === stareId) continue
      const rekord = dostep(tabela, 'odczyt') ? await baza.tabela(tabela).get(id) : undefined
      if (!rekord || rekord.usunietoAt) throw new Error('Powiązany rekord jest niedostępny lub brakuje uprawnienia.')
    }
    const powiazania = [...(poprzedni?.powiazania ?? [])]
    for (const relacja of dokument.powiazania) {
      if (powiazania.some((stara) => stara.typ === relacja.typ && stara.id === relacja.id)) continue
      if (relacja.typ === 'wizyty') {
        if (!dostep('wizyty', 'odczyt') || !dostep('wizyty', 'edycja')) throw new Error('Brak uprawnienia do powiązania wizyty.')
        const wizyta = await baza.tabela('wizyty').get(relacja.id)
        if (!wizyta || wizyta.usunietoAt) throw new Error('Wizyta jest niedostępna.')
        await pobierzRepozytorium('wizyty').zapisz({ ...wizyta, dokumentyIds: [...new Set([...wizyta.dokumentyIds, dokument.id])] })
      }
      powiazania.push(relacja)
    }
    await pobierzRepozytorium('dokumenty').zapisz({ ...dokument, medyczne, powiazania, createdAt: poprzedni?.createdAt ?? dokument.createdAt })
  })
}
