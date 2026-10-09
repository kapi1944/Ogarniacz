import { RefreshCw } from 'lucide-react'

export function PowiadomienieAktualizacji({ opis, aktualizuj, odloz }: { opis: string; aktualizuj: () => void; odloz: () => void }) {
  return <aside className="komunikat-pwa" role="status" aria-live="polite">
    <div><strong>Nowa wersja Ogarniacza jest dostępna</strong><span>{opis} Zapisz rozpoczętą pracę przed aktualizacją.</span></div>
    <div className="akcje-formularza">
      <button type="button" className="przycisk przycisk--glowny" onClick={aktualizuj}><RefreshCw aria-hidden="true" />Zaktualizuj</button>
      <button type="button" className="przycisk przycisk--drugorzedny" onClick={odloz}>Później</button>
    </div>
  </aside>
}
