import { useState } from 'react'
import { platforma } from '../../platform/platforma'
import { czySystemowePowiadomieniaSynchronizacjiWlaczone, ustawSystemowePowiadomieniaSynchronizacji } from '../../services/PowiadomieniaSynchronizacji'

export function UstawieniaPowiadomienSynchronizacji() {
  const [wlaczone, ustawWlaczone] = useState(czySystemowePowiadomieniaSynchronizacjiWlaczone)
  const [zajete, ustawZajete] = useState(false)
  const [komunikat, ustawKomunikat] = useState('')
  const zmien = async (wartosc: boolean) => {
    ustawZajete(true)
    ustawKomunikat('')
    try {
      if (wartosc && !await platforma.powiadomienia.poprosOUprawnienie()) {
        ustawKomunikat('Nie przyznano zgody. Komunikaty synchronizacji nadal są dostępne w aplikacji.')
        return
      }
      ustawSystemowePowiadomieniaSynchronizacji(wartosc)
      ustawWlaczone(wartosc)
    } catch {
      ustawKomunikat('Nie udało się zapisać ustawienia powiadomień na tym urządzeniu.')
    } finally { ustawZajete(false) }
  }
  return <div>
    <label className="ustawienie-wiersz"><span><strong>Systemowe powiadomienia synchronizacji</strong><small>Opcjonalne na tym urządzeniu. Domyślnie komunikaty są tylko w aplikacji. Nie zmienia powiadomień leków, wizyt ani przypomnień.</small></span>
      <input type="checkbox" checked={wlaczone} disabled={zajete} onChange={(zdarzenie) => void zmien(zdarzenie.target.checked)} />
    </label>
    {komunikat && <p role="status">{komunikat}</p>}
  </div>
}
