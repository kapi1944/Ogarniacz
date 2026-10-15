import { cleanup as wyczysc, fireEvent as wywolaj, render as renderuj, screen as ekran } from '@testing-library/react'
import { afterEach as poKazdym, beforeEach as przedKazdym, expect as oczekuj, it as sprawdz, vi } from 'vitest'
import { SekcjaDom } from './SekcjaDom'
import { useKonto } from '../../app/DostawcaKonta'
import { pobierzStanDomu, sterujDomem } from '../../services/KontaService'

vi.mock('../../app/DostawcaKonta', () => ({ useKonto: vi.fn() }))
vi.mock('../../services/KontaService', async (oryginal) => ({ ...await oryginal<typeof import('../../services/KontaService')>(), pobierzStanDomu: vi.fn(), sterujDomem: vi.fn() }))

przedKazdym(() => {
  vi.clearAllMocks()
  vi.mocked(useKonto).mockReturnValue({ offline: false, konto: { uzytkownikId: 'w', wlascicielId: 'w', rola: 'wlasciciel' } as ReturnType<typeof useKonto>['konto'] })
  vi.mocked(pobierzStanDomu).mockResolvedValue({ skonfigurowany: true, dostepny: true, encje: [
    { id: 'light.salon', nazwa: 'Salon', stan: 'off', dostepna: true, akcje: ['wlacz', 'wylacz'] },
    { id: 'sensor.temperatura', nazwa: 'Temperatura', stan: '21', jednostka: '°C', dostepna: true, akcje: [] },
  ] })
  vi.mocked(sterujDomem).mockResolvedValue(undefined)
})
poKazdym(wyczysc)

sprawdz('odczytuje wybrane urządzenia na żądanie, a steruje dopiero po potwierdzeniu', async () => {
  renderuj(<SekcjaDom />)
  oczekuj(pobierzStanDomu).not.toHaveBeenCalled()
  wywolaj.click(ekran.getByRole('button', { name: /Sprawdź połączenie/ }))
  oczekuj(await ekran.findByText('Temperatura')).toBeInTheDocument()
  oczekuj(ekran.getByText(/21 °C/)).toBeInTheDocument()
  oczekuj(ekran.queryByRole('button', { name: 'Włącz: Temperatura' })).not.toBeInTheDocument()
  wywolaj.click(ekran.getByRole('button', { name: 'Włącz: Salon' }))
  oczekuj(sterujDomem).not.toHaveBeenCalled()
  wywolaj.click(ekran.getByRole('button', { name: 'Anuluj' }))
  oczekuj(sterujDomem).not.toHaveBeenCalled()
  wywolaj.click(ekran.getByRole('button', { name: 'Włącz: Salon' }))
  wywolaj.click(ekran.getByRole('button', { name: 'Potwierdz' }))
  await ekran.findByText('Temperatura')
  oczekuj(sterujDomem).toHaveBeenCalledExactlyOnceWith('light.salon', 'wlacz')
  oczekuj(pobierzStanDomu).toHaveBeenCalledTimes(2)
})

sprawdz.each([
  { offline: false }, { offline: true, konto: { rola: 'wlasciciel' } }, { offline: false, konto: { rola: 'edytor' } },
])('nie udostępnia odczytu bez sesji właściciela online: %j', (kontekst) => {
  vi.mocked(useKonto).mockReturnValue(kontekst as ReturnType<typeof useKonto>)
  renderuj(<SekcjaDom />)
  oczekuj(ekran.queryByRole('button')).not.toBeInTheDocument()
  oczekuj(pobierzStanDomu).not.toHaveBeenCalled()
})

sprawdz.each([
  [{ skonfigurowany: false, dostepny: false, encje: [] }, /nie jest skonfigurowany/],
  [{ skonfigurowany: true, dostepny: false, encje: [] }, /jest niedostępny/],
] as const)('pokazuje brak konfiguracji lub połączenia: %j', async (stan, tekst) => {
  vi.mocked(pobierzStanDomu).mockResolvedValue({ ...stan, encje: [] })
  renderuj(<SekcjaDom />)
  wywolaj.click(ekran.getByRole('button', { name: /Sprawdź połączenie/ }))
  oczekuj(await ekran.findByText(tekst)).toBeInTheDocument()
  oczekuj(ekran.queryByRole('button', { name: /^Włącz:/ })).not.toBeInTheDocument()
})

sprawdz('po błędzie usuwa stany i nie ponawia polecenia automatycznie', async () => {
  vi.mocked(sterujDomem).mockRejectedValue(new Error('błąd transportu'))
  renderuj(<SekcjaDom />)
  wywolaj.click(ekran.getByRole('button', { name: /Sprawdź połączenie/ }))
  wywolaj.click(await ekran.findByRole('button', { name: 'Włącz: Salon' }))
  wywolaj.click(ekran.getByRole('button', { name: 'Potwierdz' }))
  oczekuj(await ekran.findByRole('alert')).toBeInTheDocument()
  oczekuj(ekran.queryByText('Temperatura')).not.toBeInTheDocument()
  oczekuj(sterujDomem).toHaveBeenCalledTimes(1)
})
