import type { JednostkaLeku, PostacLeku } from '../domain/typy'

export interface KandydatOcr<T> {
  wartosc?: T
  pewne: boolean
}

export interface WynikOcrLeku {
  nazwa: KandydatOcr<string>
  moc: KandydatOcr<string>
  postac: KandydatOcr<PostacLeku>
  opakowanie: KandydatOcr<{ ilosc: number; jednostka: JednostkaLeku }>
  surowyTekst: string
}

const postacie: { wyrazenie: RegExp; wartosc: PostacLeku }[] = [
  { wyrazenie: /tablet\w*\s+powlekan\w*/i, wartosc: 'tabletka_powlekana' },
  { wyrazenie: /tablet\w*/i, wartosc: 'tabletka' },
  { wyrazenie: /kapsu(?:ł|l)\w*/i, wartosc: 'kapsulka' },
  { wyrazenie: /syrop\w*/i, wartosc: 'syrop' },
  { wyrazenie: /zawiesin\w*/i, wartosc: 'zawiesina' },
  { wyrazenie: /kropl\w*/i, wartosc: 'krople' },
  { wyrazenie: /aerozol\w*/i, wartosc: 'aerozol' },
  { wyrazenie: /inhalacj\w*/i, wartosc: 'inhalacja' },
  { wyrazenie: /saszet\w*/i, wartosc: 'saszetka' },
  { wyrazenie: /prosz\w*/i, wartosc: 'proszek' },
  { wyrazenie: /roztwor\w*|roztwór\w*/i, wartosc: 'roztwor' },
  { wyrazenie: /maś?c\w*/i, wartosc: 'masc' },
  { wyrazenie: /krem\w*/i, wartosc: 'krem' },
  { wyrazenie: /ż?el\w*/i, wartosc: 'zel' },
  { wyrazenie: /czopk\w*/i, wartosc: 'czopek' },
  { wyrazenie: /plastr\w*/i, wartosc: 'plaster' },
  { wyrazenie: /ampuł?k\w*/i, wartosc: 'ampulka' },
  { wyrazenie: /fiolk\w*/i, wartosc: 'fiolka' },
]

function oczyscTekst(tekst: string): string {
  return tekst.replace(/\s+/g, ' ').trim()
}

function rozpoznajMoc(tekst: string): KandydatOcr<string> {
  const dopasowanie = tekst.match(/\b\d+(?:[,.]\d+)?\s*(?:mg|µg|ug|g)(?:\s*\+\s*\d+(?:[,.]\d+)?\s*(?:mg|µg|ug|g))?(?:\s*\/\s*(?:ml|dawk[aeę]))?/i)
  return { wartosc: dopasowanie?.[0]?.replace(/\s*\/\s*/, '/') ?? undefined, pewne: Boolean(dopasowanie) }
}

function rozpoznajPostac(tekst: string): KandydatOcr<PostacLeku> {
  const postac = postacie.find(({ wyrazenie }) => wyrazenie.test(tekst))?.wartosc
  return { wartosc: postac, pewne: Boolean(postac) }
}

function rozpoznajOpakowanie(tekst: string): KandydatOcr<{ ilosc: number; jednostka: JednostkaLeku }> {
  const dopasowanie = tekst.match(/\b(\d+(?:[,.]\d+)?)\s*(tablet\w*|kapsu(?:ł|l)\w*|saszet\w*|ampu(?:ł|l)\w*|fiolk\w*|czopk\w*|plastr\w*|dawek?|ml)\b/i)
  if (!dopasowanie) return { pewne: false }
  const ilosc = Number(dopasowanie[1]?.replace(',', '.'))
  if (!Number.isFinite(ilosc) || ilosc <= 0) return { pewne: false }
  const jednostka: JednostkaLeku = /^ml$/i.test(dopasowanie[2] ?? '') ? 'ml' : /^dawek?/i.test(dopasowanie[2] ?? '') ? 'dawka' : 'szt.'
  return { wartosc: { ilosc, jednostka }, pewne: true }
}

function rozpoznajNazwe(tekst: string): KandydatOcr<string> {
  const granica = [
    tekst.search(/\b\d+(?:[,.]\d+)?\s*(?:mg|µg|ug|g|ml)\b/i),
    tekst.search(/\b\d+\s*(?:tablet\w*|kapsu(?:ł|l)\w*|saszet\w*|ampu(?:ł|l)\w*|fiolk\w*|czopk\w*|plastr\w*|dawek?|ml)\b/i),
    ...postacie.map(({ wyrazenie }) => tekst.search(wyrazenie)),
  ].filter((indeks) => indeks >= 0).sort((a, b) => a - b)[0]
  const nazwa = oczyscTekst((granica === undefined ? tekst : tekst.slice(0, granica)).replace(/[|,:;]+$/g, ''))
  return { wartosc: nazwa || undefined, pewne: Boolean(nazwa) }
}

/** Nie interpretuje dawkowania: moc i opakowanie są niezależnymi kandydatami. */
export function parsujTekstOcrLeku(surowyTekst: string): WynikOcrLeku {
  const tekst = oczyscTekst(surowyTekst)
  return {
    nazwa: rozpoznajNazwe(tekst),
    moc: rozpoznajMoc(tekst),
    postac: rozpoznajPostac(tekst),
    opakowanie: rozpoznajOpakowanie(tekst),
    surowyTekst,
  }
}
