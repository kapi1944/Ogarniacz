import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ModalPotwierdzenia } from '../../components/Interfejs'
import { odrzucZmianeZKwarantanny, pobierzZmianyWKwarantannie, zwolnijZKwarantanny } from '../../data/KolejkaSynchronizacji'

const OPISY_POWODOW: Record<string, string> = {
  nieobslugiwana_tabela: 'serwer nie obsługuje jeszcze tej tabeli (zaktualizuj serwer)',
  niepoprawna_zmiana: 'serwer uznał dane za niepoprawne',
  niepoprawna_klasyfikacja: 'niepoprawna klasyfikacja dokumentu',
}

/**
 * Zmiany odrzucone przez serwer. Pokazuje wyłącznie tabelę i ID rekordu — bez treści.
 * „Ponów” przywraca zmianę do wysyłki; „Odrzuć” usuwa tylko wpis kolejki, rekord zostaje na urządzeniu.
 */
export function KwarantannaSynchronizacji({ ponowSynchronizacje }: { ponowSynchronizacje: () => Promise<void> }) {
  const zmiany = useLiveQuery(() => pobierzZmianyWKwarantannie(), [], [])
  const [doOdrzucenia, ustawDoOdrzucenia] = useState<string>()
  if (zmiany.length === 0) return null

  const ponow = async (ids?: string[]) => {
    await zwolnijZKwarantanny(ids)
    await ponowSynchronizacje()
  }

  return <div className="podglad-manifestu">
    <h3>Zmiany odrzucone przez serwer ({zmiany.length})</h3>
    <p className="tekst-pomocniczy">Pozostałe zmiany zsynchronizowano. Te dane nadal są zapisane na tym urządzeniu — nic nie zostało usunięte.</p>
    <ul className="lista-kompaktowa">
      {zmiany.map((zmiana) => <li key={zmiana.id}>
        <span>Tabela {zmiana.tabela}, rekord {zmiana.rekordId}: {OPISY_POWODOW[zmiana.kwarantanna?.powod ?? ''] ?? 'serwer odrzucił zmianę'}</span>
        <span>
          <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => void ponow([zmiana.id])}>Ponów</button>
          <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawDoOdrzucenia(zmiana.id)}>Odrzuć</button>
        </span>
      </li>)}
    </ul>
    {zmiany.length > 1 && <button type="button" className="przycisk przycisk--glowny" onClick={() => void ponow()}>Ponów wszystkie</button>}
    {doOdrzucenia && <ModalPotwierdzenia
      tytul="Odrzucić zmianę z kolejki?"
      opis="Zmiana nie zostanie wysłana na serwer. Rekord pozostanie na tym urządzeniu, ale inne urządzenia go nie otrzymają, dopóki nie zmienisz go ponownie."
      etykietaAkcji="Odrzuć zmianę"
      niebezpieczne
      anuluj={() => ustawDoOdrzucenia(undefined)}
      potwierdz={async () => { await odrzucZmianeZKwarantanny(doOdrzucenia); ustawDoOdrzucenia(undefined) }}
    />}
  </div>
}
