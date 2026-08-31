import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'

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
  return {
    async zapisz(nazwa: string, dane: Blob) {
      try {
        if (!czyAndroid) return zapiszWPrzegladarce(nazwa, dane)
        await Filesystem.writeFile({
          path: `Ogarniacz/${nazwa}`,
          data: await dane.text(),
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        })
        return true
      } catch {
        return false
      }
    },
    async zapiszTymczasowo(nazwa: string, dane: Blob) {
      if (!czyAndroid) return undefined
      try {
        const wynik = await Filesystem.writeFile({
          path: nazwa,
          data: await dane.text(),
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        })
        return wynik.uri
      } catch {
        return undefined
      }
    },
  }
}
