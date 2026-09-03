import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BellPlus, Download, FileUp, ListTodo, NotebookPen, PackageCheck, Share2, Trash2 } from 'lucide-react'
import { WidokRejestru } from '../../components/WidokRejestru'
import { Karta, Komunikat, Modal, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { terazIso, utworzMetadane } from '../../domain/fabryki'
import type { Cel, Dokument, Kontakt, NaPozniej, Notatka, Pomysl, Projekt, Przypomnienie, TerminWaznosci } from '../../domain/typy'
import { usePodswietlenie } from '../../hooks/usePodswietlenie'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { utworzZadanie } from '../../services/ZadaniaService'
import { platforma } from '../../platform/platforma'
import { zapiszPowiazanePrzypomnienie } from '../../services/PrzypomnieniaService'

export function WidokCelow() {
  const { dane: cele, repozytorium } = useRepozytorium('cele')
  const { dane: projekty } = useRepozytorium('projekty')
  const { dane: nawyki } = useRepozytorium('nawyki')
  const znajdzIds = (tekst: string, opcje: { id: string; nazwa: string }[]) => tekst.split(',').map((x) => x.trim()).filter(Boolean).map((wartosc) => opcje.find((x) => x.id === wartosc || x.nazwa.toLocaleLowerCase('pl') === wartosc.toLocaleLowerCase('pl'))?.id).filter((x): x is string => Boolean(x))
  return <WidokRejestru
    tytul="Cele"
    opis="Kierunki powiązane z projektami i nawykami, które faktycznie prowadzą do postępu."
    etykietaDodawania="Nowy cel"
    dane={cele}
    repozytorium={repozytorium}
    pola={[
      { klucz: 'nazwa', etykieta: 'Nazwa', wymagane: true }, { klucz: 'opis', etykieta: 'Opis', typ: 'textarea' }, { klucz: 'status', etykieta: 'Status', typ: 'select', wymagane: true, opcje: [{ wartosc: 'aktywne', etykieta: 'Aktywny' }, { wartosc: 'wstrzymane', etykieta: 'Wstrzymany' }, { wartosc: 'zakonczone', etykieta: 'Zakończony' }] }, { klucz: 'horyzont', etykieta: 'Horyzont', podpowiedz: 'np. 2026 Q4' }, { klucz: 'projektyNazwy', etykieta: 'Projekty', podpowiedz: projekty.map((x) => x.nazwa).join(', ') || 'najpierw utwórz projekt' }, { klucz: 'nawykiNazwy', etykieta: 'Nawyki', podpowiedz: nawyki.map((x) => x.nazwa).join(', ') || 'najpierw utwórz nawyk' }, { klucz: 'postep', etykieta: 'Postęp %', typ: 'number', min: 0 },
    ]}
    zbuduj={(formularz, istniejacy) => ({ ...(istniejacy ?? utworzMetadane()), nazwa: formularz.nazwa.trim(), opis: formularz.opis ?? '', status: (formularz.status || 'aktywne') as Cel['status'], horyzont: formularz.horyzont || undefined, projektyIds: formularz.projektyNazwy ? znajdzIds(formularz.projektyNazwy, projekty) : istniejacy?.projektyIds ?? [], nawykiIds: formularz.nawykiNazwy ? znajdzIds(formularz.nawykiNazwy, nawyki) : istniejacy?.nawykiIds ?? [], postep: Math.min(100, Math.max(0, Number(formularz.postep) || 0)), updatedAt: terazIso() })}
    etykieta={(cel) => cel.nazwa}
    szczegoly={(cel) => <><Znacznik wariant={cel.status === 'zakonczone' ? 'sukces' : 'neutralny'}>{cel.status}</Znacznik><span>Postęp: {cel.postep}%</span>{cel.horyzont && <span>Horyzont: {cel.horyzont}</span>}<span>Projekty: {cel.projektyIds.map((id) => projekty.find((x) => x.id === id)?.nazwa).filter(Boolean).join(', ') || 'brak'}</span><span>Nawyki: {cel.nawykiIds.map((id) => nawyki.find((x) => x.id === id)?.nazwa).filter(Boolean).join(', ') || 'brak'}</span>{cel.opis && <p>{cel.opis}</p>}</>}
  />
}

export function WidokNotatek() {
  const [parametry] = useSearchParams()
  const { dane, repozytorium } = useRepozytorium('notatki')
  usePodswietlenie(dane.length)
  return <WidokRejestru
    tytul="Notatki"
    opis="Samodzielne treści, opcjonalnie przypięte lub jawnie zaplanowane."
    etykietaDodawania="Nowa notatka"
    dane={dane}
    repozytorium={repozytorium}
    wybranyElementId={parametry.get('element') ?? undefined}
    pola={[
      { klucz: 'tytul', etykieta: 'Tytuł', wymagane: true },
      { klucz: 'tresc', etykieta: 'Treść', typ: 'textarea', wymagane: true },
      { klucz: 'tagi', etykieta: 'Tagi', podpowiedz: 'oddzielone przecinkami' },
      { klucz: 'data', etykieta: 'Jawna data', typ: 'date' },
      { klucz: 'godzina', etykieta: 'Jawna godzina', typ: 'time' },
      { klucz: 'przypieta', etykieta: 'Przypięta', typ: 'select', opcje: [{ wartosc: 'true', etykieta: 'Tak' }, { wartosc: 'false', etykieta: 'Nie' }] },
      { klucz: 'przypomnienieAt', etykieta: 'Przypomnienie', podpowiedz: 'YYYY-MM-DDTHH:mm' },
      { klucz: 'powiazanieTyp', etykieta: 'Typ powiązania', typ: 'select', opcje: [{ wartosc: 'zadania', etykieta: 'Zadanie' }, { wartosc: 'projekty', etykieta: 'Projekt' }, { wartosc: 'wizyty', etykieta: 'Wizyta' }, { wartosc: 'kontakty', etykieta: 'Kontakt' }, { wartosc: 'cele', etykieta: 'Cel' }] },
      { klucz: 'powiazanieId', etykieta: 'ID powiązanej encji' },
    ]}
    zbuduj={(formularz, istniejaca) => ({
      ...(istniejaca ?? utworzMetadane()),
      tytul: formularz.tytul.trim(),
      tresc: formularz.tresc,
      tagi: formularz.tagi.split(',').map((tag) => tag.trim()).filter(Boolean),
      powiazania: formularz.powiazanieTyp && formularz.powiazanieId
        ? [{ typ: formularz.powiazanieTyp as Notatka['powiazania'][number]['typ'], id: formularz.powiazanieId }]
        : istniejaca?.powiazania ?? [],
      data: formularz.data || undefined,
      godzina: formularz.data && formularz.godzina ? formularz.godzina : undefined,
      przypieta: formularz.przypieta === 'true',
      przypomnienieAt: formularz.przypomnienieAt || undefined,
      updatedAt: terazIso(),
    })}
    etykieta={(notatka) => notatka.tytul}
    szczegoly={(notatka) => <>{notatka.przypieta && <Znacznik wariant="informacja">przypięta</Znacznik>}{notatka.tagi.map((tag) => <Znacznik key={tag}>{tag}</Znacznik>)}{notatka.data && <span>{notatka.data}{notatka.godzina ? ` ${notatka.godzina}` : ''}</span>}{notatka.przypomnienieAt && <span>Przypomnienie: {notatka.przypomnienieAt}</span>}{notatka.powiazania.length > 0 && <span>Powiązania: {notatka.powiazania.length}</span>}<p>{notatka.tresc}</p></>}
    akcje={(notatka) => platforma.udostepnianie.dostepne() ? <button type="button" className="przycisk-ikona" title="Udostępnij notatkę" onClick={() => platforma.udostepnianie.udostepnij({ tytul: notatka.tytul, tekst: notatka.tresc })}><Share2 aria-hidden="true" /></button> : null}
  />
}

export function WidokPomyslow() {
  const { dane, repozytorium } = useRepozytorium('pomysly')
  const { repozytorium: repoZadan } = useRepozytorium('zadania')
  const { repozytorium: repoProjektow } = useRepozytorium('projekty')
  const { repozytorium: repoNotatek } = useRepozytorium('notatki')
  const [komunikat, ustawKomunikat] = useState('')
  usePodswietlenie(dane.length)
  const konwertuj = async (pomysl: Pomysl, typ: 'zadanie' | 'projekt' | 'notatka') => {
    if (typ === 'zadanie') await repoZadan.zapisz(utworzZadanie({ tytul: pomysl.tytul, opis: pomysl.opis, priorytet: 'normalny' }))
    if (typ === 'projekt') { const projekt: Projekt = { ...utworzMetadane(), nazwa: pomysl.tytul, opis: pomysl.opis, status: 'aktywne', blokady: '' }; await repoProjektow.zapisz(projekt) }
    if (typ === 'notatka') { const notatka: Notatka = { ...utworzMetadane(), tytul: pomysl.tytul, tresc: pomysl.opis || pomysl.tytul, tagi: [], powiazania: [] }; await repoNotatek.zapisz(notatka) }
    await repozytorium.zapisz({ ...pomysl, status: 'rozwiniety' })
    ustawKomunikat(`Pomysł przekształcono w: ${typ}.`)
  }
  return <div className="widok">{komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}<WidokRejestru tytul="Pomysły" opis="Szybki zapis koncepcji bez obowiązku natychmiastowego planowania." etykietaDodawania="Nowy pomysł" dane={dane} repozytorium={repozytorium} pola={[{ klucz: 'tytul', etykieta: 'Pomysł', wymagane: true }, { klucz: 'opis', etykieta: 'Opis', typ: 'textarea' }, { klucz: 'status', etykieta: 'Status', typ: 'select', wymagane: true, opcje: [{ wartosc: 'nowy', etykieta: 'Nowy' }, { wartosc: 'rozwiniety', etykieta: 'Rozwinięty' }, { wartosc: 'zrealizowany', etykieta: 'Zrealizowany' }] }]} zbuduj={(f, e) => ({ ...(e ?? utworzMetadane()), tytul: f.tytul.trim(), opis: f.opis ?? '', status: (f.status || 'nowy') as Pomysl['status'], updatedAt: terazIso() })} etykieta={(x) => x.tytul} szczegoly={(x) => <><Znacznik wariant={x.status === 'zrealizowany' ? 'sukces' : 'neutralny'}>{x.status}</Znacznik>{x.opis && <p>{x.opis}</p>}</>} akcje={(x) => <div className="menu-konwersji"><button type="button" title="Utwórz zadanie" onClick={() => konwertuj(x, 'zadanie')}><ListTodo aria-hidden="true" /></button><button type="button" title="Utwórz projekt" onClick={() => konwertuj(x, 'projekt')}><PackageCheck aria-hidden="true" /></button><button type="button" title="Utwórz notatkę" onClick={() => konwertuj(x, 'notatka')}><NotebookPen aria-hidden="true" /></button></div>} /></div>
}

export function WidokNaPozniej() {
  const { dane, repozytorium } = useRepozytorium('naPozniej')
  const { repozytorium: repoZadan } = useRepozytorium('zadania')
  return <WidokRejestru tytul="Na później" opis="Rzeczy do przeczytania, obejrzenia, sprawdzenia, kupienia lub rozważenia." etykietaDodawania="Dodaj na później" dane={dane} repozytorium={repozytorium} pola={[{ klucz: 'tytul', etykieta: 'Tytuł', wymagane: true }, { klucz: 'typ', etykieta: 'Typ', typ: 'select', wymagane: true, opcje: [{ wartosc: 'przeczytac', etykieta: 'Do przeczytania' }, { wartosc: 'obejrzec', etykieta: 'Do obejrzenia' }, { wartosc: 'sprawdzic', etykieta: 'Do sprawdzenia' }, { wartosc: 'kupic', etykieta: 'Do kupienia' }, { wartosc: 'rozwazyc', etykieta: 'Do rozważenia' }] }, { klucz: 'adres', etykieta: 'Adres URL', typ: 'url' }, { klucz: 'opis', etykieta: 'Opis', typ: 'textarea' }, { klucz: 'status', etykieta: 'Status', typ: 'select', wymagane: true, opcje: [{ wartosc: 'oczekuje', etykieta: 'Oczekuje' }, { wartosc: 'wykonane', etykieta: 'Wykonane' }] }]} zbuduj={(f, e) => ({ ...(e ?? utworzMetadane()), tytul: f.tytul.trim(), typ: (f.typ || 'sprawdzic') as NaPozniej['typ'], adres: f.adres || undefined, opis: f.opis || undefined, status: (f.status || 'oczekuje') as NaPozniej['status'], updatedAt: terazIso() })} etykieta={(x) => x.tytul} szczegoly={(x) => <><Znacznik wariant={x.status === 'wykonane' ? 'sukces' : 'neutralny'}>{x.typ.replaceAll('_', ' ')}</Znacznik>{x.adres && <a href={x.adres} target="_blank" rel="noreferrer">Otwórz adres</a>}{x.opis && <p>{x.opis}</p>}</>} akcje={(x) => <div className="menu-konwersji">{x.status === 'oczekuje' && <button type="button" className="przycisk przycisk--maly" onClick={async () => { await repoZadan.zapisz(utworzZadanie({ tytul: x.tytul, opis: x.opis ?? '', priorytet: 'normalny' })); await repozytorium.zapisz({ ...x, status: 'wykonane' }) }}>Do zadań</button>}{platforma.udostepnianie.dostepne() && <button type="button" title="Udostępnij element" onClick={() => platforma.udostepnianie.udostepnij({ tytul: x.tytul, tekst: x.opis, adres: x.adres })}><Share2 aria-hidden="true" /></button>}</div>} />
}

export function WidokKontaktow() {
  const { dane, repozytorium } = useRepozytorium('kontakty')
  usePodswietlenie(dane.length)
  return <WidokRejestru tytul="Kontakty" opis="Praktyczna baza lekarzy, serwisów, urzędów i usługodawców — nie pełna książka adresowa." etykietaDodawania="Nowy kontakt" dane={dane} repozytorium={repozytorium} pola={[{ klucz: 'nazwa', etykieta: 'Nazwa', wymagane: true }, { klucz: 'rola', etykieta: 'Rola' }, { klucz: 'telefon', etykieta: 'Telefon' }, { klucz: 'email', etykieta: 'E-mail', typ: 'email' }, { klucz: 'adres', etykieta: 'Adres' }, { klucz: 'strona', etykieta: 'Strona', typ: 'url' }, { klucz: 'notatki', etykieta: 'Notatki', typ: 'textarea' }]} zbuduj={(f, e) => ({ ...(e ?? utworzMetadane()), nazwa: f.nazwa.trim(), rola: f.rola || undefined, telefon: f.telefon || undefined, email: f.email || undefined, adres: f.adres || undefined, strona: f.strona || undefined, notatki: f.notatki || undefined, updatedAt: terazIso() } as Kontakt)} etykieta={(x) => x.nazwa} szczegoly={(x) => <>{x.rola && <Znacznik>{x.rola}</Znacznik>}{x.telefon && <a href={`tel:${x.telefon}`}>{x.telefon}</a>}{x.email && <a href={`mailto:${x.email}`}>{x.email}</a>}{x.adres && <span>{x.adres}</span>}{x.notatki && <p>{x.notatki}</p>}</>} />
}

export function WidokDokumentow() {
  const { dane, repozytorium } = useRepozytorium('dokumenty')
  const [formularz, ustawFormularz] = useState<Dokument | null>()
  const [plik, ustawPlik] = useState<File>()
  usePodswietlenie(dane.length)
  const pobierz = (dokument: Dokument) => { if (!dokument.plik) return; const adres = URL.createObjectURL(dokument.plik); const link = document.createElement('a'); link.href = adres; link.download = dokument.nazwaPliku ?? dokument.nazwa; link.click(); URL.revokeObjectURL(adres) }
  const zapisz = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    if (!formularz?.nazwa.trim()) return
    const dokument: Dokument = { ...formularz, nazwa: formularz.nazwa.trim(), plik: plik ?? formularz.plik, nazwaPliku: plik?.name ?? formularz.nazwaPliku, mimeType: plik?.type ?? formularz.mimeType, rozmiar: plik?.size ?? formularz.rozmiar, updatedAt: terazIso() }
    await repozytorium.zapisz(dokument); ustawFormularz(null); ustawPlik(undefined)
  }
  return <div className="widok"><NaglowekWidoku tytul="Dokumenty" opis="Pliki są przechowywane lokalnie jako Blob w IndexedDB i uwzględniane w backupie JSON." akcje={<button type="button" className="przycisk przycisk--glowny" onClick={() => ustawFormularz({ ...utworzMetadane(), nazwa: '', powiazania: [] })}><FileUp aria-hidden="true" />Dodaj dokument</button>} />{dane.length === 0 ? <PustyStan tytul="Brak dokumentów" opis="Dodaj pierwszy plik lub sam rekord dokumentu." /> : <div className="siatka-kart-modulow">{dane.map((dokument) => <Karta key={dokument.id}><div className="naglowek-karty"><div><h3>{dokument.nazwa}</h3><p>{dokument.nazwaPliku ?? 'Rekord bez pliku'}</p></div><Znacznik>{dokument.typ ?? dokument.mimeType ?? 'dokument'}</Znacznik></div><p>{dokument.rozmiar ? `${Math.round(dokument.rozmiar / 1024)} KB` : 'Brak danych o rozmiarze'}{dokument.terminWaznosci ? ` · ważny do ${dokument.terminWaznosci}` : ''}</p><div className="akcje-karty">{dokument.plik && <button type="button" className="przycisk przycisk--maly" onClick={() => pobierz(dokument)}><Download aria-hidden="true" />Pobierz</button>}<button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawFormularz(dokument)}>Edytuj</button><button type="button" className="przycisk-ikona przycisk-ikona--niebezpieczny" onClick={() => repozytorium.usun(dokument.id)}><Trash2 aria-hidden="true" /></button></div></Karta>)}</div>}{formularz && <Modal tytul={formularz.nazwa ? 'Edytuj dokument' : 'Dodaj dokument'} zamknij={() => ustawFormularz(null)}><form className="formularz" onSubmit={zapisz}><label className="pole pole--pelne"><span>Nazwa *</span><input required value={formularz.nazwa} onChange={(e) => ustawFormularz({ ...formularz, nazwa: e.target.value })} /></label><label className="pole"><span>Typ</span><input value={formularz.typ ?? ''} onChange={(e) => ustawFormularz({ ...formularz, typ: e.target.value || undefined })} /></label><label className="pole"><span>Termin ważności</span><input type="date" value={formularz.terminWaznosci ?? ''} onChange={(e) => ustawFormularz({ ...formularz, terminWaznosci: e.target.value || undefined })} /></label><label className="pole pole--pelne"><span>Plik</span><input type="file" onChange={(e) => ustawPlik(e.target.files?.[0])} />{formularz.nazwaPliku && <small>Obecnie: {formularz.nazwaPliku}</small>}</label><div className="akcje-formularza pole--pelne"><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawFormularz(null)}>Anuluj</button><button type="submit" className="przycisk przycisk--glowny">Zapisz</button></div></form></Modal>}</div>
}

