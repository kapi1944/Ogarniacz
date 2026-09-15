import type { PlatnoscStala } from '../domain/typy'
import { rejestrResolverowPolSystemowych } from './KontraktPolSystemowychRejestru'

rejestrResolverowPolSystemowych.zarejestruj<PlatnoscStala>({
  id: 'resolver:finanse-roczny-koszt-subskrypcji',
  wyznaczRevision: ({ encja }) => `${encja.updatedAt}:${encja.kwota}`,
  rozwiaz: ({ encja }) => encja.kwota * 12,
})
