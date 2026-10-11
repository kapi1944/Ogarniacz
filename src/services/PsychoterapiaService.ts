import { z } from 'zod'
import { baza } from '../data/BazaOgarniacza'
import { tabelaKolejki } from '../data/KolejkaSynchronizacji'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { terazIso } from '../domain/fabryki'
import { schematSzczegolowPsychoterapii } from '../domain/psychoterapia'
import type { WpisTerapii } from '../domain/typy'
import { utworzZadanie } from './ZadaniaService'

export interface DostepPsychoterapii {
  sesje: (operacja: 'odczyt' | 'edycja') => boolean
  dziennik: () => boolean
  zadania: (operacja: 'odczyt' | 'edycja') => boolean
  zrodla?: (tabela: 'wizyty' | 'kontakty' | 'dokumenty') => boolean
}
function sprawdzEdycje(dostep: DostepPsychoterapii) {
  if (!dostep.sesje('odczyt') || !dostep.sesje('edycja')) throw new Error('Brak uprawnienia do edycji psychoterapii.')
}

export async function zapiszSesje(wpis: WpisTerapii, dostep: DostepPsychoterapii): Promise<void> {
  sprawdzEdycje(dostep)
  const szczegoly = schematSzczegolowPsychoterapii.parse(wpis.psychoterapia ?? {})
  if (!Number.isFinite(Date.parse(wpis.dataCzas))) throw new Error('Podaj poprawną datę i godzinę sesji.')
  await baza.transaction('rw', [baza.tabela('wpisyTerapii'), baza.tabela('terapie'), baza.tabela('wizyty'), baza.tabela('kontakty'), baza.tabela('dokumenty'), baza.tabela('wpisySamopoczucia'), baza.tabela('zadania'), tabelaKolejki()], async () => {
    sprawdzEdycje(dostep)
    const poprzedni = await baza.tabela('wpisyTerapii').get(wpis.id)
    if (poprzedni && (poprzedni.usunietoAt || poprzedni.updatedAt !== wpis.updatedAt)) throw new Error('Sesja uległa zmianie. Otwórz ją ponownie.')
    for (const id of szczegoly.wpisySamopoczuciaIds ?? []) {
      if (poprzedni?.psychoterapia?.wpisySamopoczuciaIds?.includes(id)) continue
      if (!dostep.dziennik()) throw new Error('Brak uprawnienia do dziennika samopoczucia.')
      const zrodlo = await pobierzRepozytorium('wpisySamopoczucia').pobierz(id)
      if (!zrodlo?.doOmowienia) throw new Error('Wybierz dostępny wpis oznaczony „Do omówienia na terapii”.')
    }
    for (const klucz of ['ustaleniaSesjiIds', 'pytaniaSesjiIds'] as const) {
      for (const id of szczegoly[klucz] ?? []) {
        if (poprzedni?.psychoterapia?.[klucz]?.includes(id)) continue
        const zrodlo = await pobierzRepozytorium('wpisyTerapii', dostep.sesje).pobierz(id)
        if (id === wpis.id || !zrodlo || Date.parse(zrodlo.dataCzas) >= Date.parse(wpis.dataCzas) || !(klucz === 'ustaleniaSesjiIds' ? zrodlo.zalecenia : zrodlo.tematNastepnegoSpotkania)) throw new Error('Wybrane źródło wcześniejszej sesji jest niedostępne.')
      }
    }
    for (const id of szczegoly.cwiczeniaZadaniaIds ?? []) {
      if (poprzedni?.psychoterapia?.cwiczeniaZadaniaIds?.includes(id)) continue
      if (!dostep.zadania('odczyt')) throw new Error('Brak uprawnienia do zadań.')
      const zrodlo = await pobierzRepozytorium('zadania', dostep.sesje).pobierz(id)
      if (!zrodlo?.sesjaTerapiiId || zrodlo.status === 'wykonane') throw new Error('Wybierz dostępne, niewykonane ćwiczenie.')
    }
    const relacje = [
      ['terapie', wpis.terapiaId, poprzedni?.terapiaId], ['wizyty', wpis.wizytaId, poprzedni?.wizytaId],
      ['kontakty', szczegoly.terapeutaId, poprzedni?.psychoterapia?.terapeutaId],
      ...(szczegoly.dokumentyIds ?? []).map((id) => ['dokumenty', id, poprzedni?.psychoterapia?.dokumentyIds?.includes(id) ? id : undefined]),
    ] as const
    for (const [tabela, id, dawnyId] of relacje) {
      if (id && id !== dawnyId && tabela !== 'terapie' && !dostep.zrodla?.(tabela as 'wizyty' | 'kontakty' | 'dokumenty')) throw new Error('Brak uprawnienia do wybranego źródła.')
      if (id && id !== dawnyId && !await pobierzRepozytorium(tabela as 'terapie' | 'wizyty' | 'kontakty' | 'dokumenty').pobierz(id)) throw new Error('Wybrane powiązanie jest niedostępne.')
    }
    await pobierzRepozytorium('wpisyTerapii', dostep.sesje).zapisz({ ...wpis, createdAt: poprzedni?.createdAt ?? wpis.createdAt, psychoterapia: szczegoly })
  })
}

export async function usunSesje(id: string, dostep: DostepPsychoterapii): Promise<void> {
  sprawdzEdycje(dostep)
  await pobierzRepozytorium('wpisyTerapii', dostep.sesje).usun(id)
}

const schematCwiczenia = z.object({ tytul: z.string().trim().min(1), opis: z.string(), termin: z.iso.date().optional() })
export async function utworzCwiczenie(sesjaId: string, operacjaId: string, dane: z.infer<typeof schematCwiczenia>, potwierdzone: boolean, dostep: DostepPsychoterapii): Promise<string> {
  sprawdzEdycje(dostep)
  if (!potwierdzone) throw new Error('Zatwierdź utworzenie ćwiczenia.')
  if (!dostep.zadania('odczyt') || !dostep.zadania('edycja')) throw new Error('Brak uprawnienia do zadań.')
  const poprawne = schematCwiczenia.parse(dane)
  if (!operacjaId.trim()) throw new Error('Brak identyfikatora operacji.')
  const id = `cwiczenie:${operacjaId}`
  await baza.transaction('rw', [baza.tabela('wpisyTerapii'), baza.tabela('zadania'), baza.tabela('historiaZmian'), tabelaKolejki()], async () => {
    sprawdzEdycje(dostep)
    if (!dostep.zadania('odczyt') || !dostep.zadania('edycja')) throw new Error('Brak uprawnienia do zadań.')
    const sesja = await pobierzRepozytorium('wpisyTerapii', dostep.sesje).pobierz(sesjaId)
    if (!sesja?.psychoterapia) throw new Error('Zapisz najpierw sesję psychoterapii.')
    const poprzednie = await baza.tabela('zadania').get(id)
    if (poprzednie) {
      if (poprzednie.sesjaTerapiiId !== sesjaId) throw new Error('Operacja dotyczy innej sesji.')
      return
    }
    await pobierzRepozytorium('zadania', (operacja) => dostep.sesje(operacja) && dostep.zadania(operacja)).zapisz({
      ...utworzZadanie(poprawne), id, sesjaTerapiiId: sesjaId, pokazNaPulpicie: false,
      powiazania: [{ typ: 'zdrowie', id: sesjaId }], updatedAt: terazIso(),
    })
  })
  return id
}
