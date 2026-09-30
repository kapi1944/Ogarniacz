import { describe, expect, it } from 'vitest'
import { utworzDiagnostykeSynchronizacji } from './DiagnostykaSynchronizacji'
import { utworzMetadane } from '../domain/fabryki'

describe('DiagnostykaSynchronizacji', () => {
  it('pokazuje wyłącznie bezpieczne informacje klienta sesyjnego', () => {
    const sekret = 'csrf-i-cookie-oraz-bearer-nie-moga-tu-trafic'
    const diagnostyka = utworzDiagnostykeSynchronizacji({
      czyAndroid: true,
      adresApi: `https://uzytkownik:${sekret}@raspberrypi.tailnet.ts.net:8787`,
      konto: { zalogowany: true, uzytkownikId: 'uzytkownik', wlascicielId: 'wlasciciel', email: 'wlasciciel@example.com', rola: 'wlasciciel', granty: [], edytorzy: [] },
      csrfDostepny: true,
      installationId: '12345678-1234-1234-1234-123456789abc',
    })

    expect(diagnostyka).toMatchObject({
      srodowisko: 'Android', hostApi: 'raspberrypi.tailnet.ts.net:8787', protokolApi: 'HTTPS', stanSesji: 'zalogowany',
      rola: 'Właściciel', csrf: 'dostępny', installationId: '12345678…', trybAutoryzacji: 'sesja',
      stanPolaczenia: 'nie sprawdzono', liczbaOczekujacych: 0, liczbaKonfliktow: 0, wymaganeLogowanie: false,
    })
    expect(JSON.stringify(diagnostyka)).not.toContain(sekret)
    expect(JSON.stringify(diagnostyka)).not.toContain('wlasciciel@example.com')
  })

  it('obsługuje starszy lokalny stan bez wymyślania czasów i bez ujawniania historycznego surowego błędu', () => {
    const diagnostyka = utworzDiagnostykeSynchronizacji({
      czyAndroid: false, installationId: '12345678-pelny', csrfDostepny: false,
      stan: { ...utworzMetadane('glowny'), stan: 'blad', ostatniSync: '2026-09-01T00:00:00.000Z', ostatniBlad: 'token=sekret, rekord leku', liczbaOczekujacych: 2, liczbaKonfliktow: 1 },
    })
    expect(diagnostyka).toMatchObject({ stanSesji: 'niezalogowany', wymaganeLogowanie: true, liczbaOczekujacych: 2, liczbaKonfliktow: 1, stanPolaczenia: 'brak konfiguracji' })
    expect(diagnostyka.ostatniPull).toBeUndefined()
    expect(diagnostyka.ostatniPush).toBeUndefined()
    expect(diagnostyka.ostatniBlad).toBeUndefined()
    expect(JSON.stringify(diagnostyka)).not.toContain('sekret')
  })
})
