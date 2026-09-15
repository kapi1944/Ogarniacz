import type { Zadanie } from '../domain/typy'
import { rejestrResolverowPolSystemowych } from './KontraktPolSystemowychRejestru'

rejestrResolverowPolSystemowych.zarejestruj<Zadanie>({
  id: 'resolver:zadania-status',
  wyznaczRevision: ({ encja }) => `${encja.updatedAt}:${encja.status}`,
  rozwiaz: ({ encja }) => encja.status,
})

rejestrResolverowPolSystemowych.zarejestruj<Zadanie>({
  id: 'resolver:zadania-priorytet',
  wyznaczRevision: ({ encja }) => `${encja.updatedAt}:${encja.priorytet}`,
  rozwiaz: ({ encja }) => encja.priorytet,
})

rejestrResolverowPolSystemowych.zarejestruj<Zadanie>({
  id: 'resolver:zadania-termin',
  wyznaczRevision: ({ encja }) => `${encja.updatedAt}:${encja.termin ?? ''}`,
  rozwiaz: ({ encja }) => encja.termin ?? '—',
})
