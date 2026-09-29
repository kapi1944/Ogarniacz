import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { utworzKonfiguracjeSerwera } from './config.ts'
import { BladModeluEcho, utworzObslugeModeluEcho } from './model-echo.ts'

const zadanie = {
  format: { type: 'object', properties: { typ: { type: 'string' } } },
  messages: [
    { role: 'system' as const, content: 'Odpowiadaj strukturalnie.' },
    { role: 'user' as const, content: '{"wiadomosc":"Cześć"}' },
  ],
}

function konfiguracja() {
  return utworzKonfiguracjeSerwera({
    ECHO_MODEL_URL: 'http://127.0.0.1:11434/api/chat',
    ECHO_MODEL: 'model-testowy',
  })
}

test('backend wysyła zadanie do lokalnego Ollama i dodaje prywatną nazwę modelu', async () => {
  let wyslane: Record<string, unknown> | undefined
  const pobierz = async (_adres: string | URL | Request, inicjalizacja?: RequestInit) => {
    wyslane = JSON.parse(String(inicjalizacja?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ message: { content: '{"typ":"odpowiedz"}' } }))
  }
  const wynik = await utworzObslugeModeluEcho(konfiguracja(), pobierz)(zadanie, new AbortController().signal)

  assert.deepEqual(wynik, { message: { content: '{"typ":"odpowiedz"}' } })
  assert.equal(wyslane?.model, 'model-testowy')
  assert.equal(wyslane?.stream, false)
  assert.deepEqual(wyslane?.options, { temperature: 0 })
})

test('backend zwraca kontrolowany błąd niedostępnego modelu', async () => {
  const obsluga = utworzObslugeModeluEcho(konfiguracja(), async () => {
    throw new Error('ECONNREFUSED')
  })
  await assert.rejects(obsluga(zadanie, new AbortController().signal), (blad: unknown) => {
    assert.ok(blad instanceof BladModeluEcho)
    assert.equal(blad.statusHttp, 503)
    return true
  })
})

test('backend anuluje Ollama po przekroczeniu czasu', async () => {
  const ustawienia = { ...konfiguracja(), limitCzasuModeluEchoMs: 10 }
  const obsluga = utworzObslugeModeluEcho(ustawienia, async (_adres, inicjalizacja) => new Promise<Response>((_rozwiaz, odrzuc) => {
    inicjalizacja?.signal?.addEventListener('abort', () => odrzuc(new DOMException('Anulowano', 'AbortError')), { once: true })
  }))
  await assert.rejects(obsluga(zadanie, new AbortController().signal), (blad: unknown) => {
    assert.ok(blad instanceof BladModeluEcho)
    assert.equal(blad.statusHttp, 504)
    return true
  })
})

test('backend odrzuca niepoprawny JSON odpowiedzi Ollama', async () => {
  const obsluga = utworzObslugeModeluEcho(konfiguracja(), async () => new Response('{nie-json'))
  await assert.rejects(obsluga(zadanie, new AbortController().signal), (blad: unknown) => {
    assert.ok(blad instanceof BladModeluEcho)
    assert.equal(blad.statusHttp, 502)
    return true
  })
})

test('klient nie zawiera adresu Ollama ani zmiennych modelu Vite', async () => {
  const klient = await Promise.all([
    readFile(new URL('../src/services/echo/AgentEcho.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/echo/LokalnyModelProviderEcho.ts', import.meta.url), 'utf8'),
  ])
  assert.doesNotMatch(klient.join('\n'), /VITE_ECHO_MODEL|11434|\/api\/chat/)
})
