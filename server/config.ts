export interface KonfiguracjaSerwera {
  port: number
  host: string
  sciezkaBazy: string
  publicznyUrl?: string
  syncUserId?: string
  syncAccessKey?: string
}

function odczytajPort(wartosc: string | undefined): number {
  if (!wartosc) return 8787
  const port = Number(wartosc)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT musi być liczbą całkowitą od 1 do 65535.')
  }
  return port
}

export function utworzKonfiguracjeSerwera(env: NodeJS.ProcessEnv = process.env): KonfiguracjaSerwera {
  const sciezkaBazy = env.DATABASE_PATH?.trim() || './data/ogarniacz.sqlite'
  return {
    port: odczytajPort(env.PORT),
    host: env.HOST?.trim() || '127.0.0.1',
    sciezkaBazy,
    publicznyUrl: env.PUBLIC_URL?.trim() || undefined,
    syncUserId: env.SYNC_USER_ID?.trim() || undefined,
    syncAccessKey: env.SYNC_ACCESS_KEY?.trim() || undefined,
  }
}
