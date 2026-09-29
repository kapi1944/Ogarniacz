import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { utworzKonfiguracjeSerwera } from './config.ts'
import { AdapterHomeAssistant, BladSmartHome, utworzDostawceSmartHome } from './smart-home.ts'

const ADRES = 'http://homeassistant.local:8123'
const TOKEN_TESTOWY = 'token-wylacznie-do-testu'

function stan(id = 'light.salon', wartosc = 'on', atrybuty: Record<string, unknown> = {}) {
  return { entity_id: id, state: wartosc, attributes: atrybuty, last_changed: '2026-09-29T10:00:00Z' }
}

function adapter(pobierz: typeof fetch, limitCzasuMs = 100): AdapterHomeAssistant {
  return new AdapterHomeAssistant(ADRES, TOKEN_TESTOWY, limitCzasuMs, pobierz)
}

test('Home Assistant dostępny zwraca kontrolowany health bez szczegółów konfiguracji', async () => {
  let autoryzacja: string | null = null
  const dostawca = adapter(async (_adres, inicjalizacja) => {
    autoryzacja = new Headers(inicjalizacja?.headers).get('authorization')
    return new Response(JSON.stringify({ message: 'API running.' }))
  })

  assert.deepEqual(await dostawca.sprawdzDostepnosc(), { dostepny: true })
  assert.equal(autoryzacja, `Bearer ${TOKEN_TESTOWY}`)
})

test('niedostępny Home Assistant daje kontrolowany stan niedostępności', async () => {
  const dostawca = adapter(async () => { throw new Error('ECONNREFUSED') })
  assert.deepEqual(await dostawca.sprawdzDostepnosc(), { dostepny: false })
})

test('timeout Home Assistant anuluje żądanie i nie zawiesza healthchecku', async () => {
  let anulowano = false
  const dostawca = adapter(async (_adres, inicjalizacja) => new Promise<Response>((_rozwiaz, odrzuc) => {
    inicjalizacja?.signal?.addEventListener('abort', () => {
      anulowano = true
      odrzuc(new DOMException('Anulowano', 'AbortError'))
    }, { once: true })
  }), 10)

  assert.deepEqual(await dostawca.sprawdzDostepnosc(), { dostepny: false })
  assert.equal(anulowano, true)
})

test('lista encji ma ograniczoną neutralną projekcję', async () => {
  const dostawca = adapter(async () => new Response(JSON.stringify([
    stan('light.salon', 'on', { friendly_name: 'Salon', device_class: 'light', jasnosc: 80, sekret: TOKEN_TESTOWY }),
    stan('sensor.temperatura', '21.5', { friendly_name: 'Temperatura', unit_of_measurement: '°C' }),
  ])))

  assert.deepEqual(await dostawca.listaEncji(), [
    { id: 'light.salon', domena: 'light', nazwa: 'Salon', stan: 'on', dostepna: true, klasaUrzadzenia: 'light' },
    { id: 'sensor.temperatura', domena: 'sensor', nazwa: 'Temperatura', stan: '21.5', dostepna: true, jednostka: '°C' },
  ])
})

test('pobiera stan istniejącej encji', async () => {
  const dostawca = adapter(async (adres) => {
    assert.equal(String(adres), `${ADRES}/api/states/switch.czajnik`)
    return new Response(JSON.stringify(stan('switch.czajnik', 'off', { friendly_name: 'Czajnik' })))
  })

  assert.deepEqual(await dostawca.pobierzStan('switch.czajnik'), {
    id: 'switch.czajnik', domena: 'switch', nazwa: 'Czajnik', stan: 'off', dostepna: true,
  })
})

test('brak encji zwraca undefined zamiast fikcyjnego stanu', async () => {
  const dostawca = adapter(async () => new Response('{}', { status: 404 }))
  assert.equal(await dostawca.pobierzStan('light.brak'), undefined)
})

