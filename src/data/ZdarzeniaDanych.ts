import type { NazwaTabeli } from '../domain/typy'

type ObslugaZmianyDanych = (tabela: NazwaTabeli) => void

const obslugi = new Set<ObslugaZmianyDanych>()

export function powiadomOZmianieDanych(tabela: NazwaTabeli): void {
  for (const obsluga of obslugi) obsluga(tabela)
}

export function nasluchujZmianDanych(obsluga: ObslugaZmianyDanych): () => void {
  obslugi.add(obsluga)
  return () => obslugi.delete(obsluga)
}
