import { STYLE_INTERFEJSU, type StylInterfejsu } from '../../domain/personalizacja'

export function WyborStyluInterfejsu({ styl, zmien }: {
  styl: StylInterfejsu
  zmien: (styl: StylInterfejsu) => void
}) {
  return <label className="pole wybor-stylu">
    <span>Styl interfejsu</span>
    <select value={styl} onChange={(zdarzenie) => zmien(zdarzenie.target.value as StylInterfejsu)}>
      {STYLE_INTERFEJSU.map((opcja) => <option key={opcja.id} value={opcja.id}>{opcja.nazwa}</option>)}
    </select>
    <small>{STYLE_INTERFEJSU.find((opcja) => opcja.id === styl)?.opis}</small>
    <small>Podgląd przed zapisem. Jasny / ciemny motyw wybierasz osobno; własna paleta ma pierwszeństwo.</small>
  </label>
}
