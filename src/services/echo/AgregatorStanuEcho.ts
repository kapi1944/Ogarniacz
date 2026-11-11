import type { StanSesjiGlosowejEcho } from './KontrolerSesjiGlosowejEcho'
import type { StanPracyEcho } from './typyEcho'

export type StanPrezentacjiEcho =
  | 'bezczynny'
  | 'nasluchiwanie'
  | 'rozpoznawanie'
  | 'przetwarzanie'
  | 'oczekiwanieNaPotwierdzenie'
  | 'oczekiwanieNaDoprecyzowanie'
  | 'generowanieOdpowiedzi'
  | 'odtwarzanieGlosu'
  | 'anulowanie'
  | 'blad'

export interface ObserwacjeStanuEcho {
  stanSesji: StanSesjiGlosowejEcho
  stanAgenta: StanPracyEcho
  tekstAktywny: boolean
  oczekujePotwierdzenia: boolean
  oczekujeDoprecyzowania: boolean
}

export function agregujStanEcho(obserwacje: ObserwacjeStanuEcho): StanPrezentacjiEcho {
  const { stanSesji, stanAgenta, tekstAktywny, oczekujePotwierdzenia, oczekujeDoprecyzowania } = obserwacje

  // Priorytet: błąd/anulowanie > intencja oczekiwania > aktywna sesja głosu > agent tekstu.
  if (stanSesji === 'blad') return 'blad'
  if (stanSesji === 'anulowanie') return 'anulowanie'
  if (stanSesji === 'oczekujePotwierdzenia' || oczekujePotwierdzenia) return 'oczekiwanieNaPotwierdzenie'
  if (stanSesji === 'oczekujeDoprecyzowania' || oczekujeDoprecyzowania) return 'oczekiwanieNaDoprecyzowanie'
  if (stanSesji === 'oczekiwanie') return 'nasluchiwanie'
  if (stanSesji === 'mowienie') return 'odtwarzanieGlosu'
  if (stanSesji === 'sluchanie' || stanSesji === 'mowiUzytkownik') return 'nasluchiwanie'
  if (stanSesji === 'transkrypcja') return 'rozpoznawanie'
  if (stanSesji === 'myslenie') return 'przetwarzanie'
  if (tekstAktywny) {
    if (stanAgenta === 'generuje') return 'generowanieOdpowiedzi'
    if (stanAgenta === 'wykonuje') return 'przetwarzanie'
    return 'przetwarzanie'
  }
  return 'bezczynny'
}
