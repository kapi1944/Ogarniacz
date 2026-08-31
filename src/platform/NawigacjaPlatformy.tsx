import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useObslugaWstecz } from './obslugaWstecz'

export function NawigacjaPlatformy() {
  const polozenie = useLocation()
  const nawiguj = useNavigate()
  const historia = useRef([polozenie.key])

  useEffect(() => {
    if (historia.current.at(-1) !== polozenie.key) historia.current.push(polozenie.key)
  }, [polozenie.key])

  useObslugaWstecz(polozenie.pathname !== '/', () => {
    if (historia.current.length > 1) {
      historia.current.pop()
      nawiguj(-1)
      return
    }
    nawiguj('/', { replace: true })
  }, 10)

  return null
}
