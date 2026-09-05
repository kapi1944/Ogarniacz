import { useSearchParams } from 'react-router-dom'
import { BellPlus } from 'lucide-react'
import { WidokRejestru } from '../../components/WidokRejestru'
import { noweId, terazIso, utworzMetadane } from '../../domain/fabryki'
import type { Pojazd, Przypomnienie } from '../../domain/typy'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { zapiszPowiazanePrzypomnienie } from '../../services/PrzypomnieniaService'
import { statystykaPaliwa } from '../../services/MotoryzacjaService'

export function WidokSamochodu() {
  const [parametry] = useSearchParams()
  const { dane: pojazdy, repozytorium } = useRepozytorium('pojazdy')
  const { dane: przypomnienia, repozytorium: repozytoriumPrzypomnien } = useRepozytorium('przypomnienia')
  const dodajPrzypomnienie = async (pojazd: Pojazd) => {
    const data = [pojazd.ocDo, pojazd.przegladDo, pojazd.planowanySerwisData, pojazd.wymianaOlejuDo].filter((wartosc): wartosc is string => Boolean(wartosc)).sort()[0]
    if (!data) return
    const przypomnienie: Przypomnienie = { ...utworzMetadane(), tytul: `${pojazd.nazwa} — najbliższy termin`, zrodlo: { typ: 'samochod', id: pojazd.id }, typ: 'wzgledne', czas: `${data}T09:00:00`, przesuniecieMin: 30 * 24 * 60, priorytet: 'wysoki', stan: 'nowe', eskalacja: true }
    await repozytoriumPrzypomnien.zapisz(zapiszPowiazanePrzypomnienie(przypomnienia, przypomnienie))
  }
  return <WidokRejestru
    tytul="Samochód"
    opis="Najważniejsze dane pojazdu, przebieg i realne terminy eksploatacyjne."
    etykietaDodawania="Dodaj pojazd"
    dane={pojazdy}
    repozytorium={repozytorium}
    wybranyElementId={parametry.get('element') ?? undefined}
    pola={[
      { klucz: 'nazwa', etykieta: 'Pojazd', wymagane: true },
      { klucz: 'marka', etykieta: 'Marka' },
      { klucz: 'model', etykieta: 'Model' },
      { klucz: 'rok', etykieta: 'Rok', typ: 'number', min: 1886 },
      { klucz: 'numerRejestracyjny', etykieta: 'Numer rejestracyjny' },
      { klucz: 'vin', etykieta: 'VIN' },
      { klucz: 'przebieg', etykieta: 'Przebieg (km)', typ: 'number', min: 0 },
      { klucz: 'ocDo', etykieta: 'OC / polisa do', typ: 'date' },
      { klucz: 'ubezpieczyciel', etykieta: 'Ubezpieczyciel' },
      { klucz: 'numerPolisy', etykieta: 'Numer polisy' },
      { klucz: 'przegladDo', etykieta: 'Przegląd do', typ: 'date' },
      { klucz: 'wymianaOlejuDo', etykieta: 'Wymiana oleju — data', typ: 'date' },
      { klucz: 'wymianaOlejuPrzebieg', etykieta: 'Wymiana oleju przy przebiegu', typ: 'number', min: 0 },
      { klucz: 'planowanySerwisData', etykieta: 'Planowany serwis — data', typ: 'date' },
      { klucz: 'planowanySerwisGodzina', etykieta: 'Planowany serwis — godzina', typ: 'time' },
      { klucz: 'typSerwisu', etykieta: 'Dodaj wpis serwisowy', typ: 'select', opcje: [{ wartosc: 'olej', etykieta: 'Wymiana oleju' }, { wartosc: 'serwis', etykieta: 'Serwis' }, { wartosc: 'opony', etykieta: 'Opony' }, { wartosc: 'naprawa', etykieta: 'Naprawa' }, { wartosc: 'inne', etykieta: 'Inne' }] },
      { klucz: 'dataSerwisu', etykieta: 'Data wpisu serwisowego', typ: 'date' },
      { klucz: 'przebiegSerwisu', etykieta: 'Przebieg przy serwisie (km)', typ: 'number', min: 0 },
      { klucz: 'opisSerwisu', etykieta: 'Opis serwisu', typ: 'textarea' },
      { klucz: 'kosztSerwisu', etykieta: 'Koszt serwisu (opcjonalnie)', typ: 'number', min: 0 },
      { klucz: 'dataTankowania', etykieta: 'Dodaj tankowanie — data', typ: 'date' },
      { klucz: 'przebiegTankowania', etykieta: 'Przebieg przy tankowaniu (km)', typ: 'number', min: 0 },
      { klucz: 'litryTankowania', etykieta: 'Litry paliwa', typ: 'number', min: 0 },
      { klucz: 'cenaTankowania', etykieta: 'Koszt tankowania', typ: 'number', min: 0 },
      { klucz: 'pelnyBak', etykieta: 'Tankowanie do pełna', typ: 'select', opcje: [{ wartosc: 'true', etykieta: 'Tak' }, { wartosc: 'false', etykieta: 'Nie' }] },
      { klucz: 'nazwaOpon', etykieta: 'Dodaj komplet opon', podpowiedz: 'np. Michelin CrossClimate' },
      { klucz: 'typOpon', etykieta: 'Typ opon', typ: 'select', opcje: [{ wartosc: 'letnie', etykieta: 'Letnie' }, { wartosc: 'zimowe', etykieta: 'Zimowe' }, { wartosc: 'caloroczne', etykieta: 'Całoroczne' }] },
      { klucz: 'notatka', etykieta: 'Notatka / opis', typ: 'textarea' },
    ]}
    uzupelnijFormularz={() => ({ typSerwisu: '', dataSerwisu: '', przebiegSerwisu: '', opisSerwisu: '', kosztSerwisu: '', dataTankowania: '', przebiegTankowania: '', litryTankowania: '', cenaTankowania: '', pelnyBak: 'false', nazwaOpon: '', typOpon: '' })}
    zbuduj={(formularz, istniejacy) => {
      const przebieg = formularz.przebieg ? Number(formularz.przebieg) : undefined
      const historiaPrzebiegu = przebieg !== undefined && przebieg !== istniejacy?.przebieg
        ? [...(istniejacy?.historiaPrzebiegu ?? []), { data: new Date().toISOString().slice(0, 10), przebieg }]
        : istniejacy?.historiaPrzebiegu
      const historiaSerwisowa = formularz.opisSerwisu.trim()
        ? [...(istniejacy?.historiaSerwisowa ?? []), { id: noweId(), typ: (formularz.typSerwisu || 'inne') as NonNullable<Pojazd['historiaSerwisowa']>[number]['typ'], data: formularz.dataSerwisu || new Date().toISOString().slice(0, 10), przebieg: formularz.przebiegSerwisu ? Number(formularz.przebiegSerwisu) : undefined, opis: formularz.opisSerwisu.trim(), koszt: formularz.kosztSerwisu ? Number(formularz.kosztSerwisu) : undefined }]
        : istniejacy?.historiaSerwisowa
      const tankowania = formularz.dataTankowania && formularz.przebiegTankowania && formularz.litryTankowania && formularz.cenaTankowania
        ? [...(istniejacy?.tankowania ?? []), { id: noweId(), data: formularz.dataTankowania, przebieg: Number(formularz.przebiegTankowania), litry: Number(formularz.litryTankowania), cena: Number(formularz.cenaTankowania), pelnyBak: formularz.pelnyBak === 'true' }]
        : istniejacy?.tankowania
      const opony = formularz.nazwaOpon.trim()
        ? [...(istniejacy?.opony ?? []), { id: noweId(), nazwa: formularz.nazwaOpon.trim(), typ: formularz.typOpon as NonNullable<Pojazd['opony']>[number]['typ'] || undefined, dataZmiany: new Date().toISOString().slice(0, 10), przebieg }]
        : istniejacy?.opony
      return {
      ...(istniejacy ?? utworzMetadane()),
      nazwa: formularz.nazwa.trim(),
      marka: formularz.marka.trim() || undefined,
      model: formularz.model.trim() || undefined,
      rok: formularz.rok ? Number(formularz.rok) : undefined,
      numerRejestracyjny: formularz.numerRejestracyjny.trim() || undefined,
      vin: formularz.vin.trim() || undefined,
      przebieg,
      historiaPrzebiegu,
      historiaSerwisowa,
      tankowania,
      opony,
      ocDo: formularz.ocDo || undefined,
      ubezpieczyciel: formularz.ubezpieczyciel.trim() || undefined,
      numerPolisy: formularz.numerPolisy.trim() || undefined,
      przegladDo: formularz.przegladDo || undefined,
      wymianaOlejuDo: formularz.wymianaOlejuDo || undefined,
      wymianaOlejuPrzebieg: formularz.wymianaOlejuPrzebieg ? Number(formularz.wymianaOlejuPrzebieg) : undefined,
      planowanySerwisData: formularz.planowanySerwisData || undefined,
      planowanySerwisGodzina: formularz.planowanySerwisData && formularz.planowanySerwisGodzina ? formularz.planowanySerwisGodzina : undefined,
      notatka: formularz.notatka.trim() || undefined,
      updatedAt: terazIso(),
    } satisfies Pojazd }}
    etykieta={(pojazd) => pojazd.nazwa}
    szczegoly={(pojazd) => <SzczegolyPojazdu pojazd={pojazd} />}
    akcje={(pojazd) => <button type="button" className="przycisk-ikona" title="Przypomnij 30 dni przed najbliższym terminem" onClick={() => void dodajPrzypomnienie(pojazd)}><BellPlus aria-hidden="true" /></button>}
  />
}

