import { Capacitor } from '@capacitor/core'
import { utworzUslugePlikow } from './FileService'
import { utworzUslugeHaptyki } from './HapticsService'
import { utworzUslugeCykluZycia } from './LifecycleService'
import { utworzUslugePowiadomien } from './NotificationService'
import { utworzUslugeUdostepniania } from './ShareService'
import { utworzMostMigawekWidgetow } from './WidgetBridgeService'
import type { PlatformaOgarniacza } from './typy'

const czyAndroid = Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform()
const uslugaPowiadomien = utworzUslugePowiadomien(czyAndroid)

export const platforma: PlatformaOgarniacza = {
  rodzaj: czyAndroid ? 'android' : 'web',
  natywna: czyAndroid,
  cyklZycia: utworzUslugeCykluZycia(czyAndroid),
  powiadomienia: uslugaPowiadomien,
  pliki: utworzUslugePlikow(czyAndroid),
  udostepnianie: utworzUslugeUdostepniania(czyAndroid),
  haptyka: utworzUslugeHaptyki(czyAndroid),
  migawkiWidgetow: utworzMostMigawekWidgetow(czyAndroid),
}

let inicjalizacjaPlatformy: Promise<void> | undefined

export function inicjalizujPlatforme() {
  document.documentElement.dataset.platforma = platforma.rodzaj
  if (!czyAndroid) return Promise.resolve()

  inicjalizacjaPlatformy ??= Promise.all([
    uslugaPowiadomien.inicjalizuj(),
  ]).then(() => undefined)

  return inicjalizacjaPlatformy
}
