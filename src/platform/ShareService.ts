import { Share } from '@capacitor/share'
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { DaneUdostepniania, OdebraneDaneUdostepniania } from './typy'

interface WtyczkaOdbioruUdostepniania {
  addListener(nazwa: 'odebranoUdostepnienie', obsluga: (dane: unknown) => void): Promise<PluginListenerHandle>
}

const odbiorUdostepniania = registerPlugin<WtyczkaOdbioruUdostepniania>('OdbiorUdostepniania')

export function normalizujOdebraneUdostepnienie(dane: unknown): OdebraneDaneUdostepniania | null {
  if (!dane || typeof dane !== 'object') return null
  const zrodlo = dane as Record<string, unknown>
  if (typeof zrodlo.tekst !== 'string') return null
  const tekst = zrodlo.tekst.trim().slice(0, 10_000)
  const tytul = typeof zrodlo.tytul === 'string' ? zrodlo.tytul.trim().slice(0, 200) : ''
  return tekst ? { tekst, ...(tytul ? { tytul } : {}) } : null
}

export function utworzUslugeUdostepniania(czyAndroid: boolean) {
  return {
    dostepne: () => czyAndroid || typeof navigator.share === 'function',
    async udostepnij(dane: DaneUdostepniania) {
      try {
        if (czyAndroid) {
          if (!(await Share.canShare()).value) return false
          await Share.share({ title: dane.tytul, text: dane.tekst, url: dane.adres, files: dane.pliki, dialogTitle: 'Udostępnij z Ogarniacza' })
          return true
        }
        if (typeof navigator.share !== 'function') return false
        await navigator.share({ title: dane.tytul, text: dane.tekst, url: dane.adres })
        return true
      } catch {
        return false
      }
    },
    async nasluchujOdebrania(obsluga: (dane: OdebraneDaneUdostepniania) => void) {
      if (!czyAndroid) return () => undefined
      const uchwyt = await odbiorUdostepniania.addListener('odebranoUdostepnienie', (dane) => {
        const znormalizowane = normalizujOdebraneUdostepnienie(dane)
        if (znormalizowane) obsluga(znormalizowane)
      })
      return () => void uchwyt.remove()
    },
  }
}
