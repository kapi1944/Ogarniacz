import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Bot, Mic, RotateCcw, Send, ShieldCheck, Square, Volume2 } from 'lucide-react'
import { Karta, ModalPotwierdzenia, NaglowekWidoku, Znacznik } from '../../components/Interfejs'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { EchoService } from '../../services/EchoService'
import { KontrolerSesjiGlosowejEcho, type StanSesjiGlosowejEcho } from '../../services/echo/KontrolerSesjiGlosowejEcho'
import type { AkcjaDoPotwierdzeniaEcho, TrybEcho, WartoscDomyslnaEcho, ZrodloWejsciaEcho } from '../../services/echo/typyEcho'
import { platforma } from '../../platform/platforma'

interface Wiadomosc {
  id: string
  autor: 'uzytkownik' | 'echo'
  tresc: string
  ryzyko?: 'niskie' | 'umiarkowane' | 'wysokie'
  wartosciDomyslne?: WartoscDomyslnaEcho[]
}

export function WidokEcho() {
  const [stan, ustawStan] = useState<StanSesjiGlosowejEcho>('bezczynny')
  const echo = useMemo(() => new EchoService(), [])
  const [tekst, ustawTekst] = useState('')
  const [tryb, ustawTryb] = useState<TrybEcho>(echo.agent.provider.tryb)
  const [wiadomosci, ustawWiadomosci] = useState<Wiadomosc[]>([{ id: 'powitanie', autor: 'echo', tresc: 'Napisz albo powiedz, co masz na głowie. Z Echo możesz rozmawiać normalnie.' }])
  const [oczekujacaAkcja, ustawOczekujacaAkcje] = useState<AkcjaDoPotwierdzeniaEcho>()
  const [bladGlosu, ustawBladGlosu] = useState('')
  const { dane: dziennik } = useRepozytorium('dziennikEcho')

  const dodajOdpowiedz = (odpowiedz: Awaited<ReturnType<EchoService['obsluz']>>) => {
    ustawTryb(odpowiedz.tryb)
    ustawWiadomosci((obecne) => [...obecne, { id: crypto.randomUUID(), autor: 'echo', tresc: odpowiedz.tekst, ryzyko: odpowiedz.ryzyko, wartosciDomyslne: odpowiedz.wartosciDomyslne }])
    ustawOczekujacaAkcje(odpowiedz.akcjaDoPotwierdzenia)
  }

  const kontrolerGlosu = useMemo(() => new KontrolerSesjiGlosowejEcho({
    glos: platforma.glosEcho,
    echo,
    cyklZycia: platforma.cyklZycia,
    obsluga: {
      zmienStan: ustawStan,
      zglosBlad: ustawBladGlosu,
      odebranoWypowiedz: (wypowiedz) => ustawWiadomosci((obecne) => [
        ...obecne,
        { id: crypto.randomUUID(), autor: 'uzytkownik', tresc: wypowiedz },
      ]),
      odebranoOdpowiedz: dodajOdpowiedz,
    },
  }), [echo])

  useEffect(() => {
    void kontrolerGlosu.inicjalizuj()
    return () => { void kontrolerGlosu.zniszcz() }
  }, [kontrolerGlosu])

  const wyslij = async (wypowiedz: string, zrodlo: ZrodloWejsciaEcho = 'tekst') => {
    if (!wypowiedz.trim()) return
    ustawWiadomosci((obecne) => [...obecne, { id: crypto.randomUUID(), autor: 'uzytkownik', tresc: wypowiedz }])
    ustawTekst('')
    dodajOdpowiedz(await echo.obsluz(wypowiedz, zrodlo))
  }

  const rozpocznijGlos = () => {
    void (stan === 'mowienie' ? kontrolerGlosu.przerwijIMow() : kontrolerGlosu.rozpocznij())
  }

  const przeczytaj = async (tresc: string) => {
    await kontrolerGlosu.anuluj()
    ustawBladGlosu('')
    ustawStan('mowienie')
    try {
      await platforma.glosEcho.mow(tresc)
      ustawStan('bezczynny')
    } catch (blad) {
      ustawStan('blad')
      ustawBladGlosu(blad instanceof Error ? blad.message : 'Nie udało się odczytać odpowiedzi.')
    }
  }

  const potwierdz = async () => {
    if (!oczekujacaAkcja) return
    const akcja = oczekujacaAkcja
    ustawOczekujacaAkcje(undefined)
    dodajOdpowiedz(await echo.potwierdz(akcja))
  }

  const anulujPotwierdzenie = () => {
    echo.anulujPotwierdzenie()
    ustawOczekujacaAkcje(undefined)
  }

  const sugestie = [
    'Co mam jeszcze dzisiaj do zrobienia?',
    'Przypomnij mi jutro po pracy o zakupach.',
    'Czy dam radę wcisnąć jutro mechanika?',
    'Przełóż te mniej ważne rzeczy na weekend.',
    'Kiedy ostatnio byłem u dentysty?',
    'Mam w tym miesiącu jakieś większe wydatki?',
  ]

  const etykietyStanu: Record<StanSesjiGlosowejEcho, string> = {
    bezczynny: 'Gotowy',
    sluchanie: 'Słucham…',
    transkrypcja: 'Rozpoznaję…',
    myslenie: 'Myślę…',
    mowienie: 'Mówię… Dotknij mikrofonu, aby mi przerwać.',
    oczekiwanie: 'Czekam na dalszą wypowiedź…',
    blad: 'Błąd rozmowy głosowej',
  }
  const sesjaAktywna = !['bezczynny', 'blad'].includes(stan)

  return <div className="widok widok-echo">
    <NaglowekWidoku tytul="Echo" opis="Napisz albo powiedz, co masz na głowie. Z Echo możesz rozmawiać normalnie." />
    <section className="siatka-echo">
      <Karta klasa="panel-rozmowy">
        <div className={`stan-glosu stan-glosu--${stan}`} aria-live="polite">{etykietyStanu[stan]}</div>
        <div className="wiadomosci">
          {wiadomosci.map((wiadomosc) => <article className={`wiadomosc wiadomosc--${wiadomosc.autor}`} key={wiadomosc.id}>
            {wiadomosc.autor === 'echo' && <Bot aria-hidden="true" />}
            <div><p>{wiadomosc.tresc}</p>{wiadomosc.wartosciDomyslne?.map((wartosc) => <div className="tekst-pomocniczy" key={`${wartosc.pole}-${wartosc.wartosc}`}><Znacznik wariant="informacja">przyjęto automatycznie</Znacznik> {wartosc.opis}: <strong>{wartosc.wartosc}</strong> <button type="button" className="przycisk przycisk--maly" onClick={() => ustawTekst('Zmień godzinę na ')}>Zmień</button></div>)}{wiadomosc.ryzyko && wiadomosc.ryzyko !== 'niskie' && <Znacznik wariant={wiadomosc.ryzyko === 'wysokie' ? 'blad' : 'ostrzezenie'}>wymaga uwagi</Znacznik>}{wiadomosc.autor === 'echo' && <button type="button" className="przycisk-ikona" title="Odczytaj odpowiedź" onClick={() => void przeczytaj(wiadomosc.tresc)}><Volume2 aria-hidden="true" /></button>}</div>
          </article>)}
        </div>
        {bladGlosu && <p className="tekst-bledu">{bladGlosu}</p>}
        <form className="formularz-echo" onSubmit={(zdarzenie: FormEvent) => { zdarzenie.preventDefault(); void wyslij(tekst) }}>
          <button type="button" className="przycisk-ikona" title={stan === 'mowienie' ? 'Przerwij Echo i mów' : 'Powiedz do Echo'} onClick={rozpocznijGlos}><Mic aria-hidden="true" /></button>
          <input value={tekst} onChange={(zdarzenie) => ustawTekst(zdarzenie.target.value)} placeholder="Co masz na głowie?" />
          <button type="submit" className="przycisk przycisk--glowny"><Send aria-hidden="true" />Wyślij</button>
        </form>
        <div className="akcje-glosu">
          {sesjaAktywna && <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => void kontrolerGlosu.anuluj()}><Square aria-hidden="true" />Anuluj rozmowę</button>}
          {stan === 'blad' && <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => void kontrolerGlosu.ponow()}><RotateCcw aria-hidden="true" />Spróbuj ponownie</button>}
        </div>
      </Karta>
      <aside className="kolumna-echo">
        <Karta><h2>Tryb rozmowy</h2><Znacznik wariant={tryb === 'pelny_agent' ? 'sukces' : 'ostrzezenie'}>{tryb === 'pelny_agent' ? 'Pełny agent' : 'Tryb lokalny'}</Znacznik>{tryb === 'ograniczony_lokalny' && <p className="tekst-pomocniczy">Echo lokalnie obsługuje teraz naturalne dodawanie przypomnień i ich kontekstowe przekładanie.</p>}</Karta>
        <Karta><h2>Możesz powiedzieć na przykład</h2><div className="sugestie-echo">{sugestie.map((sugestia) => <button type="button" onClick={() => ustawTekst(sugestia)} key={sugestia}>{sugestia}</button>)}</div></Karta>
        <Karta><h2><ShieldCheck aria-hidden="true" /> Kontrola działań</h2><p>Echo może proponować zmiany. Działania o podwyższonym ryzyku wykona dopiero po Twoim potwierdzeniu.</p></Karta>
        <Karta><h2>Ostatnie działania</h2>{dziennik.length === 0 ? <p className="tekst-pomocniczy">Echo nie wykonało jeszcze żadnych działań.</p> : dziennik.slice(0, 6).map((wpis) => <div className="wpis-audytu" key={wpis.id}><strong>{wpis.opis}</strong><small>{new Date(wpis.createdAt).toLocaleString('pl-PL')} · {wpis.wynik}</small></div>)}</Karta>
      </aside>
    </section>
    {oczekujacaAkcja && <ModalPotwierdzenia tytul="Potwierdź działanie Echo" opis={oczekujacaAkcja.opis} etykietaAkcji="Potwierdź i wykonaj" niebezpieczne={oczekujacaAkcja.ryzyko === 'wysokie'} anuluj={anulujPotwierdzenie} potwierdz={potwierdz} />}
  </div>
}