export function WidokTerminow() {
  const { dane, repozytorium } = useRepozytorium('terminyWaznosci')
  const { dane: przypomnienia, repozytorium: repoPrzypomnien } = useRepozytorium('przypomnienia')
  const { dane: dokumenty } = useRepozytorium('dokumenty')
  const [komunikat, ustawKomunikat] = useState('')
  const dodajPrzypomnienie = async (termin: TerminWaznosci) => { const przypomnienie: Przypomnienie = { ...utworzMetadane(), tytul: `Wygasa: ${termin.nazwa}`, zrodlo: { typ: 'terminy', id: termin.id }, typ: 'wzgledne', czas: `${termin.dataWaznosci}T09:00:00`, przesuniecieMin: 30 * 24 * 60, priorytet: 'wysoki', stan: 'nowe', eskalacja: true }; await repoPrzypomnien.zapisz(zapiszPowiazanePrzypomnienie(przypomnienia, przypomnienie)); ustawKomunikat('Zapisano przypomnienie 30 dni przed terminem.') }
  return <div className="widok">{komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}<WidokRejestru tytul="Terminy ważności" opis="Dokumenty, badania, ubezpieczenia, przeglądy, recepty i inne odnawialne sprawy." etykietaDodawania="Nowy termin" dane={dane} repozytorium={repozytorium} pola={[{ klucz: 'nazwa', etykieta: 'Nazwa', wymagane: true }, { klucz: 'typ', etykieta: 'Typ', wymagane: true }, { klucz: 'dataWaznosci', etykieta: 'Data ważności', typ: 'date', wymagane: true }, { klucz: 'status', etykieta: 'Status', typ: 'select', wymagane: true, opcje: [{ wartosc: 'aktualne', etykieta: 'Aktualne' }, { wartosc: 'do_odnowienia', etykieta: 'Do odnowienia' }, { wartosc: 'odnowione', etykieta: 'Odnowione' }] }, { klucz: 'dokumentId', etykieta: 'Dokument', typ: 'select', opcje: dokumenty.map((x) => ({ wartosc: x.id, etykieta: x.nazwa })) }, { klucz: 'odnowienieTyp', etykieta: 'Reguła odnowienia', typ: 'select', opcje: [{ wartosc: 'brak', etykieta: 'Brak' }, { wartosc: 'miesiecznie', etykieta: 'Miesięcznie' }, { wartosc: 'rocznie', etykieta: 'Rocznie' }] }]} zbuduj={(f, e) => ({ ...(e ?? utworzMetadane()), nazwa: f.nazwa.trim(), typ: f.typ, dataWaznosci: f.dataWaznosci, status: (f.status || 'aktualne') as TerminWaznosci['status'], dokumentId: f.dokumentId || undefined, regulaOdnowienia: f.odnowienieTyp && f.odnowienieTyp !== 'brak' ? { typ: f.odnowienieTyp as NonNullable<TerminWaznosci['regulaOdnowienia']>['typ'], coIle: 1, dataStartu: f.dataWaznosci } : undefined, updatedAt: terazIso() })} etykieta={(x) => x.nazwa} szczegoly={(x) => <><Znacznik wariant={x.dataWaznosci < new Date().toISOString().slice(0, 10) ? 'blad' : x.status === 'odnowione' ? 'sukces' : 'ostrzezenie'}>{x.status.replaceAll('_', ' ')}</Znacznik><span>{x.typ}</span><strong>{x.dataWaznosci}</strong>{x.dokumentId && <span>Dokument: {dokumenty.find((d) => d.id === x.dokumentId)?.nazwa}</span>}</>} akcje={(x) => <button type="button" className="przycisk-ikona" title="Przypomnij 30 dni wcześniej" onClick={() => dodajPrzypomnienie(x)}><BellPlus aria-hidden="true" /></button>} /></div>
}
