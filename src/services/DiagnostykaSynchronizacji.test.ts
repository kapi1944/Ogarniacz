import { describe, expect, it } from 'vitest'
import { utworzDiagnostykeSynchronizacji, utworzTekstRaportuDiagnostycznego } from './DiagnostykaSynchronizacji'
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

  it('tworzy raport z dozwolonych pól i nie ujawnia danych wrażliwych', () => {
    const sekret = 'csrf-cookie-token-prywatny-host'
    const diagnostyka = utworzDiagnostykeSynchronizacji({
      czyAndroid: true,
      adresApi: `https://uzytkownik:${sekret}@prywatny-serwer.example:8787`,
      konto: { zalogowany: true, uzytkownikId: 'osoba-prywatna', wlascicielId: 'wlasciciel-prywatny', email: 'osoba@example.test', rola: 'wlasciciel', granty: [], edytorzy: [] },
      csrfDostepny: true,
      installationId: 'pelny-identyfikator-instalacji-123456789',
      stan: {
        ...utworzMetadane('glowny'), stan: 'konflikt', polaczenie: 'dostepne',
        ostatniPull: '2026-10-22T08:00:00.000Z', ostatniPush: '2026-10-22T08:01:00.000Z',
        liczbaOczekujacych: 2, liczbaKonfliktow: 1, kodOstatniegoBledu: 'konflikt',
      },
    })
    const raport = utworzTekstRaportuDiagnostycznego(diagnostyka, new Date('2026-10-22T09:00:00.000Z'))

    expect(raport).toContain('Platforma: Android')
    expect(raport).toContain('Konfiguracja połączenia: skonfigurowana')
    expect(raport).toContain('Stan połączenia: dostępne')
    expect(raport).toContain('Stan logowania: zalogowany')
    expect(raport).toContain('Status synchronizacji: wymaga rozstrzygnięcia konfliktu')
    expect(raport).toContain('Ostatni pull: 2026-10-22T08:00:00.000Z')
    expect(raport).toContain('Ostatni push: 2026-10-22T08:01:00.000Z')
    expect(raport).toContain('Oczekujące zmiany: 2')
    expect(raport).toContain('Konflikty: 1')
    expect(raport).toContain('Kod ostatniego błędu: konflikt')
    expect(raport).toContain('Wygenerowano: 2026-10-22T09:00:00.000Z')
    for (const niedozwolonaWartosc of [sekret, 'prywatny-serwer.example', 'osoba@example.test', 'osoba-prywatna', 'pelny-identyfikator-instalacji']) {
      expect(raport).not.toContain(niedozwolonaWartosc)
    }
  })

  it('formatuje brak połączenia i pominięte wartości bez null ani undefined', () => {
    const diagnostyka = utworzDiagnostykeSynchronizacji({ czyAndroid: false, csrfDostepny: false, installationId: '' })
    const raport = utworzTekstRaportuDiagnostycznego(diagnostyka, new Date('2026-10-22T09:00:00.000Z'))

    expect(raport).toContain('Platforma: Web')
    expect(raport).toContain('Konfiguracja połączenia: brak konfiguracji')
    expect(raport).toContain('Stan połączenia: brak konfiguracji')
    expect(raport).toContain('Ostatni pull: jeszcze nie wykonano')
    expect(raport).toContain('Ostatni push: jeszcze nie wykonano')
    expect(raport).toContain('Kod ostatniego błędu: brak')
    expect(raport).not.toMatch(/\b(?:undefined|null)\b/)
  })
})
