import { describe, expect, it } from 'vitest'
import { odtworzWartoscZTransportu, przygotujWartoscDoTransportu } from './BackupService'

describe('kodowanie plików w kopii zapasowej', () => {
  it('odtwarza bajt po bajcie plik o rozmiarze niepodzielnym przez 3 i większym niż porcja kodowania', async () => {
    const bajty = Uint8Array.from({ length: 0x8000 * 2 + 5 }, (_, indeks) => (indeks * 31 + 7) % 256)
    const przygotowane = await przygotujWartoscDoTransportu({ plik: new Blob([bajty], { type: 'application/pdf' }) })
    const odtworzone = odtworzWartoscZTransportu(przygotowane) as { plik: Blob }
    expect(odtworzone.plik.type).toBe('application/pdf')
    expect(new Uint8Array(await odtworzone.plik.arrayBuffer())).toEqual(bajty)
  })

  it('odrzuca niepoprawne dane pliku', () => {
    expect(() => odtworzWartoscZTransportu({ __ogarniaczBlob: true, mimeType: 'x', base64: 'AB$D' })).toThrow('niepoprawne dane pliku')
  })
})
