import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

export function usePodswietlenie(liczbaElementow: number): void {
  const [parametry] = useSearchParams()
  const id = parametry.get('element')
  useEffect(() => {
    if (!id) return
    const element = Array.from(document.querySelectorAll<HTMLElement>('[data-element-id]')).find((kandydat) => kandydat.dataset.elementId === id)
    if (!element) return
    element.classList.add('rekord--podswietlony')
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const zegar = window.setTimeout(() => element.classList.remove('rekord--podswietlony'), 3000)
    return () => window.clearTimeout(zegar)
  }, [id, liczbaElementow])
}
