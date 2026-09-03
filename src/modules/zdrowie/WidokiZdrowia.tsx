import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BellPlus, History, ShieldAlert } from 'lucide-react'
import { WidokRejestru } from '../../components/WidokRejestru'
import { Karta, Komunikat, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { dzisiajIso, terazIso, utworzMetadane } from '../../domain/fabryki'
import type { Lek, Przypomnienie, Wizyta } from '../../domain/typy'
import { usePodswietlenie } from '../../hooks/usePodswietlenie'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { generujDawkiDnia, zapiszStatusDawki } from '../../services/LekiService'
import { zapiszPowiazanePrzypomnienie } from '../../services/PrzypomnieniaService'

export function WidokLekow() {
  const [parametryAdresu] = useSearchParams()
  const { dane: leki, repozytorium } = useRepozytorium('leki')
  const { dane: wpisy, repozytorium: repoWpisow } = useRepozytorium('dziennikLekow')
  const [historia, ustawHistorie] = useState(false)
  const data = dzisiajIso()
  const dawki = generujDawkiDnia(leki, wpisy, data)

  return <div className="widok">
    <NaglowekWidoku tytul="Leki" opis="Harmonogram i historia świadomych reakcji na dawki wpisane przez użytkownika." akcje={<button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawHistorie(!historia)}><History aria-hidden="true" />{historia ? 'Ukryj historię' : 'Historia'}</button>} />
    <Karta klasa="karta-bezpieczenstwa"><ShieldAlert aria-hidden="true" /><div><strong>Ogarniacz nie udziela porad medycznych.</strong><p>Nie dobiera leków ani dawek i nie zmienia zaleceń. Przechowuje wyłącznie informacje wpisane przez użytkownika.</p></div></Karta>
    <Karta>
      <h2>Dzisiejsze dawki</h2>
      {dawki.length === 0 ? <PustyStan tytul="Brak aktywnych dawek" opis="Dodaj lek i co najmniej jedną godzinę." /> : <div className="lista-dawek lista-dawek--duza">{dawki.map((dawka) => <div key={dawka.idWystapienia}><time>{dawka.planowanaGodzina}</time><div><strong>{dawka.lek.nazwa}</strong><small>{dawka.lek.dawkaInstrukcja}</small></div><select aria-label={`Status ${dawka.lek.nazwa} ${dawka.planowanaGodzina}`} value={dawka.status} onChange={(e) => repoWpisow.zapisz(zapiszStatusDawki(dawka, e.target.value as typeof dawka.status))}><option value="oczekuje">Oczekuje</option><option value="zazyte">Zażyte</option><option value="odroczone">Odroczone</option><option value="pominiete">Pominięte</option></select></div>)}</div>}
    </Karta>
    {historia && <Karta><h2>Historia reakcji</h2>{wpisy.length === 0 ? <p className="tekst-pomocniczy">Brak zapisanych reakcji.</p> : <div className="tabela-przewijana"><table><thead><tr><th>Data</th><th>Godzina</th><th>Lek</th><th>Status</th><th>Reakcja</th></tr></thead><tbody>{[...wpisy].sort((a, b) => b.data.localeCompare(a.data)).map((wpis) => <tr key={wpis.id}><td>{wpis.data}</td><td>{wpis.planowanaGodzina}</td><td>{leki.find((lek) => lek.id === wpis.lekId)?.nazwa ?? 'Usunięty lek'}</td><td><Znacznik wariant={wpis.status === 'zazyte' ? 'sukces' : wpis.status === 'pominiete' ? 'blad' : 'ostrzezenie'}>{wpis.status}</Znacznik></td><td>{wpis.reakcjaAt ? new Date(wpis.reakcjaAt).toLocaleString('pl-PL') : '—'}</td></tr>)}</tbody></table></div>}</Karta>}
    <WidokRejestru
      tytul="Harmonogramy leków"
      opis="Każdy lek może mieć kilka godzin dziennie. Dezaktywacja zachowuje historię."
      etykietaDodawania="Dodaj lek"
      dane={leki}
      repozytorium={repozytorium}
      pola={[
        { klucz: 'nazwa', etykieta: 'Nazwa', wymagane: true },
        { klucz: 'dawkaInstrukcja', etykieta: 'Dawka / instrukcja użytkownika', wymagane: true },
        { klucz: 'godziny', etykieta: 'Godziny', wymagane: true, podpowiedz: 'np. 08:00, 14:00, 21:00' },
        { klucz: 'dodatkoweInstrukcje', etykieta: 'Dodatkowe instrukcje', typ: 'textarea' },
        { klucz: 'aktywny', etykieta: 'Stan', typ: 'select', wymagane: true, opcje: [{ wartosc: 'true', etykieta: 'Aktywny' }, { wartosc: 'false', etykieta: 'Nieaktywny' }] },
      ]}
      zbuduj={(formularz, istniejacy) => ({ ...(istniejacy ?? utworzMetadane()), nazwa: formularz.nazwa.trim(), dawkaInstrukcja: formularz.dawkaInstrukcja.trim(), godziny: formularz.godziny.split(',').map((x) => x.trim()).filter((x) => /^\d{2}:\d{2}$/.test(x)).sort(), dodatkoweInstrukcje: formularz.dodatkoweInstrukcje || undefined, aktywny: formularz.aktywny !== 'false', updatedAt: terazIso() } as Lek)}
      etykieta={(lek) => lek.nazwa}
      wybranyElementId={parametryAdresu.get('element') ?? undefined}
      szczegoly={(lek) => <><Znacznik wariant={lek.aktywny ? 'sukces' : 'neutralny'}>{lek.aktywny ? 'aktywny' : 'nieaktywny'}</Znacznik><span>{lek.dawkaInstrukcja}</span><span>Godziny: {lek.godziny.join(', ') || 'brak — uzupełnij'}</span>{lek.dodatkoweInstrukcje && <p>{lek.dodatkoweInstrukcje}</p>}</>}
    />
  </div>
}

