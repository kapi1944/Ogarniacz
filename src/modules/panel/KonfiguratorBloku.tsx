import { useState } from 'react'
import { definicjaBloku, type BlokKokpitu } from '../../domain/kokpit'
import { obliczKontrast, wybierzCzytelnyTekst } from '../../domain/personalizacja'

const presety = [
  ['Szmaragdowy', '#124638'], ['Grafitowy', '#30383d'], ['Antracytowy', '#212424'],
  ['Granatowy', '#172846'], ['Burgundowy', '#501b2e'], ['Szampańskie złoto', '#e8d2a4'],
  ['Neutralny jasny', '#f1f3f2'], ['Neutralny ciemny', '#171c1b'],
]

export function SuwakKokpitu({ etykieta, min, max, wartosc, zmien }: {
  etykieta: string; min: number; max: number; wartosc: number; zmien: (liczba: number) => void
}) {
  const [robocza, ustawRobocza] = useState<number>()
  return <label>{etykieta} <output>{robocza ?? wartosc}</output><input type="range" min={min} max={max} value={robocza ?? wartosc}
    onChange={(zdarzenie) => ustawRobocza(Number(zdarzenie.target.value))}
    onBlur={() => { if (robocza !== undefined) zmien(robocza); ustawRobocza(undefined) }}
    onPointerUp={(zdarzenie) => { const nowa = Number(zdarzenie.currentTarget.value); if (nowa !== wartosc) zmien(nowa); ustawRobocza(undefined) }}
    onKeyUp={() => { if (robocza !== undefined) zmien(robocza); ustawRobocza(undefined) }} /></label>
}

