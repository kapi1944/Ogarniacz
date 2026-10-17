import { strict as assert } from 'node:assert'
import { test, mock } from 'node:test'
import { createServer as utworzSerwerSmtp, type Socket as Gniazdo } from 'node:net'
import nodemailer from 'nodemailer'
import { odczytajKonfiguracjePoczty, utworzPoczte } from './poczta.ts'

const wspolne = { MAIL_FROM: 'nadawca@example.test', PASSWORD_RESET_ORIGIN: 'https://pi.tailnet.ts.net' }
const smtp = { ...wspolne, MAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.test', SMTP_USER: 'syntetyczny-login', SMTP_PASSWORD: 'syntetyczne-haslo' }

test('poczta jest domyślnie wyłączona, a włączenie wymaga kompletnych ustawień i zaufanego HTTPS', () => {
  assert.equal(odczytajKonfiguracjePoczty({}), undefined)
  assert.equal(utworzPoczte(), undefined)
  assert.equal(odczytajKonfiguracjePoczty({ MAIL_PROVIDER: 'off', MAIL_API_KEY: 'ignorowany' }), undefined)
  for (const zmiany of [
    { MAIL_PROVIDER: 'nieznany' }, { MAIL_FROM: '' }, { MAIL_FROM: 'a@example.test\r\nBcc: b@example.test' },
    { PASSWORD_RESET_ORIGIN: 'http://pi.tailnet.ts.net' }, { PASSWORD_RESET_ORIGIN: 'https://pi.tailnet.ts.net/' },
    { PASSWORD_RESET_ORIGIN: 'https://login:haslo@pi.tailnet.ts.net' }, { PASSWORD_RESET_ORIGIN: 'https://pi.tailnet.ts.net/?token=sekret' },
    { SMTP_HOST: '' }, { SMTP_PORT: '0' }, { SMTP_SECURE: 'yes' }, { SMTP_PASSWORD: '' }, { SMTP_USER: '' },
  ]) assert.throws(() => odczytajKonfiguracjePoczty({ ...smtp, ...zmiany }))
  assert.throws(() => odczytajKonfiguracjePoczty({ ...wspolne, MAIL_PROVIDER: 'resend' }))
  assert.equal(odczytajKonfiguracjePoczty(smtp)?.smtp?.port, 465)
  assert.equal(odczytajKonfiguracjePoczty({ ...smtp, SMTP_SECURE: 'false', SMTP_PORT: '587' })?.smtp?.tls, false)
})

test('SMTP wymaga TLS, nie loguje protokołu i wysyła wyłącznie tekstowy link bez załączników', async () => {
  const wiadomosci: unknown[] = []
  const utworzenie = mock.method(nodemailer, 'createTransport', ((opcje: unknown) => {
    const ustawienia = opcje as Record<string, unknown>
    assert.equal(ustawienia.requireTLS, true)
    assert.equal(ustawienia.logger, false)
    assert.equal(ustawienia.debug, false)
    assert.equal(ustawienia.disableFileAccess, true)
    assert.equal(ustawienia.disableUrlAccess, true)
    assert.deepEqual(ustawienia.tls, { minVersion: 'TLSv1.2', rejectUnauthorized: true })
    return { sendMail: async (wiadomosc: unknown) => { wiadomosci.push(wiadomosc); return { accepted: ['konto@example.test'] } } }
  }) as typeof nodemailer.createTransport)
  try {
    const poczta = utworzPoczte(odczytajKonfiguracjePoczty(smtp))!
    await poczta.wyslijLink('konto@example.test', wspolne.PASSWORD_RESET_ORIGIN + '/#reset-hasla=syntetyczny-token')
    assert.equal(utworzenie.mock.callCount(), 1)
    const wiadomosc = wiadomosci[0] as Record<string, unknown>
    assert.equal(wiadomosc.to, 'konto@example.test')
    assert.match(String(wiadomosc.text), /#reset-hasla=syntetyczny-token/)
    assert.match(String(wiadomosc.text), /15 minut/)
    assert.equal(wiadomosc.html, undefined)
    assert.equal(wiadomosc.attachments, undefined)
  } finally { utworzenie.mock.restore() }
})

test('Resend używa stałego HTTPS, ograniczonego czasu, nie przekazuje odpowiedzi dostawcy i blokuje przeciążenie', async () => {
  let awaria = false
  const wysylka = mock.method(globalThis, 'fetch', (async (adres: unknown, opcje?: RequestInit) => {
    assert.equal(adres, 'https://api.resend.com/emails')
    assert.equal(opcje?.redirect, 'error')
    assert.ok(opcje?.signal)
    assert.deepEqual(opcje?.headers, { authorization: 'Bearer syntetyczny-klucz', 'content-type': 'application/json' })
    assert.deepEqual(JSON.parse(String(opcje?.body)).to, ['konto@example.test'])
    return new Response(awaria ? 'sekrety-dostawcy' : '{}', { status: awaria ? 401 : 200 })
  }) as typeof fetch)
  try {
    const poczta = utworzPoczte(odczytajKonfiguracjePoczty({ ...wspolne, MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'syntetyczny-klucz' }))!
    await poczta.wyslijLink('konto@example.test', 'https://pi.tailnet.ts.net/#reset-hasla=syntetyczny-token')
    awaria = true
    await assert.rejects(poczta.wyslijLink('konto@example.test', 'link'), { message: 'Wiadomość nie została przyjęta.' })
    awaria = false
    const wyniki = await Promise.allSettled(Array.from({ length: 11 }, () => poczta.wyslijLink('konto@example.test', 'link')))
    assert.equal(wyniki.filter((wynik) => wynik.status === 'rejected').length, 1)
    await poczta.wyslijLink('konto@example.test', 'link')
  } finally { wysylka.mock.restore() }
})

test('rzeczywisty transport SMTP odrzuca serwer bez STARTTLS przed wysłaniem loginu lub wiadomości', async () => {
  let polecenia = ''
  const gniazda = new Set<Gniazdo>()
  const serwer = utworzSerwerSmtp((gniazdo) => {
    gniazda.add(gniazdo)
    gniazdo.on('close', () => gniazda.delete(gniazdo))
    gniazdo.write('220 smtp.test ESMTP\r\n')
    gniazdo.on('data', (dane) => {
      const tekst = dane.toString()
      polecenia += tekst
      if (tekst.startsWith('EHLO')) gniazdo.write('250-smtp.test\r\n250 AUTH PLAIN\r\n')
      else gniazdo.write('500 TLS niedostępny\r\n')
    })
  })
  await new Promise<void>((gotowe) => serwer.listen(0, '127.0.0.1', gotowe))
  const adres = serwer.address()
  assert.ok(adres && typeof adres === 'object')
  try {
    const poczta = utworzPoczte(odczytajKonfiguracjePoczty({ ...smtp, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(adres.port), SMTP_SECURE: 'false' }))!
    await assert.rejects(poczta.wyslijLink('konto@example.test', 'https://pi.tailnet.ts.net/#reset-hasla=syntetyczny-token'))
    assert.match(polecenia, /STARTTLS/)
    assert.doesNotMatch(polecenia, /AUTH|MAIL FROM|RCPT TO|DATA|syntetyczny-token|syntetyczny-login/)
  } finally {
    for (const gniazdo of gniazda) gniazdo.destroy()
    await new Promise<void>((gotowe) => serwer.close(() => gotowe()))
  }
})
