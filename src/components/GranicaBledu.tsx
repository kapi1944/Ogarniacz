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

export function KomunikatBleduAsynchronicznego() {
  const [blad, ustawBlad] = useState(false)
  useEffect(() => {
    const pokazBlad = () => ustawBlad(true)
    window.addEventListener('unhandledrejection', pokazBlad)
    return () => window.removeEventListener('unhandledrejection', pokazBlad)
  }, [])
  return blad ? <div className="karta" role="alert">
    <p>Nie udało się zakończyć operacji. Sprawdź jej wynik przed ponowieniem.</p>
    <button className="przycisk" onClick={() => ustawBlad(false)}>Zamknij komunikat</button>
  </div> : null
}
