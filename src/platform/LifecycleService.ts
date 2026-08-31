import { App } from '@capacitor/app'
import type { StanCykluZycia } from './typy'

function stanDokumentu(): StanCykluZycia {
  return document.visibilityState === 'visible' ? 'aktywny' : 'nieaktywny'
}

export function utworzUslugeCykluZycia(czyAndroid: boolean) {
  return {
    async pobierzStan(): Promise<StanCykluZycia> {
      if (!czyAndroid) return stanDokumentu()
      return (await App.getState()).isActive ? 'aktywny' : 'nieaktywny'
    },
    async nasluchuj(obsluga: (stan: StanCykluZycia) => void) {
      if (czyAndroid) {
        const nasluchiwanie = await App.addListener('appStateChange', ({ isActive }) =>
          obsluga(isActive ? 'aktywny' : 'nieaktywny'),
        )
        return () => void nasluchiwanie.remove()
      }

      const zmienStan = () => obsluga(stanDokumentu())
      document.addEventListener('visibilitychange', zmienStan)
      return () => document.removeEventListener('visibilitychange', zmienStan)
    },
  }
}
