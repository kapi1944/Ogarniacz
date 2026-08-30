import { useSearchParams } from 'react-router-dom'
import { WidokRejestru } from '../../components/WidokRejestru'
import { terazIso, utworzMetadane } from '../../domain/fabryki'
import type { Pojazd } from '../../domain/typy'
import { useRepozytorium } from '../../hooks/useRepozytorium'

export function WidokSamochodu() {
  const [parametry] = useSearchParams()
  const { dane: pojazdy, repozytorium } = useRepozytorium('pojazdy')
  return <WidokRejestru
    tytul="Samochód"
    opis="Najważniejsze dane pojazdu, przebieg i realne terminy eksploatacyjne."
    etykietaDodawania="Dodaj pojazd"
    dane={pojazdy}
    repozytorium={repozytorium}
    wybranyElementId={parametry.get('element') ?? undefined}
    pola={[
      { klucz: 'nazwa', etykieta: 'Pojazd', wymagane: true },
      { klucz: 'przebieg', etykieta: 'Przebieg (km)', typ: 'number', min: 0 },
      { klucz: 'ocDo', etykieta: 'OC / polisa do', typ: 'date' },
      { klucz: 'przegladDo', etykieta: 'Przegląd do', typ: 'date' },
      { klucz: 'wymianaOlejuDo', etykieta: 'Wymiana oleju — data', typ: 'date' },
      { klucz: 'wymianaOlejuPrzebieg', etykieta: 'Wymiana oleju przy przebiegu', typ: 'number', min: 0 },
      { klucz: 'planowanySerwisData', etykieta: 'Planowany serwis — data', typ: 'date' },
      { klucz: 'planowanySerwisGodzina', etykieta: 'Planowany serwis — godzina', typ: 'time' },
      { klucz: 'notatka', etykieta: 'Notatka / opis', typ: 'textarea' },
    ]}
    zbuduj={(formularz, istniejacy) => ({
      ...(istniejacy ?? utworzMetadane()),
      nazwa: formularz.nazwa.trim(),
      przebieg: formularz.przebieg ? Number(formularz.przebieg) : undefined,
      ocDo: formularz.ocDo || undefined,
      przegladDo: formularz.przegladDo || undefined,
      wymianaOlejuDo: formularz.wymianaOlejuDo || undefined,
      wymianaOlejuPrzebieg: formularz.wymianaOlejuPrzebieg ? Number(formularz.wymianaOlejuPrzebieg) : undefined,
      planowanySerwisData: formularz.planowanySerwisData || undefined,
      planowanySerwisGodzina: formularz.planowanySerwisData && formularz.planowanySerwisGodzina ? formularz.planowanySerwisGodzina : undefined,
      notatka: formularz.notatka.trim() || undefined,
      updatedAt: terazIso(),
    } satisfies Pojazd)}
    etykieta={(pojazd) => pojazd.nazwa}
    szczegoly={(pojazd) => <>
      <span>{pojazd.przebieg === undefined ? 'Przebieg nieuzupełniony' : `${pojazd.przebieg.toLocaleString('pl-PL')} km`}</span>
      {pojazd.ocDo && <span>OC: {pojazd.ocDo}</span>}
      {pojazd.przegladDo && <span>Przegląd: {pojazd.przegladDo}</span>}
      {pojazd.wymianaOlejuDo && <span>Olej: {pojazd.wymianaOlejuDo}</span>}
      {pojazd.planowanySerwisData && <span>Serwis: {pojazd.planowanySerwisData}{pojazd.planowanySerwisGodzina ? ` ${pojazd.planowanySerwisGodzina}` : ''}</span>}
    </>}
  />
}
