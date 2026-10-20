import { registerPlugin } from '@capacitor/core'

export type WynikZapisuPliku = { status: 'zapisano'; uri: string } | { status: 'anulowano' | 'blad' | 'pobieranie' }
export type WynikUdostepnieniaPliku = 'przekazano' | 'niepotwierdzone' | 'anulowano' | 'blad'

export const eksportPlikuAndroid = registerPlugin<{
  zapisz: (dane: { nazwa: string; typ: string } & ({ tekst: string } | { base64: string })) => Promise<WynikZapisuPliku>
  sprawdzZalacznik: (dane: { uri: string }) => Promise<{ uri: string; typ: string }>
}>('EksportPliku')
