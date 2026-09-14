import { Camera, CameraDirection } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { Script, TextRecognition } from '@capacitor-mlkit/text-recognition'
import { parsujTekstOcrLeku, type WynikOcrLeku } from './LekiOcrParser'

export interface DostawcaOcrLekow {
  czyDostepny(): boolean
  zeskanujOpakowanie(): Promise<WynikOcrLeku>
}

export function czyOcrLekowDostepny(): boolean {
  return Capacitor.isNativePlatform() && ['android', 'ios'].includes(Capacitor.getPlatform())
}

export const ocrLekow: DostawcaOcrLekow = {
  czyDostepny: czyOcrLekowDostepny,
  async zeskanujOpakowanie() {
    if (!czyOcrLekowDostepny()) throw new Error('Skanowanie opakowania jest dostępne tylko w aplikacji mobilnej.')
    const zdjecie = await Camera.takePhoto({ quality: 90, cameraDirection: CameraDirection.Rear, targetWidth: 1920, targetHeight: 1080 })
    if (!zdjecie.uri) throw new Error('Nie udało się odczytać zdjęcia opakowania.')
    const wynik = await TextRecognition.processImage({ path: zdjecie.uri, script: Script.Latin })
    return parsujTekstOcrLeku(wynik.text)
  },
}
