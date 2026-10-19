import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { eksportPlikuAndroid, type WynikZapisuPliku } from './EksportPlikuAndroid'

function zapiszWPrzegladarce(nazwa: string, dane: Blob) {
  const adres = URL.createObjectURL(dane)
  const odnosnik = document.createElement('a')
  odnosnik.href = adres
  odnosnik.download = nazwa
  odnosnik.click()
  URL.revokeObjectURL(adres)
  return true
}

export function utworzUslugePlikow(czyAndroid: boolean) {
  const zapiszZWynikiem = async (nazwa: string, dane: Blob): Promise<WynikZapisuPliku> => {
    try {
      if (!czyAndroid) {
        zapiszWPrzegladarce(nazwa, dane)
        return { status: 'pobieranie' }
      }
      return await eksportPlikuAndroid.zapisz({ nazwa, tekst: await dane.text(), typ: dane.type?.split(';')[0] || 'application/json' })
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
