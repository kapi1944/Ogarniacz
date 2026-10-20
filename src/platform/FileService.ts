import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { eksportPlikuAndroid, type WynikZapisuPliku } from './EksportPlikuAndroid'

function zapiszWPrzegladarce(nazwa: string, dane: Blob) {
  const adres = URL.createObjectURL(dane)
  const odnosnik = document.createElement('a')
  odnosnik.href = adres
  odnosnik.download = nazwa
  document.body.append(odnosnik)
  odnosnik.click()
  odnosnik.remove()
  window.setTimeout(() => URL.revokeObjectURL(adres), 30_000)
  return true
}

export function utworzUslugePlikow(czyAndroid: boolean) {
  const zapiszZWynikiem = async (nazwa: string, dane: Blob): Promise<WynikZapisuPliku> => {
    try {
      if (!czyAndroid) {
        zapiszWPrzegladarce(nazwa, dane)
        return { status: 'pobieranie' }
      }
      const typ = dane.type?.split(';')[0] || 'application/json'
      if (typ === 'application/json' || typ.startsWith('text/')) {
        return await eksportPlikuAndroid.zapisz({ nazwa, tekst: await dane.text(), typ })
      }
      if (dane.size > 32 * 1024 * 1024) return { status: 'blad' }
      const base64 = await new Promise<string>((rozwiaz, odrzuc) => {
        const czytnik = new FileReader()
        czytnik.onerror = () => odrzuc(new Error('Nie można odczytać pliku.'))
        czytnik.onload = () => typeof czytnik.result === 'string' ? rozwiaz(czytnik.result.split(',')[1]) : odrzuc(new Error('Nieprawidłowy plik.'))
        czytnik.readAsDataURL(dane)
      })
      return await eksportPlikuAndroid.zapisz({ nazwa, base64, typ })
    } catch {
      return { status: 'blad' }
    }
  }
  return {
    zapiszZWynikiem,
    async zapisz(nazwa: string, dane: Blob) {
      const wynik = await zapiszZWynikiem(nazwa, dane)
      return wynik.status === 'zapisano' || wynik.status === 'pobieranie'
    },
    async zapiszTymczasowo(nazwa: string, dane: Blob) {
      if (!czyAndroid) return undefined
      try {
        const wynik = await Filesystem.writeFile({
          path: `eksport/${crypto.randomUUID()}/${nazwa}`,
          data: await dane.text(),
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
          recursive: true,
        })
        return wynik.uri
      } catch {
        return undefined
      }
    },
  }
}
