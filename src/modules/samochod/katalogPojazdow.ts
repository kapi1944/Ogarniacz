import type { Pojazd } from '../../domain/typy'
import { dopasujPodpowiedzi, normalizujTekstPodpowiedzi } from '../../services/PodpowiedziFormularzy'

// Niepełny katalog nazw modeli; źródła i zasady rozbudowy: docs/AUTOUZUPELNIANIE_POJAZDOW.md.
export const KATALOG_POJAZDOW = [
  { marka: 'Dacia', modele: ['Sandero', 'Duster', 'Jogger', 'Bigster'] },
  { marka: 'Ford', modele: ['Focus', 'Puma', 'Kuga', 'Mustang'] },
  { marka: 'Hyundai', modele: ['i10', 'i20', 'i30', 'TUCSON'] },
  { marka: 'Peugeot', modele: ['208', '308', '2008', '3008'] },
  { marka: 'Renault', modele: ['Clio', 'Captur', 'Austral', 'Symbioz'] },
  { marka: 'Škoda', modele: ['Fabia', 'Octavia', 'Superb', 'Karoq'] },
  { marka: 'Toyota', modele: ['Corolla', 'Yaris', 'RAV4', 'Camry'] },
  { marka: 'Volkswagen', modele: ['Golf', 'Polo', 'Passat', 'Tiguan'] },
] as const

export function podpowiedzMarki(pojazdy: readonly Pojazd[]): string[] {
  return dopasujPodpowiedzi([...KATALOG_POJAZDOW.map((pozycja) => pozycja.marka), ...pojazdy.map((pojazd) => pojazd.marka ?? '')], '')
}

export function podpowiedzModele(marka: string, pojazdy: readonly Pojazd[]): string[] {
  const klucz = normalizujTekstPodpowiedzi(marka)
  if (!klucz) return []
  const katalog = KATALOG_POJAZDOW.find((pozycja) => normalizujTekstPodpowiedzi(pozycja.marka) === klucz)
  return dopasujPodpowiedzi([...(katalog?.modele ?? []), ...pojazdy.filter((pojazd) => normalizujTekstPodpowiedzi(pojazd.marka ?? '') === klucz).map((pojazd) => pojazd.model ?? '')], '')
}
