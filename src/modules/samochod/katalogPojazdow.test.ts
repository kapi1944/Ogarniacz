import { expect, it } from 'vitest'
import { KATALOG_POJAZDOW, podpowiedzMarki, podpowiedzModele } from './katalogPojazdow'
import { dopasujPodpowiedzi } from '../../services/PodpowiedziFormularzy'
import type { Pojazd } from '../../domain/typy'

it('udostępnia niewielki katalog ośmiu marek i 32 modeli', () => {
  expect(KATALOG_POJAZDOW.length).toBe(8)
  expect(KATALOG_POJAZDOW.flatMap((pozycja) => pozycja.modele).length).toBe(32)
  expect(new Set(podpowiedzMarki([])).size).toBe(8)
})

it.each(['skoda', 'ŠKODA', '  šKoDa  ', 'S\u030ckoda'])('wyszukuje Škodę dla %s bez zmiany danych wejściowych', (fraza) => {
  expect(dopasujPodpowiedzi(podpowiedzMarki([]), fraza)).toEqual(['Škoda'])
  expect(podpowiedzModele(fraza, [])).toContain('Octavia')
})

it('wyszukuje modele tylko wskazanej marki i ignoruje nadmiarowe spacje', () => {
  expect(podpowiedzModele('Toyota', [])).toEqual(['Camry', 'Corolla', 'RAV4', 'Yaris'])
  expect(dopasujPodpowiedzi(podpowiedzModele('Toyota', []), '  rAv4 ')).toEqual(['RAV4'])
  expect(dopasujPodpowiedzi(['Corolla Touring Sports'], 'corolla   touring')).toEqual(['Corolla Touring Sports'])
  expect(podpowiedzModele('Škoda', [])).not.toContain('Corolla')
  expect(podpowiedzModele('', [])).toEqual([])
  expect(podpowiedzModele('Niestandardowa', [])).toEqual([])
})

it('uzupełnia podpowiedzi danymi zapisanych pojazdów i nie miesza marek', () => {
  const pojazdy = [
    { marka: 'skoda', model: 'Octavia' }, { marka: 'Škoda', model: 'Model własny' },
    { marka: 'Marka  Własna', model: 'Prototyp' }, { marka: 'Ford', model: 'Fiesta' },
    { marka: '', model: 'Bez marki' },
  ] as Pojazd[]
  expect(dopasujPodpowiedzi(podpowiedzMarki(pojazdy), 'skoda')).toEqual(['Škoda'])
  expect(podpowiedzMarki(pojazdy)).toContain('Marka Własna')
  expect(podpowiedzModele('  MARKA   WŁASNA ', pojazdy)).toEqual(['Prototyp'])
  expect(podpowiedzModele('skoda', pojazdy)).toContain('Model własny')
  expect(podpowiedzModele('skoda', pojazdy)).not.toContain('Fiesta')
  expect(pojazdy[0].marka).toBe('skoda')
})
