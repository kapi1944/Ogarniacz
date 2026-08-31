import { useEffect, useRef } from 'react'

interface WpisObslugiWstecz {
  identyfikator: number
  priorytet: number
  obsluz: () => boolean
}

const obslugiWstecz: WpisObslugiWstecz[] = []
let kolejnyIdentyfikator = 1

export function zarejestrujObslugeWstecz(obsluz: () => boolean, priorytet = 0) {
  const wpis = { identyfikator: kolejnyIdentyfikator++, priorytet, obsluz }
  obslugiWstecz.push(wpis)

  return () => {
    const indeks = obslugiWstecz.findIndex((element) => element.identyfikator === wpis.identyfikator)
    if (indeks >= 0) obslugiWstecz.splice(indeks, 1)
  }
}

export function obsluzWstecz() {
  const uporzadkowane = [...obslugiWstecz].sort((pierwsza, druga) =>
    druga.priorytet - pierwsza.priorytet || druga.identyfikator - pierwsza.identyfikator,
  )

  return uporzadkowane.some((wpis) => wpis.obsluz())
}

export function useObslugaWstecz(aktywna: boolean, obsluz: () => void, priorytet = 0) {
  const aktualnaObsluga = useRef(obsluz)
  aktualnaObsluga.current = obsluz

  useEffect(() => {
    if (!aktywna) return
    return zarejestrujObslugeWstecz(() => {
      aktualnaObsluga.current()
      return true
    }, priorytet)
  }, [aktywna, priorytet])
}
