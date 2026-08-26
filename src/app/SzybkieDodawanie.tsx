import { useEffect, useState, type FormEvent } from 'react'
import { Inbox, Lightbulb, NotebookPen, Receipt, ShoppingCart, Stethoscope, ListTodo } from 'lucide-react'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { dzisiajIso, utworzMetadane } from '../domain/fabryki'
import type { ElementSkrzynki, ListaZakupow, NazwaModulu, Notatka, PozycjaZakupow, Pomysl, Wizyta, Wydatek } from '../domain/typy'
import { utworzZadanie } from '../services/ZadaniaService'
import { Komunikat, Modal } from '../components/Interfejs'

type TypSzybkiegoDodawania = 'zadanie' | 'skrzynka' | 'notatka' | 'zakup' | 'pomysl' | 'wizyta' | 'wydatek'

const typy: { typ: TypSzybkiegoDodawania; etykieta: string; ikona: typeof ListTodo; modul: NazwaModulu }[] = [
  { typ: 'zadanie', etykieta: 'Zadanie', ikona: ListTodo, modul: 'zadania' },
  { typ: 'skrzynka', etykieta: 'Do skrzynki', ikona: Inbox, modul: 'skrzynka' },
  { typ: 'notatka', etykieta: 'Notatka', ikona: NotebookPen, modul: 'notatki' },
  { typ: 'zakup', etykieta: 'Zakup', ikona: ShoppingCart, modul: 'zakupy' },
  { typ: 'pomysl', etykieta: 'Pomysł', ikona: Lightbulb, modul: 'pomysly' },
  { typ: 'wizyta', etykieta: 'Wizyta / umówić', ikona: Stethoscope, modul: 'wizyty' },
  { typ: 'wydatek', etykieta: 'Wydatek', ikona: Receipt, modul: 'finanse' },
]

export function SzybkieDodawanie({ zamknij, moze }: { zamknij: () => void; moze: (modul: NazwaModulu, operacja?: 'odczyt' | 'edycja') => boolean }) {
  const dozwoloneTypy = typy.filter((element) => moze(element.modul, 'edycja'))
  const [typ, ustawTyp] = useState<TypSzybkiegoDodawania>('zadanie')
  const [tresc, ustawTresc] = useState('')
  const [data, ustawDate] = useState('')
  const [kwota, ustawKwote] = useState('')
  const [blad, ustawBlad] = useState('')
  useEffect(() => {
    if (!dozwoloneTypy.some((element) => element.typ === typ) && dozwoloneTypy[0]) ustawTyp(dozwoloneTypy[0].typ)
  }, [dozwoloneTypy, typ])

  const zapisz = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    if (!dozwoloneTypy.some((element) => element.typ === typ)) return ustawBlad('Brak uprawnienia do tego typu elementu.')
    if (!tresc.trim()) return ustawBlad('Wpisz treść elementu.')
    try {
      if (typ === 'zadanie') await pobierzRepozytorium('zadania').zapisz(utworzZadanie({ tytul: tresc, opis: '', priorytet: 'normalny', termin: data || undefined }))
      if (typ === 'skrzynka') {
        const element: ElementSkrzynki = { ...utworzMetadane(), tresc, zrodlo: 'tekst', status: 'nowe' }
        await pobierzRepozytorium('skrzynka').zapisz(element)
      }
      if (typ === 'notatka') {
        const element: Notatka = { ...utworzMetadane(), tytul: tresc.slice(0, 70), tresc, tagi: [], powiazania: [] }
        await pobierzRepozytorium('notatki').zapisz(element)
      }
      if (typ === 'pomysl') {
        const element: Pomysl = { ...utworzMetadane(), tytul: tresc, opis: '', status: 'nowy' }
        await pobierzRepozytorium('pomysly').zapisz(element)
      }
      if (typ === 'wizyta') {
        const element: Wizyta = { ...utworzMetadane(), nazwa: tresc, status: data ? 'umowiona' : 'do_umowienia', data: data || undefined, notatka: '', pytania: [], dokumentyIds: [], checklista: [] }
        await pobierzRepozytorium('wizyty').zapisz(element)
      }
      if (typ === 'wydatek') {
        const liczba = Number(kwota.replace(',', '.'))
        if (!Number.isFinite(liczba) || liczba <= 0) throw new Error('Podaj prawidłową kwotę wydatku.')
        const element: Wydatek = { ...utworzMetadane(), opis: tresc, kwota: liczba, data: data || dzisiajIso(), kategoria: 'Inne' }
        await pobierzRepozytorium('wydatki').zapisz(element)
      }
      if (typ === 'zakup') {
        const repoList = pobierzRepozytorium('listyZakupow')
        let lista = (await repoList.lista()).find((element) => element.aktywna)
        if (!lista) {
          lista = { ...utworzMetadane(), nazwa: 'Szybka lista', aktywna: true } satisfies ListaZakupow
          await repoList.zapisz(lista)
        }
        const element: PozycjaZakupow = { ...utworzMetadane(), listaId: lista.id, nazwa: tresc, ilosc: '1', kupione: false }
        await pobierzRepozytorium('pozycjeZakupow').zapisz(element)
      }
      zamknij()
    } catch (przyczyna) {
      ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Nie udało się zapisać elementu.')
    }
  }

  return (
    <Modal tytul="Szybkie dodawanie" opis="Wybierz typ i zapisz najważniejszą informację bez dużego formularza." zamknij={zamknij} szeroki>
      {dozwoloneTypy.length === 0 ? <Komunikat typ="blad">Edytor nie ma uprawnienia do dodawania elementów w żadnym module.</Komunikat> : <><div className="wybor-typu">
        {dozwoloneTypy.map((element) => {
          const Ikona = element.ikona
          return <button type="button" className={typ === element.typ ? 'wybor-typu__przycisk wybor-typu__przycisk--aktywny' : 'wybor-typu__przycisk'} onClick={() => ustawTyp(element.typ)} key={element.typ}><Ikona aria-hidden="true" />{element.etykieta}</button>
        })}
      </div>
      <form className="formularz" onSubmit={zapisz}>
        {blad && <Komunikat typ="blad">{blad}</Komunikat>}
        <label className="pole pole--pelne">
          <span>{typ === 'skrzynka' ? 'Co chcesz zapamiętać?' : 'Nazwa / treść'} *</span>
          <input autoFocus value={tresc} onChange={(e) => ustawTresc(e.target.value)} placeholder="Wpisz krótko i konkretnie…" />
        </label>
        {['zadanie', 'wizyta', 'wydatek'].includes(typ) && <label className="pole"><span>{typ === 'zadanie' ? 'Termin' : 'Data'}</span><input type="date" value={data} onChange={(e) => ustawDate(e.target.value)} /></label>}
        {typ === 'wydatek' && <label className="pole"><span>Kwota *</span><input type="number" min="0.01" step="0.01" value={kwota} onChange={(e) => ustawKwote(e.target.value)} /></label>}
        <div className="akcje-formularza pole--pelne">
          <button type="button" className="przycisk przycisk--drugorzedny" onClick={zamknij}>Anuluj</button>
          <button type="submit" className="przycisk przycisk--glowny">Zapisz</button>
        </div>
      </form></>}
    </Modal>
  )
}
