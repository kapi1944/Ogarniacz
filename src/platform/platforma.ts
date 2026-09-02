import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
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

function dopasujPaskiSystemowe() {
  const styl = document.documentElement.dataset.motyw === 'ciemny'
    ? SystemBarsStyle.Dark
    : SystemBarsStyle.Light
  void SystemBars.setStyle({ style: styl }).catch(() => undefined)
}

export function inicjalizujPlatforme() {
  document.documentElement.dataset.platforma = platforma.rodzaj
  if (!czyAndroid) return Promise.resolve()

  dopasujPaskiSystemowe()
  new MutationObserver(dopasujPaskiSystemowe).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-motyw'],
  })

  inicjalizacjaPlatformy ??= Promise.all([
    uslugaPowiadomien.inicjalizuj(),
  ]).then(() => undefined)

  return inicjalizacjaPlatformy
}
