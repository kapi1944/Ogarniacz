import { PoleCzasu } from '../../components/PoleCzasu'
import type { KonfiguracjaKokpitu } from '../../domain/kokpit'

const dniTygodnia = ['Nie', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob']
const pelneDni = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']

export function KonfiguratorPrywatnosci({ konfiguracja, zmien }: { konfiguracja: KonfiguracjaKokpitu; zmien: (nowa: KonfiguracjaKokpitu) => void }) {
  const { harmonogram } = konfiguracja
  const ustaw = (reguly: KonfiguracjaKokpitu['harmonogram']) => zmien({ ...konfiguracja, harmonogram: reguly })
  return <details>
    <summary>Prywatność i harmonogram</summary>
    <div className="kokpit__ustawienia">
      <label><input type="checkbox" checked={konfiguracja.prywatnyWPracy}
        onChange={(zdarzenie) => zmien({ ...konfiguracja, prywatnyWPracy: zdarzenie.target.checked })} /> Podczas pracy używaj trybu prywatnego</label>
      <p>Pierwszy pasujący przedział ma pierwszeństwo. Jeśli koniec jest wcześniejszy niż początek, przedział trwa do następnego dnia.</p>
      {harmonogram.map((regula, pozycja) => {
        const zmienRegule = (zmiana: Partial<typeof regula>) => ustaw(harmonogram.map((element) => element.id === regula.id ? { ...regula, ...zmiana } : element))
        return <fieldset key={regula.id} className="kokpit__ustawienia">
          <legend>Przedział {pozycja + 1}</legend>
          <div className="kokpit__akcje">
            {dniTygodnia.map((dzien, indeks) => <label key={dzien}><input type="checkbox" aria-label={pelneDni[indeks]}
              checked={regula.dni.includes(indeks)} onChange={(zdarzenie) => zmienRegule({ dni: zdarzenie.target.checked ? [...regula.dni, indeks] : regula.dni.filter((id) => id !== indeks) })} /> {dzien}</label>)}
          </div>
          <div className="kokpit__pola">
            <PoleCzasu etykieta="Początek" wartosc={regula.od} zmien={(od) => zmienRegule({ od })} wymagane />
            <PoleCzasu etykieta="Koniec" wartosc={regula.do} zmien={(koniec) => zmienRegule({ do: koniec })} wymagane />
            <label>Tryb<select value={regula.tryb} onChange={(zdarzenie) => zmienRegule({ tryb: zdarzenie.target.value as typeof regula.tryb })}>
              <option value="publiczny">Publiczny</option><option value="prywatny">Prywatny</option>
            </select></label>
            <button type="button" className="przycisk" onClick={() => ustaw(harmonogram.filter(({ id }) => id !== regula.id))}>Usuń przedział</button>
          </div>
        </fieldset>
      })}
      <button type="button" className="przycisk" disabled={harmonogram.length >= 64} onClick={() => ustaw([...harmonogram, {
        id: crypto.randomUUID(), dni: [1, 2, 3, 4, 5], od: '10:00', do: '16:00', tryb: 'publiczny',
      }])}>Dodaj przedział</button>
    </div>
  </details>
}
