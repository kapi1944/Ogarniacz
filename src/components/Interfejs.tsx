import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, X } from 'lucide-react'

export function NaglowekWidoku({ tytul, opis, akcje }: { tytul: string; opis?: string; akcje?: ReactNode }) {
  return (
    <header className="naglowek-widoku">
      <div>
        <h1>{tytul}</h1>
        {opis && <p>{opis}</p>}
      </div>
      {akcje && <div className="naglowek-widoku__akcje">{akcje}</div>}
    </header>
  )
}

export function Karta({ children, klasa = '' }: { children: ReactNode; klasa?: string }) {
  return <section className={`karta ${klasa}`}>{children}</section>
}

export function PustyStan({ tytul, opis, akcja }: { tytul: string; opis: string; akcja?: ReactNode }) {
  return (
    <div className="pusty-stan">
      <Inbox aria-hidden="true" />
      <strong>{tytul}</strong>
      <span>{opis}</span>
      {akcja}
    </div>
  )
}

export function Znacznik({ children, wariant = 'neutralny' }: { children: ReactNode; wariant?: 'neutralny' | 'sukces' | 'ostrzezenie' | 'blad' | 'informacja' }) {
  return <span className={`znacznik znacznik--${wariant}`}>{children}</span>
}

export function Modal({ tytul, opis, children, zamknij, szeroki = false }: { tytul: string; opis?: string; children: ReactNode; zamknij: () => void; szeroki?: boolean }) {
  return (
    <div className="modal-tlo" role="presentation" onMouseDown={(zdarzenie) => zdarzenie.target === zdarzenie.currentTarget && zamknij()}>
      <section className={`modal ${szeroki ? 'modal--szeroki' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-tytul">
        <header className="modal__naglowek">
          <div>
            <h2 id="modal-tytul">{tytul}</h2>
            {opis && <p>{opis}</p>}
          </div>
          <button type="button" className="przycisk-ikona" onClick={zamknij} title="Zamknij">
            <X aria-hidden="true" />
            <span className="sr-only">Zamknij</span>
          </button>
        </header>
        <div className="modal__tresc">{children}</div>
      </section>
    </div>
  )
}

export function ModalPotwierdzenia({ tytul, opis, etykietaAkcji = 'Potwierdz', niebezpieczne = false, potwierdz, anuluj }: { tytul: string; opis: string; etykietaAkcji?: string; niebezpieczne?: boolean; potwierdz: () => void | Promise<void>; anuluj: () => void }) {
  return (
    <Modal tytul={tytul} zamknij={anuluj}>
      <div className="ostrzezenie-modal">
        <AlertTriangle aria-hidden="true" />
        <p>{opis}</p>
      </div>
      <div className="akcje-formularza">
        <button type="button" className="przycisk przycisk--drugorzedny" onClick={anuluj}>Anuluj</button>
        <button type="button" className={`przycisk ${niebezpieczne ? 'przycisk--niebezpieczny' : 'przycisk--glowny'}`} onClick={potwierdz}>{etykietaAkcji}</button>
      </div>
    </Modal>
  )
}

export function Komunikat({ typ = 'informacja', children }: { typ?: 'informacja' | 'sukces' | 'blad'; children: ReactNode }) {
  return <div className={`komunikat komunikat--${typ}`} role={typ === 'blad' ? 'alert' : 'status'}>{children}</div>
}
