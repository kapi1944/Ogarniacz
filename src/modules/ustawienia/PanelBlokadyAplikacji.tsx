import { registerPlugin } from '@capacitor/core'
import { useState } from 'react'
import { Karta } from '../../components/Interfejs'
import { platforma } from '../../platform/platforma'

const blokada = registerPlugin<{ otworzUstawienia(): Promise<void> }>('BlokadaAplikacji')

export function PanelBlokadyAplikacji() {
  const [blad, ustawBlad] = useState('')
  if (platforma.rodzaj !== 'android') return null
  return <Karta><h2>Blokada aplikacji</h2><p>Opcjonalny PIN lub hasło na tym urządzeniu. Działa offline i zachowuje zalogowane konto.</p><button className="przycisk" onClick={() => { ustawBlad(''); void blokada.otworzUstawienia().catch(() => ustawBlad('Nie udało się otworzyć ustawień blokady.')) }}>Konfiguruj blokadę aplikacji</button>{blad && <p role="alert">{blad}</p>}</Karta>
}
