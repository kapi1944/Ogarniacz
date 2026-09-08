import { useEffect } from 'react'
import { platforma } from '../platform/platforma'

export function PotwierdzenieGotowosciBundle() {
  useEffect(() => {
    void platforma.aktualizacjeWeb.potwierdzGotowoscBundle()
  }, [])
  return null
}