function PoleKoloru({ nazwa, kolor, zmien }: { nazwa: string; kolor: string; zmien: (kolor: string) => void }) {
  const [szkic, ustawSzkic] = useState(kolor)
  const poprawny = /^#[\da-f]{6}$/i.test(szkic)
  return <div className="kokpit__kolor">
    <label>{nazwa}<input type="color" value={kolor} onChange={(zdarzenie) => { zmien(zdarzenie.target.value); ustawSzkic(zdarzenie.target.value) }} /></label>
    <label>{nazwa} HEX<input value={szkic} maxLength={7} aria-invalid={!poprawny} onChange={(zdarzenie) => ustawSzkic(zdarzenie.target.value)}
      onBlur={() => { if (poprawny && kolor !== szkic) zmien(szkic) }} /></label>
    {!poprawny && <small role="alert">Wpisz kolor w formacie #RRGGBB.</small>}
  </div>
}

export function KonfiguratorBloku({ blok, zmien, usun, duplikuj }: {
  blok: BlokKokpitu; zmien: (blok: BlokKokpitu) => void; usun: () => void; duplikuj: () => void
}) {
  const { wyglad } = blok
  const ustawWyglad = (zmiana: Partial<BlokKokpitu['wyglad']>) => zmien({ ...blok, wyglad: { ...wyglad, ...zmiana } })
  const tlo = wyglad.tlo ?? '#124638'
  const tekst = wyglad.tekst ?? wybierzCzytelnyTekst(tlo)
  const ramka = wyglad.obramowanie ?? '#bd9d61'
  const suwaki = [
    ['Jasność tła', 'jasnosc', 25, 175, 100], ['Krycie tła', 'krycie', 0, 100, 100],
    ['Rozmiar tytułu', 'tytul', 12, 40, 16], ['Tekst pomocniczy', 'opis', 12, 36, 14],
    ['Grubość obramowania (px)', 'grubosc', 0, 8, 1], ['Krycie obramowania', 'krycieRamki', 0, 100, 100],
    ['Promień narożników', 'promien', 0, 40, 12], ['Odstęp wewnętrzny', 'odstep', 0, 32, 12],
  ] as const
  const pozycje = [
    ['Lewo', { x: blok.x - 1 }], ['Prawo', { x: blok.x + 1 }], ['Góra', { y: blok.y - 1 }], ['Dół', { y: blok.y + 1 }],
    ['Szerszy', { szerokosc: blok.szerokosc + 1 }], ['Węższy', { szerokosc: blok.szerokosc - 1 }],
    ['Wyższy', { wysokosc: blok.wysokosc + 1 }], ['Niższy', { wysokosc: blok.wysokosc - 1 }],
  ] as const
  return <fieldset className="kokpit__ustawienia">
    <legend>{definicjaBloku(blok.typ)?.nazwa ?? 'Nieznany blok'} · ustawienia bloku</legend>
    <div className="kokpit__akcje">
      {pozycje.map(([nazwa, zmiana]) => <button key={nazwa} type="button" className="przycisk" onClick={() => zmien({ ...blok, ...zmiana })}>{nazwa}</button>)}
      <button type="button" className="przycisk" onClick={duplikuj}>Duplikuj blok</button>
      <button type="button" className="przycisk" onClick={() => zmien({ ...blok, widocznosc: blok.widocznosc === 'ukryty' ? 'zawsze' : 'ukryty' })}>{blok.widocznosc === 'ukryty' ? 'Pokaż blok' : 'Ukryj blok'}</button>
      <button type="button" className="przycisk" onClick={usun}>Usuń blok</button>
    </div>
    <p>Pozycja {blok.x + 1}, {blok.y + 1} · {blok.szerokosc} × {blok.wysokosc}</p>
    <div className="kokpit__pola">
      <label>Widoczność bloku<select value={blok.widocznosc} onChange={(zdarzenie) => zmien({ ...blok, widocznosc: zdarzenie.target.value as BlokKokpitu['widocznosc'] })}>
        <option value="zawsze">Zawsze</option><option value="publiczny">Tylko publicznie</option><option value="prywatny">Tylko prywatnie</option><option value="ukryty">Ukryty</option>
      </select></label>
      <label>Paleta<select value="" onChange={(zdarzenie) => {
        const kolor = zdarzenie.target.value
        if (kolor) ustawWyglad({ tlo: kolor, tekst: wybierzCzytelnyTekst(kolor) })
      }}><option value="">Wybierz preset</option>{presety.map(([nazwa, kolor]) => <option key={kolor} value={kolor}>{nazwa}</option>)}</select></label>
      <PoleKoloru key={`tlo-${tlo}`} nazwa="Tło" kolor={tlo} zmien={(tlo) => ustawWyglad({ tlo })} />
      <PoleKoloru key={`tekst-${tekst}`} nazwa="Tekst" kolor={tekst} zmien={(tekst) => ustawWyglad({ tekst })} />
      <PoleKoloru key={`ramka-${ramka}`} nazwa="Ramka" kolor={ramka} zmien={(obramowanie) => ustawWyglad({ obramowanie })} />
      <label>Wyrównanie<select value={wyglad.wyrownanie ?? 'left'} onChange={(zdarzenie) => ustawWyglad({ wyrownanie: zdarzenie.target.value as BlokKokpitu['wyglad']['wyrownanie'] })}>
        <option value="left">Do lewej</option><option value="center">Na środku</option><option value="right">Do prawej</option>
      </select></label>
      <label><input type="checkbox" checked={wyglad.pokazTytul !== false} onChange={(zdarzenie) => ustawWyglad({ pokazTytul: zdarzenie.target.checked })} /> Pokaż tytuł</label>
      {suwaki.map(([nazwa, klucz, min, max, domyslna]) => <SuwakKokpitu key={klucz} etykieta={nazwa} min={min} max={max} wartosc={wyglad[klucz] ?? domyslna} zmien={(wartosc) => ustawWyglad({ [klucz]: wartosc })} />)}
      {['zegar', 'data', 'finanse'].includes(blok.typ) && <SuwakKokpitu etykieta="Rozmiar wartości" min={16} max={120} wartosc={wyglad.wartosc ?? 32} zmien={(wartosc) => ustawWyglad({ wartosc })} />}
    </div>
    {obliczKontrast(tlo, tekst) < 4.5 && <p role="status">Niski kontrast tekstu. <button type="button" className="przycisk" onClick={() => ustawWyglad({ tekst: wybierzCzytelnyTekst(tlo) })}>Użyj czytelniejszego koloru</button></p>}
  </fieldset>
}
