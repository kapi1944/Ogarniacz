import { Component, useEffect, useState, type ReactNode } from 'react'

export class GranicaBledu extends Component<{ children: ReactNode }, { blad: boolean }> {
  state = { blad: false }

  static getDerivedStateFromError() { return { blad: true } }

  render() {
    if (!this.state.blad) return this.props.children
    return <section className="karta" role="alert">
      <h1>Nie udało się wyświetlić tego widoku</h1>
      <p>Spróbuj ponownie lub wybierz inny moduł. Zapisane dane pozostają na urządzeniu.</p>
      <button className="przycisk" onClick={() => this.setState({ blad: false })}>Spróbuj ponownie</button>
      <button className="przycisk" onClick={() => window.location.reload()}>Odśwież aplikację</button>
    </section>
  }
}

/** Błędy sieci i anulowania w tle (synchronizacja, sprawdzanie aktualizacji) nie oznaczają porażki operacji użytkownika. */
export function czyBladTla(powod: unknown): boolean {
  if (!powod || typeof powod !== 'object') return false
  const { name, message } = powod as { name?: unknown; message?: unknown }
  if (name === 'AbortError') return true
  return name === 'TypeError' && typeof message === 'string' && /failed to fetch|load failed|networkerror|network request failed/i.test(message)
}

export function KomunikatBleduAsynchronicznego() {
  const [blad, ustawBlad] = useState(false)
  useEffect(() => {
    const pokazBlad = (zdarzenie: Event) => {
      const powod = (zdarzenie as PromiseRejectionEvent).reason
      if (czyBladTla(powod)) {
        console.warn('Pominięto błąd w tle:', powod)
        return
      }
      ustawBlad(true)
    }
    window.addEventListener('unhandledrejection', pokazBlad)
    return () => window.removeEventListener('unhandledrejection', pokazBlad)
  }, [])
  return blad ? <div className="karta" role="alert">
    <p>Nie udało się zakończyć operacji. Sprawdź jej wynik przed ponowieniem.</p>
    <button className="przycisk" onClick={() => ustawBlad(false)}>Zamknij komunikat</button>
  </div> : null
}
