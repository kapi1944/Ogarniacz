const KLUCZ_INSTALLATION_ID = 'ogarniacz.installationId.v1'

let installationIdWPamieci: string | undefined

export function pobierzInstallationId(): string {
  if (installationIdWPamieci) return installationIdWPamieci
  try {
    const zapisany = localStorage.getItem(KLUCZ_INSTALLATION_ID)
    if (zapisany) {
      installationIdWPamieci = zapisany
      return zapisany
    }
  } catch {
    // Pamięć przeglądarki może być niedostępna w trybie prywatnym.
  }

  installationIdWPamieci = crypto.randomUUID()
  try {
    localStorage.setItem(KLUCZ_INSTALLATION_ID, installationIdWPamieci)
  } catch {
    // Id pozostaje stabilny przynajmniej do końca bieżącej sesji.
  }
  return installationIdWPamieci
}
