import { readFileSync as czytajPlik } from 'node:fs'
import { runInNewContext as uruchomWKontekscie } from 'node:vm'
import { test as sprawdz } from 'node:test'
import { strict as wymagaj } from 'node:assert'

sprawdz('kliknięcie PWA otwiera dokładną dawkę bez potwierdzania przyjęcia; blokuje obcy adres', async () => {
  const odbiorniki = {}
  const otwarte = []
  let zamkniete = 0
  const sciezka = '/zdrowie/leki?element=lek&wystapienie=dawka&dataDawki=2026-10-11&wersjaDawki=stan'
  uruchomWKontekscie(czytajPlik(new URL('../public/powiadomienia-sw.js', import.meta.url), 'utf8'), { URL, self: {
    location: { origin: 'https://ogarniacz.test' }, addEventListener: (typ, odbiornik) => { odbiorniki[typ] = odbiornik },
    clients: { matchAll: async () => [], openWindow: (adres) => { otwarte.push(adres) } },
  } })
  let wykonanie
  odbiorniki.notificationclick({ notification: { close: () => { zamkniete += 1 }, data: { sciezka } }, waitUntil: (obietnica) => { wykonanie = obietnica } })
  await wykonanie
  wymagaj.deepEqual(otwarte, [`https://ogarniacz.test${sciezka}`])
  wymagaj.equal(zamkniete, 1)
  odbiorniki.notificationclick({ notification: { close: () => {}, data: { sciezka: '//inna.test/zdrowie/leki' } }, waitUntil: () => { throw new Error('Obcy adres') } })
  wymagaj.equal(otwarte.length, 1)
})

sprawdz('kliknięcie PWA odnajduje istniejące okno i przechodzi do dawki', async () => {
  const odbiorniki = {}
  const dzialania = []
  uruchomWKontekscie(czytajPlik(new URL('../public/powiadomienia-sw.js', import.meta.url), 'utf8'), { URL, self: {
    location: { origin: 'https://ogarniacz.test' }, addEventListener: (typ, odbiornik) => { odbiorniki[typ] = odbiornik },
    clients: { matchAll: async () => [{ url: 'https://ogarniacz.test/', navigate: async (adres) => { dzialania.push(adres) }, focus: async () => { dzialania.push('pokaz') } }], openWindow: () => { throw new Error('Powielone okno') } },
  } })
  let wykonanie
  odbiorniki.notificationclick({ notification: { close: () => {}, data: { sciezka: '/zdrowie/leki?wystapienie=dawka' } }, waitUntil: (obietnica) => { wykonanie = obietnica } })
  await wykonanie
  wymagaj.deepEqual(dzialania, ['https://ogarniacz.test/zdrowie/leki?wystapienie=dawka', 'pokaz'])
})
