import type { ElementSkrzynki } from '../domain/typy'
import { przeksztalcElementInbox, type TypKonwersjiInbox } from './PoczekalniaService'
import { rejestrAkcjiDomenowychPolSystemowych, rejestrResolverowPolSystemowych } from './KontraktPolSystemowychRejestru'

export const POLE_AKCJI_PRZEKSZTALCENIA_POCZEKALNI = {
  id: 'system:przeksztalc',
  zrodlo: 'systemowe',
  trybObslugi: 'akcja_domenowa',
  actionId: 'action:poczekalnia-przeksztalc',
  etykieta: 'Przekształć',
  typ: 'checkbox',
} as const

rejestrResolverowPolSystemowych.zarejestruj<ElementSkrzynki>({
  id: 'resolver:poczekalnia-status',
  wyznaczRevision: ({ encja }) => `${encja.updatedAt}:${encja.status}`,
  rozwiaz: ({ encja }) => encja.status === 'przetworzone' ? 'Przetworzone' : 'Do sklasyfikowania',
})

rejestrResolverowPolSystemowych.zarejestruj<ElementSkrzynki>({
  id: 'resolver:poczekalnia-wynik-przeksztalcenia',
  wyznaczRevision: ({ encja }) => `${encja.updatedAt}:${encja.przeksztalconoNa?.typ ?? ''}:${encja.przeksztalconoNa?.id ?? ''}`,
  rozwiaz: ({ encja }) => encja.przeksztalconoNa ? `${encja.przeksztalconoNa.typ}: ${encja.przeksztalconoNa.id}` : '—',
})

rejestrAkcjiDomenowychPolSystemowych.zarejestruj<ElementSkrzynki>({
  id: 'action:poczekalnia-przeksztalc',
  wykonaj: async ({ encja, daneZrodlowe }) => {
    const typ = daneZrodlowe.typ
    const zapiszWynik = daneZrodlowe.zapiszWynik
    if (!['zadanie', 'notatka', 'przypomnienie', 'zakup', 'projekt', 'pomysl', 'na_pozniej', 'wizyta'].includes(String(typ)) || typeof zapiszWynik !== 'function') {
      throw new Error('Przekształcenie wymaga prawidłowego typu docelowego.')
    }
    zapiszWynik(await przeksztalcElementInbox(encja, typ as TypKonwersjiInbox))
  },
})

export async function przeksztalcPoczekalniePrzezRejestr(
  element: ElementSkrzynki,
  typ: TypKonwersjiInbox,
): Promise<{ typ: string; id: string }> {
  let wynik: { typ: string; id: string } | undefined
  await rejestrAkcjiDomenowychPolSystemowych.uruchom(POLE_AKCJI_PRZEKSZTALCENIA_POCZEKALNI, {
    encja: element,
    daneZrodlowe: { typ, zapiszWynik: (nowyWynik: { typ: string; id: string }) => { wynik = nowyWynik } },
  })
  if (!wynik) throw new Error('Nie udało się odczytać wyniku przekształcenia.')
  return wynik
}
