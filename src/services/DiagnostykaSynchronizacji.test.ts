import { describe, expect, it } from 'vitest'
import { utworzDiagnostykeSynchronizacji } from './DiagnostykaSynchronizacji'

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

    expect(diagnostyka).toEqual({
      srodowisko: 'Android', hostApi: 'raspberrypi.tailnet.ts.net:8787', protokolApi: 'HTTPS', stanSesji: 'zalogowany',
      rola: 'Właściciel', csrf: 'dostępny', installationId: '12345678…', trybAutoryzacji: 'sesja',
    })
    expect(JSON.stringify(diagnostyka)).not.toContain(sekret)
    expect(JSON.stringify(diagnostyka)).not.toContain('wlasciciel@example.com')
  })
})
