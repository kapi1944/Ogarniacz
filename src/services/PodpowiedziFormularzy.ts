export function normalizujTekstPodpowiedzi(tekst: string): string {
  return tekst.normalize('NFD').replace(/\p{M}/gu, '').replace(/[łŁ]/g, 'l').toLocaleLowerCase('pl').trim().replace(/\s+/g, ' ')
}

export function dopasujPodpowiedzi(propozycje: readonly string[], tekst: string): string[] {
  const fraza = normalizujTekstPodpowiedzi(tekst)
  const unikalne = new Map<string, string>()
  for (const propozycja of propozycje) {
    const klucz = normalizujTekstPodpowiedzi(propozycja)
    if (klucz && klucz.includes(fraza) && !unikalne.has(klucz)) unikalne.set(klucz, propozycja.trim().replace(/\s+/g, ' '))
  }
  return [...unikalne.values()].sort((pierwsza, druga) => pierwsza.localeCompare(druga, 'pl'))
}
