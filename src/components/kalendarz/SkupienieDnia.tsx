import './kalendarz.css'
import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { obsluzWstecz, useObslugaWstecz } from '../../platform/obslugaWstecz'

export interface ZrodloSkupieniaDnia {
  element: HTMLButtonElement
  prostokat: DOMRect
}

export function SkupienieDnia({ tytul, zrodlo, zamknieto, children }: {
  tytul: string
  zrodlo: ZrodloSkupieniaDnia
  zamknieto: () => void
  children: (zamknij: (poZamknieciu?: () => void) => void) => ReactNode
}) {
  const identyfikator = useId()
  const okno = useRef<HTMLDialogElement>(null)
  const panel = useRef<HTMLElement>(null)
  const animacja = useRef<Animation | null>(null)
  const trwaZamykanie = useRef(false)
  const [faza, ustawFaze] = useState<'otwieranie' | 'otwarty' | 'zamykanie'>('otwieranie')
  const aktualneZamknieto = useRef(zamknieto)
  aktualneZamknieto.current = zamknieto

  const transformacjaZrodla = useCallback((prostokat?: DOMRect) => {
    const docelowy = panel.current!.getBoundingClientRect()
    const poczatkowy = prostokat ?? (zrodlo.element.isConnected ? zrodlo.element.getBoundingClientRect() : zrodlo.prostokat)
    return `translate(${poczatkowy.left - docelowy.left}px, ${poczatkowy.top - docelowy.top}px) scale(${poczatkowy.width / docelowy.width}, ${poczatkowy.height / docelowy.height})`
  }, [zrodlo])

  const zamknij = useCallback((poZamknieciu?: () => void) => {
    if (trwaZamykanie.current) return
    trwaZamykanie.current = true
    ustawFaze('zamykanie')
    const element = panel.current!
    const obecnaTransformacja = getComputedStyle(element).transform
    animacja.current?.cancel()
    const koniec = transformacjaZrodla()
    const zakoncz = () => {
      aktualneZamknieto.current()
      poZamknieciu?.()
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !element.animate) {
      zakoncz()
      return
    }
    animacja.current = element.animate([{ transform: obecnaTransformacja }, { transform: koniec }], {
      duration: 420, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'forwards',
    })
    void animacja.current.finished.then(zakoncz, () => undefined)
  }, [transformacjaZrodla])

  useObslugaWstecz(true, () => zamknij(), 80)

  useLayoutEffect(() => {
    const dialog = okno.current!
    const element = panel.current!
    dialog.showModal()
    const poprzedniePrzewijanie = document.body.style.overflow
    const poprzedniaWidocznosc = zrodlo.element.style.visibility
    document.body.style.overflow = 'hidden'
    zrodlo.element.style.visibility = 'hidden'
    const poczatek = transformacjaZrodla(zrodlo.prostokat)
    const ograniczonyRuch = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (ograniczonyRuch || !element.animate) ustawFaze('otwarty')
    else {
      animacja.current = element.animate([{ transform: poczatek }, { transform: 'none' }], {
        duration: 540, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards',
      })
      void animacja.current.finished.then(() => ustawFaze('otwarty'), () => undefined)
    }
    const ramka = requestAnimationFrame(() => dialog.classList.add('skupienie-dnia--widoczne'))
    return () => {
      cancelAnimationFrame(ramka)
      animacja.current?.cancel()
      dialog.close()
      document.body.style.overflow = poprzedniePrzewijanie
      zrodlo.element.style.visibility = poprzedniaWidocznosc
      if (zrodlo.element.isConnected) zrodlo.element.focus({ preventScroll: true })
    }
  }, [transformacjaZrodla, zrodlo])

  return createPortal(<dialog ref={okno} className="skupienie-dnia" data-faza={faza}
    role="dialog" aria-modal="true" aria-labelledby={identyfikator} onCancel={(zdarzenie) => { zdarzenie.preventDefault(); obsluzWstecz() }}
    onKeyDown={(zdarzenie) => { if (zdarzenie.key === 'Escape') { zdarzenie.preventDefault(); zdarzenie.stopPropagation(); obsluzWstecz() } }}
    onClick={(zdarzenie) => { if (zdarzenie.target === zdarzenie.currentTarget) zamknij() }}>
    <section ref={panel} className="skupienie-dnia__panel">
      <header className="skupienie-dnia__naglowek"><h2 id={identyfikator}>{tytul}</h2>
        <button type="button" className="przycisk-ikona" aria-label="Zamknij dzień" autoFocus onClick={() => zamknij()}><X aria-hidden="true" /></button>
      </header>
      <div className="skupienie-dnia__tresc" inert={faza !== 'otwarty'}>{children(zamknij)}</div>
    </section>
  </dialog>, document.body)
}
