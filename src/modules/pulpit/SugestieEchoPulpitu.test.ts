import { describe, expect, it } from 'vitest'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import type { AlertPulpitu } from './logikaKafelkow'
import { kandydaciSugestiiEchoPulpitu, widoczneSugestieEchoPulpitu } from './SugestieEchoPulpitu'

const alert: AlertPulpitu = {
  id: 'konflikt', typ: 'asap', severity: 'warning', tytul: 'Raport', opis: 'Nakłada się z: Dentysta',
  sourceRef: { modul: 'zadania', encjaId: 'raport' }, createdAt: '2026-09-08T10:00:00.000Z',
}
const zadanie = (id: string): ElementOgarniacza<'zadanie'> => ({
  id, typ: 'zadanie', tytul: id, data: '2026-09-08', status: 'otwarty', updatedAt: '2026-09-08T10:00:00.000Z', createdAt: '2026-09-08T09:00:00.000Z', referencjaZrodla: { modul: 'zadania', encjaId: id },
})

describe('sugestie Echo na Pulpicie', () => {
  it('wyprowadza konflikt deterministycznie z istniejącego alertu', () => {
    const [sugestia] = kandydaciSugestiiEchoPulpitu([alert], [], { pracuje: false, doPracy: '16:00' }, new Date('2026-09-08T10:00:00'))
    expect(sugestia.tresc).toContain('konflikt w planie')
  })

  it('ukrywa odrzuconą sugestię, dopóki jej identyfikator nie zmieni się wraz z okolicznościami', () => {
    const kandydaci = kandydaciSugestiiEchoPulpitu([], [zadanie('a'), zadanie('b'), zadanie('c')], { pracuje: true, doPracy: '16:00' }, new Date('2026-09-08T15:30:00'))
    expect(widoczneSugestieEchoPulpitu(kandydaci, [kandydaci[0].id])).toEqual([])
    expect(widoczneSugestieEchoPulpitu(kandydaci, [])).toHaveLength(1)
  })

  it('pokazuje jedną sugestię przeplanowania, gdy otwarte zadanie realnie opóźnia plan', () => {
    const opoznione = { ...zadanie('raport'), godzina: '10:00', czasTrwaniaMinuty: 30 }
    const kandydaci = kandydaciSugestiiEchoPulpitu([], [opoznione], { pracuje: false, doPracy: '16:00' }, new Date('2026-09-08T10:50:00'))

    expect(widoczneSugestieEchoPulpitu(kandydaci, [], 1)).toMatchObject([{
      tresc: 'Plan dnia jest opóźniony o około 50 min. Przeplanować pozostałe zadania?',
      zrodlo: 'plan',
    }])
  })
})
