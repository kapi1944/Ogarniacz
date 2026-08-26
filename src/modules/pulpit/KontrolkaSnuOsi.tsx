import { useEffect, useState } from 'react'
import type { ZakresSnuDnia } from './logikaOsiCzasu'
import {
  przywrocDomyslnyZakresSnuOsi,
  zapiszZakresSnuOsi,
} from './ustawieniaSnuOsi'

export function KontrolkaSnuOsi({
  zakres,
  onChange,
}: {
  zakres: ZakresSnuDnia
  onChange: (zakres: ZakresSnuDnia) => void
}) {
  const [wersjaRobocza, ustawWersjeRobocza] = useState(zakres)

  useEffect(() => {
    ustawWersjeRobocza(zakres)
  }, [zakres])

  const zapisz = () => {
    const zapisanyZakres = zapiszZakresSnuOsi(wersjaRobocza)
    ustawWersjeRobocza(zapisanyZakres)
    onChange(zapisanyZakres)
  }

  const przywrocDomyslne = () => {
    const domyslnyZakres = przywrocDomyslnyZakresSnuOsi()
    ustawWersjeRobocza(domyslnyZakres)
    onChange(domyslnyZakres)
  }

  return (
    <div className="kontrolka-snu-osi">
      <div className="kontrolka-snu-osi__opis">
        <strong>Sen</strong>
        <span>Tylko ten odcinek osi jest skrócony do 50%.</span>
      </div>

      <label className="kontrolka-snu-osi__pole">
        <span>Od</span>
        <input
          type="time"
          value={wersjaRobocza.od}
          onChange={(event) => ustawWersjeRobocza((poprzedni) => ({
            ...poprzedni,
            od: event.target.value,
          }))}
          aria-label="Początek snu"
        />
      </label>

      <label className="kontrolka-snu-osi__pole">
        <span>Do</span>
        <input
          type="time"
          value={wersjaRobocza.do}
          onChange={(event) => ustawWersjeRobocza((poprzedni) => ({
            ...poprzedni,
            do: event.target.value,
          }))}
          aria-label="Koniec snu"
        />
      </label>

      <button
        type="button"
        className="przycisk przycisk--maly"
        onClick={zapisz}
      >
        Zapisz sen
      </button>

      <button
        type="button"
        className="przycisk przycisk--tekstowy"
        onClick={przywrocDomyslne}
      >
        22:30–06:30
      </button>
    </div>
  )
}
