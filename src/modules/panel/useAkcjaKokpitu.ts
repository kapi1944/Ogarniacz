import { useEffect, useRef, useState } from 'react'
import { useAplikacja } from '../../app/KontekstAplikacji'
import type { NazwaModulu } from '../../domain/typy'
import { czyKontoZgodneZDanymiLokalnymi, pobierzSesjeKonta, type KontoUzytkownika } from '../../services/KontaService'
import { czySesjaPozwala } from '../../services/PrywatnoscKokpitu'

const aktywneAkcje = new Set<string>()

export function useAkcjaKokpitu(modul: NazwaModulu, sesja?: KontoUzytkownika) {
  const { moze, gotowyDostep } = useAplikacja()
  const [zajety, ustawZajety] = useState(false)
  const [blad, ustawBlad] = useState('')
  const mozna = gotowyDostep && sesja && moze(modul, 'edycja') && czySesjaPozwala(sesja, modul, 'edycja')
  const dostep = useRef(mozna)
  dostep.current = mozna
  const aktywny = useRef(false)
  useEffect(() => { aktywny.current = true; return () => { aktywny.current = false } }, [])
  const wykonaj = async (id: string, dzialanie: () => Promise<void>) => {
    const klucz = `${modul}:${id}`
    if (!sesja || !dostep.current || aktywneAkcje.has(klucz)) return
    aktywneAkcje.add(klucz)
    ustawZajety(true)
    ustawBlad('')
    try {
      const aktualna = await pobierzSesjeKonta()
      if (!aktywny.current || !dostep.current || aktualna.uzytkownikId !== sesja.uzytkownikId || aktualna.wlascicielId !== sesja.wlascicielId
        || !czySesjaPozwala(aktualna, modul, 'edycja') || !czyKontoZgodneZDanymiLokalnymi()) throw new Error('Brak dostępu.')
      await dzialanie()
    } catch {
      ustawBlad('Nie udało się wykonać akcji. Sprawdź sesję i spróbuj ponownie.')
    } finally {
      aktywneAkcje.delete(klucz)
      ustawZajety(false)
    }
  }
  return { mozna, zajety, blad, wykonaj }
}
