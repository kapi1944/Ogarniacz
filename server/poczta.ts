import nodemailer from 'nodemailer'

export interface KonfiguracjaPoczty {
  dostawca: 'smtp' | 'resend'
  nadawca: string
  adresAplikacji: string
  smtp?: { host: string; port: number; tls: boolean; login: string; haslo: string }
  kluczApi?: string
}

export interface Poczta {
  wyslijLink: (email: string, link: string) => Promise<void>
}

export function odczytajKonfiguracjePoczty(env: NodeJS.ProcessEnv): KonfiguracjaPoczty | undefined {
  const dostawca = env.MAIL_PROVIDER?.trim()
  if (!dostawca || dostawca === 'off') return undefined
  if (dostawca !== 'smtp' && dostawca !== 'resend') throw new Error('MAIL_PROVIDER: wybierz smtp, resend lub off.')
  const nadawca = env.MAIL_FROM?.trim() ?? ''
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(nadawca) || nadawca.length > 254) throw new Error('MAIL_FROM musi zawierać jeden adres e-mail.')
  let adres: URL
  try { adres = new URL(env.PASSWORD_RESET_ORIGIN ?? '') }
  catch { throw new Error('PASSWORD_RESET_ORIGIN musi wskazywać zaufany origin HTTPS aplikacji.') }
  if (adres.protocol !== 'https:' || adres.origin !== env.PASSWORD_RESET_ORIGIN || adres.username || adres.password) {
    throw new Error('PASSWORD_RESET_ORIGIN musi wskazywać zaufany origin HTTPS bez ścieżki.')
  }
  const wspolne = { dostawca, nadawca, adresAplikacji: adres.origin }
  if (dostawca === 'resend') {
    if (!env.MAIL_API_KEY?.trim()) throw new Error('MAIL_API_KEY jest wymagany dla Resend.')
    return { ...wspolne, dostawca, kluczApi: env.MAIL_API_KEY.trim() }
  }
  const host = env.SMTP_HOST?.trim() ?? ''
  const port = Number(env.SMTP_PORT ?? 465)
  const tls = env.SMTP_SECURE ?? 'true'
  if (!host || /[\s/:]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !['true', 'false'].includes(tls)) throw new Error('Sprawdź SMTP_HOST, SMTP_PORT i SMTP_SECURE (true/false).')
  if (!env.SMTP_USER || !env.SMTP_PASSWORD) throw new Error('SMTP_USER i SMTP_PASSWORD są wymagane.')
  return { ...wspolne, dostawca, smtp: { host, port, tls: tls === 'true', login: env.SMTP_USER, haslo: env.SMTP_PASSWORD } }
}

export function utworzPoczte(konfiguracja?: KonfiguracjaPoczty): Poczta | undefined {
  if (!konfiguracja) return undefined
  const smtp = konfiguracja.smtp
  const transport = smtp ? nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.tls, requireTLS: true,
    auth: { user: smtp.login, pass: smtp.haslo },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    logger: false, debug: false,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 10_000,
    disableFileAccess: true, disableUrlAccess: true,
  }) : undefined
  let wysylane = 0
  return { async wyslijLink(email, link) {
    if (wysylane >= 10) throw new Error('Poczta jest zajęta.')
    wysylane += 1
    try {
      const wiadomosc = {
        from: konfiguracja.nadawca, to: email, subject: 'Ogarniacz — ustaw nowe hasło',
        text: `Aby ustawić nowe hasło konta Ogarniacza, otwórz link:\n\n${link}\n\nLink jest jednorazowy i ważny 15 minut. Wymaga dostępu do prywatnej sieci Tailscale. Jeśli nie prosisz o zmianę hasła, zignoruj tę wiadomość.`,
      }
      if (transport) {
        const wynik = await transport.sendMail(wiadomosc)
        if (!wynik.accepted.length) throw new Error('Wiadomość nie została przyjęta.')
      } else {
        const odpowiedz = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { authorization: `Bearer ${konfiguracja.kluczApi}`, 'content-type': 'application/json' },
          body: JSON.stringify({ ...wiadomosc, to: [email] }), signal: AbortSignal.timeout(10_000), redirect: 'error',
        })
        await odpowiedz.body?.cancel()
        if (!odpowiedz.ok) throw new Error('Wiadomość nie została przyjęta.')
      }
    } finally { wysylane -= 1 }
  } }
}