export function WidokWizyt() {
  const [parametryAdresu] = useSearchParams()
  const { dane: wizyty, repozytorium } = useRepozytorium('wizyty')
  const { dane: kontakty } = useRepozytorium('kontakty')
  const { dane: przypomnienia, repozytorium: repoPrzypomnien } = useRepozytorium('przypomnienia')
  const [komunikat, ustawKomunikat] = useState('')
  usePodswietlenie(wizyty.length)

  const dodajPrzypomnienie = async (wizyta: Wizyta) => {
    const dataCzas = wizyta.data ? `${wizyta.data}T${wizyta.godzina ?? '09:00'}:00` : wizyta.terminGraniczny ? `${wizyta.terminGraniczny}T09:00:00` : undefined
    if (!dataCzas) return ustawKomunikat('Najpierw podaj datę wizyty albo termin graniczny.')
    const przypomnienie: Przypomnienie = { ...utworzMetadane(), tytul: `Wizyta: ${wizyta.nazwa}`, zrodlo: { typ: 'wizyty', id: wizyta.id }, typ: 'wzgledne', czas: dataCzas, przesuniecieMin: 1440, priorytet: 'wysoki', stan: 'nowe', eskalacja: true }
    await repoPrzypomnien.zapisz(zapiszPowiazanePrzypomnienie(przypomnienia, przypomnienie))
    ustawKomunikat('Zapisano przypomnienie na dzień przed wizytą.')
  }

  return <div className="widok">
    {komunikat && <Komunikat typ={komunikat.startsWith('Najpierw') ? 'blad' : 'sukces'}>{komunikat}</Komunikat>}
    <WidokRejestru
      tytul="Wizyty i zdrowie"
      opis="Sprawy do umówienia oraz umówione wizyty z kontaktem, pytaniami i checklistą."
      etykietaDodawania="Dodaj wizytę / sprawę"
      dane={wizyty}
      repozytorium={repozytorium}
      pola={[
        { klucz: 'nazwa', etykieta: 'Nazwa / typ wizyty', wymagane: true },
        { klucz: 'status', etykieta: 'Stan', typ: 'select', wymagane: true, opcje: [{ wartosc: 'do_umowienia', etykieta: 'Do umówienia' }, { wartosc: 'umowiona', etykieta: 'Umówiona' }, { wartosc: 'odbyta', etykieta: 'Odbyta' }, { wartosc: 'anulowana', etykieta: 'Anulowana' }] },
        { klucz: 'terminGraniczny', etykieta: 'Termin graniczny', typ: 'date' },
        { klucz: 'data', etykieta: 'Data wizyty', typ: 'date' },
        { klucz: 'godzina', etykieta: 'Godzina', typ: 'time' },
        { klucz: 'miejsce', etykieta: 'Miejsce' },
        { klucz: 'lekarzPlacowka', etykieta: 'Lekarz / placówka' },
        { klucz: 'kontaktId', etykieta: 'Kontakt', typ: 'select', opcje: kontakty.map((kontakt) => ({ wartosc: kontakt.id, etykieta: kontakt.nazwa })) },
        { klucz: 'notatka', etykieta: 'Notatka', typ: 'textarea' },
        { klucz: 'pytania', etykieta: 'Pytania', podpowiedz: 'oddzielone przecinkami' },
        { klucz: 'checklista', etykieta: 'Rzeczy do zabrania', podpowiedz: 'oddzielone przecinkami' },
      ]}
      zbuduj={(formularz, istniejacy) => ({ ...(istniejacy ?? utworzMetadane()), nazwa: formularz.nazwa.trim(), status: (formularz.status || 'do_umowienia') as Wizyta['status'], terminGraniczny: formularz.terminGraniczny || undefined, data: formularz.data || undefined, godzina: formularz.godzina || undefined, miejsce: formularz.miejsce || undefined, lekarzPlacowka: formularz.lekarzPlacowka || undefined, kontaktId: formularz.kontaktId || undefined, notatka: formularz.notatka ?? '', pytania: formularz.pytania.split(',').map((x) => x.trim()).filter(Boolean), checklista: formularz.checklista.split(',').map((x) => x.trim()).filter(Boolean), dokumentyIds: istniejacy?.dokumentyIds ?? [], updatedAt: terazIso() })}
      etykieta={(wizyta) => wizyta.nazwa}
      wybranyElementId={parametryAdresu.get('element') ?? undefined}
      szczegoly={(wizyta) => <><Znacznik wariant={wizyta.status === 'odbyta' ? 'sukces' : wizyta.status === 'do_umowienia' ? 'ostrzezenie' : 'informacja'}>{wizyta.status.replaceAll('_', ' ')}</Znacznik>{wizyta.data && <span>{wizyta.data} {wizyta.godzina}</span>}{wizyta.terminGraniczny && <span>Umów do: {wizyta.terminGraniczny}</span>}{wizyta.miejsce && <span>{wizyta.miejsce}</span>}{wizyta.pytania.length > 0 && <span>Pytania: {wizyta.pytania.join(', ')}</span>}{wizyta.checklista.length > 0 && <span>Zabrać: {wizyta.checklista.join(', ')}</span>}{wizyta.notatka && <p>{wizyta.notatka}</p>}</>}
      akcje={(wizyta) => <button type="button" className="przycisk-ikona" title="Dodaj przypomnienie dzień wcześniej" onClick={() => dodajPrzypomnienie(wizyta)}><BellPlus aria-hidden="true" /></button>}
    />
  </div>
}
