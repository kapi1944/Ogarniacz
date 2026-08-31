import { Share } from '@capacitor/share'
import type { DaneUdostepniania } from './typy'

export function utworzUslugeUdostepniania(czyAndroid: boolean) {
  return {
    dostepne: () => czyAndroid || typeof navigator.share === 'function',
    async udostepnij(dane: DaneUdostepniania) {
      try {
        if (czyAndroid) {
          if (!(await Share.canShare()).value) return false
          await Share.share({ title: dane.tytul, text: dane.tekst, url: dane.adres, dialogTitle: 'Udostępnij z Ogarniacza' })
          return true
        }
        if (typeof navigator.share !== 'function') return false
        await navigator.share({ title: dane.tytul, text: dane.tekst, url: dane.adres })
        return true
      } catch {
        return false
      }
    },
  }
}
