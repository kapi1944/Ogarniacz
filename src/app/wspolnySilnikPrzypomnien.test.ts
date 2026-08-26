import { describe, expect, it } from 'vitest'
import {
  odlozPrzypomnienieV1,
  przypomnieniaWOknieV1,
  wyznaczPrzypomnieniaV1,
} from './wspolnySilnikPrzypomnien'

describe('wspólny silnik przypomnień v1', () => {
  it('wylicza reminder względem terminu zadania bez wysyłania push', () => {
    const wynik = wyznaczPrzypomnieniaV1({
      id: 'task-1',
      title: 'Telefon',
      date: '2026-08-27',
      time: '15:00',
      reminders: [{ minutesBefore: 30 }],
    })
    expect(wynik).toHaveLength(1)
    expect(new Date(wynik[0].at).getHours()).toBe(14)
    expect(new Date(wynik[0].at).getMinutes()).toBe(30)
  })

  it('obsługuje wspólne sourceRef dla leku i wizyty', () => {
    const items = [
      {
        id: 'dose-1', title: 'Lek', sourceRef: { module: 'lek', entityId: 'lek-1' },
        reminders: [{ at: '2026-08-27T12:10:00+02:00' }],
      },
      {
        id: 'visit-1', title: 'Wizyta', sourceRef: { module: 'wizyta', entityId: 'w-1' },
        reminders: [{ at: '2026-08-27T12:20:00+02:00' }],
      },
    ]
    const wynik = przypomnieniaWOknieV1(items, new Date('2026-08-27T12:00:00+02:00'), 30)
    expect(wynik.map(x => x.sourceRef.module)).toEqual(['lek', 'wizyta'])
  })

  it('pozwala lokalnie odłożyć przypomnienie', () => {
    const baza = {
      id: 'r1', title: 'X', sourceRef: { module: 'zadanie', entityId: '1' },
      at: '2026-08-27T10:00:00.000Z', sourceItemId: '1',
    }
    expect(odlozPrzypomnienieV1(baza, 15).at).toBe('2026-08-27T10:15:00.000Z')
  })
})
