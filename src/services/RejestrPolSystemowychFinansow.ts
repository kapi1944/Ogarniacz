import type { Repozytorium } from '../data/Repozytorium'
import type { DefinicjaPolaRejestru } from '../domain/rejestr'
import type { PlatnoscStala, Wydatek } from '../domain/typy'
import { rejestrAkcjiDomenowychPolSystemowych, rejestrResolverowPolSystemowych } from './KontraktPolSystemowychRejestru'
import { zaksiegujPlatnoscStala } from './FinanseService'

export const POLE_AKCJI_ZAKSIEGUJ_PLATNOSC_STALA = {
  id: 'system:zaksięguj-platnosc-stala',
  zrodlo: 'systemowe',
  trybObslugi: 'akcja_domenowa',
  actionId: 'action:finanse-zaksieguj-platnosc-stala',
  etykieta: 'Zaksięguj płatność',
  typ: 'checkbox',
} satisfies DefinicjaPolaRejestru<'checkbox'>

rejestrResolverowPolSystemowych.zarejestruj<PlatnoscStala>({
  id: 'resolver:finanse-roczny-koszt-subskrypcji',
  wyznaczRevision: ({ encja }) => `${encja.updatedAt}:${encja.kwota}`,
  rozwiaz: ({ encja }) => encja.kwota * 12,
})

rejestrAkcjiDomenowychPolSystemowych.zarejestruj<PlatnoscStala>({
  id: 'action:finanse-zaksieguj-platnosc-stala',
  wykonaj: async ({ encja, daneZrodlowe }) => {
    const miesiac = daneZrodlowe.miesiac
    const repozytoriumWydatkow = daneZrodlowe.repozytoriumWydatkow as Repozytorium<Wydatek> | undefined
    if (typeof miesiac !== 'string' || !/^\d{4}-\d{2}$/.test(miesiac) || !repozytoriumWydatkow || typeof repozytoriumWydatkow.zapisz !== 'function') {
      throw new Error('Akcja księgowania wymaga miesiąca i repozytorium wydatków.')
    }
    await zaksiegujPlatnoscStala(encja, miesiac, repozytoriumWydatkow)
  },
})

export async function zaksiegujPlatnoscStalaPrzezRejestr(
  platnosc: PlatnoscStala,
  miesiac: string,
  repozytoriumWydatkow: Repozytorium<Wydatek>,
): Promise<void> {
  await rejestrAkcjiDomenowychPolSystemowych.uruchom(POLE_AKCJI_ZAKSIEGUJ_PLATNOSC_STALA, {
    encja: platnosc,
    daneZrodlowe: { miesiac, repozytoriumWydatkow },
  })
}
