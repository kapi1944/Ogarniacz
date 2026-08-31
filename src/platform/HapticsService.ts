import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

export function utworzUslugeHaptyki(czyAndroid: boolean) {
  const wykonaj = async (akcjaNatywna: () => Promise<void>, wzorzecWeb: number | number[]) => {
    try {
      if (czyAndroid) await akcjaNatywna()
      else if (typeof navigator.vibrate === 'function') navigator.vibrate(wzorzecWeb)
      else return false
      return true
    } catch {
      return false
    }
  }

  return {
    dostepna: () => czyAndroid || typeof navigator.vibrate === 'function',
    dotkniecie: () => wykonaj(() => Haptics.impact({ style: ImpactStyle.Light }), 12),
    sukces: () => wykonaj(() => Haptics.notification({ type: NotificationType.Success }), [20, 40, 20]),
    ostrzezenie: () => wykonaj(() => Haptics.notification({ type: NotificationType.Warning }), [35, 45, 35]),
  }
}