function SzczegolyPojazdu({ pojazd }: { pojazd: Pojazd }) {
  const paliwo = statystykaPaliwa(pojazd)
  return <>
    <span>{pojazd.przebieg === undefined ? 'Przebieg nieuzupełniony' : `${pojazd.przebieg.toLocaleString('pl-PL')} km`}</span>
    {(pojazd.marka || pojazd.model || pojazd.rok) && <span>{[pojazd.marka, pojazd.model, pojazd.rok].filter(Boolean).join(' ')}</span>}
    {pojazd.numerRejestracyjny && <span>Rejestracja: {pojazd.numerRejestracyjny}</span>}
    {pojazd.ocDo && <span>OC: {pojazd.ocDo}</span>}
    {pojazd.ubezpieczyciel && <span>Ubezpieczyciel: {pojazd.ubezpieczyciel}</span>}
    {pojazd.przegladDo && <span>Przegląd: {pojazd.przegladDo}</span>}
    {pojazd.wymianaOlejuDo && <span>Olej: {pojazd.wymianaOlejuDo}</span>}
    {pojazd.planowanySerwisData && <span>Serwis: {pojazd.planowanySerwisData}{pojazd.planowanySerwisGodzina ? ` ${pojazd.planowanySerwisGodzina}` : ''}</span>}
    {paliwo.srednieSpalanie !== undefined && <span>Paliwo: {paliwo.srednieSpalanie.toFixed(1)} l/100 km · {paliwo.kosztNaKm?.toFixed(2)} zł/km</span>}
    {pojazd.opony?.at(-1) && <span>Opony: {pojazd.opony.at(-1)!.nazwa}</span>}
    {pojazd.historiaSerwisowa?.slice(-2).reverse().map((wpis) => <span key={wpis.id}>Serwis {wpis.data}: {wpis.opis}{wpis.przebieg !== undefined ? ` · ${wpis.przebieg.toLocaleString('pl-PL')} km` : ''}</span>)}
  </>
}
