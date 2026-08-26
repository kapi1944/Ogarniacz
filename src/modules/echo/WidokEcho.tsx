import { useMemo, useState, type FormEvent } from 'react'
import { Bot, Mic, Send, ShieldCheck, Volume2 } from 'lucide-react'
import { Karta, ModalPotwierdzenia, NaglowekWidoku, Znacznik } from '../../components/Interfejs'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { EchoService } from '../../services/EchoService'

interface Wiadomosc {
  id: string
  autor: 'uzytkownik' | 'echo'
  tresc: string
  ryzyko?: 'niskie' | 'umiarkowane' | 'wysokie'
}

interface RozpoznawanieMowy {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: (zdarzenie: { results: Record<number, Record<number, { transcript: string }>> }) => void
  onerror: () => void
  start: () => void
}

export function WidokEcho() {
  const echo = useMemo(() => new EchoService(), [])
  const [tekst, ustawTekst] = useState('')
  const [wiadomosci, ustawWiadomosci] = useState<Wiadomosc[]>([{ id: 'powitanie', autor: 'echo', tresc: 'Jestem lokalnym Echo. Mogę sprawdzić dzisiejsze lub zaległe zadania, zapisać zadanie/notatkę/pomysł i po potwierdzeniu przełożyć zadanie na jutro.', ryzyko: 'niskie' }])
  const [oczekujacePolecenie, ustawOczekujacePolecenie] = useState<string>()
  const [bladGlosu, ustawBladGlosu] = useState('')
  const { dane: dziennik } = useRepozytorium('dziennikEcho')

  const wyslij = async (polecenie: string, potwierdzone = false) => {
    if (!polecenie.trim()) return
    if (!potwierdzone) ustawWiadomosci((obecne) => [...obecne, { id: crypto.randomUUID(), autor: 'uzytkownik', tresc: polecenie }])
    ustawTekst('')
    const odpowiedz = await echo.obsluz(polecenie, potwierdzone)
    ustawWiadomosci((obecne) => [...obecne, { id: crypto.randomUUID(), autor: 'echo', tresc: odpowiedz.tekst, ryzyko: odpowiedz.ryzyko }])
    if (odpowiedz.wymagaPotwierdzenia) ustawOczekujacePolecenie(odpowiedz.polecenieDoPotwierdzenia)
  }

  const rozpocznijGlos = () => {
    const Konstruktor = (window as unknown as { webkitSpeechRecognition?: new () => RozpoznawanieMowy; SpeechRecognition?: new () => RozpoznawanieMowy }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => RozpoznawanieMowy }).webkitSpeechRecognition
    if (!Konstruktor) return ustawBladGlosu('Ta przeglądarka nie udostępnia rozpoznawania mowy. Echo działa w pełni tekstowo.')
    const rozpoznawanie = new Konstruktor()
    rozpoznawanie.lang = 'pl-PL'; rozpoznawanie.continuous = false; rozpoznawanie.interimResults = false
    rozpoznawanie.onresult = (zdarzenie) => ustawTekst(zdarzenie.results[0]?.[0]?.transcript ?? '')
    rozpoznawanie.onerror = () => ustawBladGlosu('Nie udało się rozpoznać mowy. Wpisz polecenie tekstowo.')
    rozpoznawanie.start()
  }

  const przeczytaj = (tresc: string) => {
    if (!('speechSynthesis' in window)) return ustawBladGlosu('Synteza mowy nie jest dostępna w tej przeglądarce.')
    speechSynthesis.speak(new SpeechSynthesisUtterance(tresc))
  }

  return <div className="widok widok-echo"><NaglowekWidoku tytul="Echo" opis="Lokalny, deterministyczny asystent bez zewnętrznego API. Dane nie opuszczają tej przeglądarki." /><section className="siatka-echo"><Karta klasa="panel-rozmowy"><div className="wiadomosci">{wiadomosci.map((wiadomosc) => <article className={`wiadomosc wiadomosc--${wiadomosc.autor}`} key={wiadomosc.id}>{wiadomosc.autor === 'echo' && <Bot aria-hidden="true" />}<div><p>{wiadomosc.tresc}</p>{wiadomosc.ryzyko && <Znacznik wariant={wiadomosc.ryzyko === 'wysokie' ? 'blad' : wiadomosc.ryzyko === 'umiarkowane' ? 'ostrzezenie' : 'neutralny'}>ryzyko: {wiadomosc.ryzyko}</Znacznik>}{wiadomosc.autor === 'echo' && <button type="button" className="przycisk-ikona" title="Odczytaj odpowiedź" onClick={() => przeczytaj(wiadomosc.tresc)}><Volume2 aria-hidden="true" /></button>}</div></article>)}</div>{bladGlosu && <p className="tekst-bledu">{bladGlosu}</p>}<form className="formularz-echo" onSubmit={(e: FormEvent) => { e.preventDefault(); wyslij(tekst) }}><button type="button" className="przycisk-ikona" title="Naciśnij i powiedz" onClick={rozpocznijGlos}><Mic aria-hidden="true" /></button><input value={tekst} onChange={(e) => ustawTekst(e.target.value)} placeholder="np. co jest najpilniejsze?" /><button type="submit" className="przycisk przycisk--glowny"><Send aria-hidden="true" />Wyślij</button></form></Karta><aside className="kolumna-echo"><Karta><h2>Przykładowe polecenia</h2><div className="sugestie-echo">{['co jeszcze dzisiaj?', 'jakie mam zaległości?', 'co jest najpilniejsze?', 'ile mam wolnego czasu?', 'zadanie kup karmę', 'notatka pomysł na weekend', 'przełóż raport na jutro'].map((sugestia) => <button type="button" onClick={() => ustawTekst(sugestia)} key={sugestia}>{sugestia}</button>)}</div></Karta><Karta><h2><ShieldCheck aria-hidden="true" /> Kontrola działań</h2><p>Niskie ryzyko jest wykonywane od razu. Zmiany harmonogramu wymagają potwierdzenia. Operacje wrażliwe są kierowane do właściwego ekranu.</p></Karta><Karta><h2>Ostatnie działania</h2>{dziennik.length === 0 ? <p className="tekst-pomocniczy">Brak działań automatycznych.</p> : dziennik.slice(0, 6).map((wpis) => <div className="wpis-audytu" key={wpis.id}><strong>{wpis.opis}</strong><small>{new Date(wpis.createdAt).toLocaleString('pl-PL')} · {wpis.wynik}</small></div>)}</Karta></aside></section>{oczekujacePolecenie && <ModalPotwierdzenia tytul="Potwierdź działanie Echo" opis={`Echo chce wykonać: „${oczekujacePolecenie}”. Ta zmiana wpływa na harmonogram.`} etykietaAkcji="Potwierdź i wykonaj" anuluj={() => ustawOczekujacePolecenie(undefined)} potwierdz={async () => { const polecenie = oczekujacePolecenie; ustawOczekujacePolecenie(undefined); await wyslij(polecenie, true) }} />}</div>
}