test('włączenie encji używa stałej usługi i jawnego umiarkowanego ryzyka', async () => {
  let dane: unknown
  const dostawca = adapter(async (adres, inicjalizacja) => {
    assert.equal(String(adres), `${ADRES}/api/services/homeassistant/turn_on`)
    dane = JSON.parse(String(inicjalizacja?.body)) as unknown
    return new Response('[]')
  })

  assert.deepEqual(await dostawca.wlacz('light.salon'), {
    wykonano: true, akcja: 'wlacz', encjaId: 'light.salon', ryzyko: 'umiarkowane',
  })
  assert.deepEqual(dane, { entity_id: 'light.salon' })
})

test('wyłączenie encji używa stałej usługi i jawnego umiarkowanego ryzyka', async () => {
  const dostawca = adapter(async (adres, inicjalizacja) => {
    assert.equal(String(adres), `${ADRES}/api/services/homeassistant/turn_off`)
    assert.deepEqual(JSON.parse(String(inicjalizacja?.body)), { entity_id: 'switch.czajnik' })
    return new Response('[]')
  })

  assert.deepEqual(await dostawca.wylacz('switch.czajnik'), {
    wykonano: true, akcja: 'wylacz', encjaId: 'switch.czajnik', ryzyko: 'umiarkowane',
  })
})

test('błąd API jest ogólny i nie przekazuje treści odpowiedzi Home Assistant', async () => {
  const dostawca = adapter(async () => new Response(JSON.stringify({ error: TOKEN_TESTOWY }), { status: 500 }))
  await assert.rejects(dostawca.listaEncji(), (blad: unknown) => {
    assert.ok(blad instanceof BladSmartHome)
    assert.equal(blad.kod, 'api')
    assert.doesNotMatch(blad.message, new RegExp(TOKEN_TESTOWY))
    return true
  })
})

test('token nie wydostaje się do projekcji, błędów ani zwykłych logów adaptera', async () => {
  const dostawca = adapter(async () => new Response(JSON.stringify([
    stan('sensor.test', 'ok', { friendly_name: 'Test', token: TOKEN_TESTOWY }),
  ])))
  const wynik = await dostawca.listaEncji()
  const kodAdaptera = await readFile(new URL('./smart-home.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(JSON.stringify(wynik), new RegExp(TOKEN_TESTOWY))
  assert.doesNotMatch(kodAdaptera, /console\.(?:log|info|warn|error)/)
})

test('brak konfiguracji Home Assistant nie blokuje konfiguracji ani startu niedostępnego providera', async () => {
  const konfiguracja = utworzKonfiguracjeSerwera({})
  const dostawca = utworzDostawceSmartHome({
    adres: konfiguracja.adresHomeAssistant,
    token: konfiguracja.tokenHomeAssistant,
    limitCzasuMs: konfiguracja.limitCzasuHomeAssistantMs,
  })

  assert.equal(konfiguracja.adresHomeAssistant, undefined)
  assert.deepEqual(await dostawca.sprawdzDostepnosc(), { dostepny: false })
  assert.deepEqual(await dostawca.listaEncji(), [])
})

test('konfiguracja Home Assistant wymaga pary URL i tokenu oraz chroni token przed publicznym HTTP', () => {
  const konfiguracja = utworzKonfiguracjeSerwera({
    HOME_ASSISTANT_URL: ADRES,
    HOME_ASSISTANT_TOKEN: TOKEN_TESTOWY,
  })

  assert.equal(konfiguracja.adresHomeAssistant, ADRES)
  assert.equal(konfiguracja.tokenHomeAssistant, TOKEN_TESTOWY)
  assert.throws(() => utworzKonfiguracjeSerwera({ HOME_ASSISTANT_URL: ADRES }), /ustawione razem/)
  assert.throws(() => utworzKonfiguracjeSerwera({ HOME_ASSISTANT_URL: 'http://public.example.com', HOME_ASSISTANT_TOKEN: TOKEN_TESTOWY }), /prywatny host/)
})
