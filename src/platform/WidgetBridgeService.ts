import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'

const SCIEZKA_SNAPSHOTU_DZISIAJ = 'widget/today.json'

export function utworzMostMigawekWidgetow(czyAndroid: boolean) {
  return {
    dostepne: () => czyAndroid,
    async zapisz(dane: unknown): Promise<boolean> {
      if (!czyAndroid) return false
      try {
        await Filesystem.writeFile({
          path: SCIEZKA_SNAPSHOTU_DZISIAJ,
          data: JSON.stringify(dane),
          directory: Directory.Data,
          encoding: Encoding.UTF8,
          recursive: true,
        })
        return true
      } catch {
        return false
      }
    },
  }
}
