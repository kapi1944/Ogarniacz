export interface KonfiguracjaSerwera {
  port: number
  host: string
  sciezkaBazy: string
  sciezkaZasobowStatycznych: string
  ownerBootstrapToken?: string
  czasSesjiDni: number
  dozwolonePochodzeniaCors: string[]
  aktualizacjeRpi: boolean
  adresModeluEcho?: string
  nazwaModeluEcho?: string
  limitCzasuModeluEchoMs: number
}

function odczytajPort(wartosc: string | undefined): number {
  if (!wartosc) return 8787
  const port = Number(wartosc)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT musi być liczbą całkowitą od 1 do 65535.')
  }
  return port
}

function odczytajDozwolonePochodzeniaCors(wartosc: string | undefined): string[] {
  const pochodzenia = (wartosc?.split(',') ?? ['https://localhost'])
    .map((pochodzenie) => pochodzenie.trim())
    .filter(Boolean)
  for (const pochodzenie of pochodzenia) {
    let adres: URL
    try {
      adres = new URL(pochodzenie)
    } catch {
      throw new Error('CORS_ALLOWED_ORIGINS musi zawierać pełne originy HTTPS.')
    }
    if (adres.protocol !== 'https:' || adres.origin !== pochodzenie || adres.hostname.includes('*')) {
      throw new Error('CORS_ALLOWED_ORIGINS musi zawierać pełne originy HTTPS bez wildcardów.')
    }
  }
  return pochodzenia
}

function odczytajKonfiguracjeModeluEcho(env: NodeJS.ProcessEnv): Pick<KonfiguracjaSerwera, 'adresModeluEcho' | 'nazwaModeluEcho' | 'limitCzasuModeluEchoMs'> {
  const adresModeluEcho = env.ECHO_MODEL_URL?.trim() || undefined
  const nazwaModeluEcho = env.ECHO_MODEL?.trim() || undefined
  if (Boolean(adresModeluEcho) !== Boolean(nazwaModeluEcho)) throw new Error('ECHO_MODEL_URL i ECHO_MODEL muszą być ustawione razem.')
  if (adresModeluEcho) {
    let adres: URL
    try {
      adres = new URL(adresModeluEcho)
    } catch {
      throw new Error('ECHO_MODEL_URL musi być prawidłowym adresem lokalnego serwera Ollama.')
    }
    if (!['http:', 'https:'].includes(adres.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(adres.hostname)) {
      throw new Error('ECHO_MODEL_URL musi wskazywać lokalny adres loopback serwera Ollama.')
    }
  }
  if (nazwaModeluEcho && nazwaModeluEcho.length > 200) throw new Error('ECHO_MODEL jest za długie.')
  const limitCzasuModeluEchoMs = Number(env.ECHO_MODEL_TIMEOUT_MS ?? 15_000)
  if (!Number.isInteger(limitCzasuModeluEchoMs) || limitCzasuModeluEchoMs < 1_000 || limitCzasuModeluEchoMs > 120_000) {
    throw new Error('ECHO_MODEL_TIMEOUT_MS musi być liczbą całkowitą od 1000 do 120000.')
  }
  return { adresModeluEcho, nazwaModeluEcho, limitCzasuModeluEchoMs }
}

export function utworzKonfiguracjeSerwera(env: NodeJS.ProcessEnv = process.env): KonfiguracjaSerwera {
  const sciezkaBazy = env.DATABASE_PATH?.trim() || './data/ogarniacz.sqlite'
  const dozwolonePochodzeniaCors = odczytajDozwolonePochodzeniaCors(env.CORS_ALLOWED_ORIGINS)
  return {
    port: odczytajPort(env.PORT),
    host: env.HOST?.trim() || '127.0.0.1',
    sciezkaBazy,
    sciezkaZasobowStatycznych: env.STATIC_DIR?.trim() || './dist',
    ownerBootstrapToken: env.OWNER_BOOTSTRAP_TOKEN?.trim() || undefined,
    czasSesjiDni: Math.min(90, Math.max(1, Number(env.SESSION_TTL_DAYS ?? 30) || 30)),
    dozwolonePochodzeniaCors,
    aktualizacjeRpi: env.RPI_UPDATE_ENABLED === '1',
    ...odczytajKonfiguracjeModeluEcho(env),
  }
}
