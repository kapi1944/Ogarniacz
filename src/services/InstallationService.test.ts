import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('installationId', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tworzy własny identyfikator i zachowuje go po ponownym uruchomieniu modułu', async () => {
    const pierwszeUruchomienie = await import('./InstallationService')
    const installationId = pierwszeUruchomienie.pobierzInstallationId()

    vi.resetModules()
    const poRestarcie = await import('./InstallationService')

    expect(installationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(poRestarcie.pobierzInstallationId()).toBe(installationId)
  })
})

it('zachowuje identyfikator instalacji po przeładowaniu bez randomUUID', async () => {
  localStorage.removeItem('ogarniacz.installationId.v1')
  const kryptografia = globalThis.crypto
  vi.stubGlobal('crypto', { getRandomValues: kryptografia.getRandomValues.bind(kryptografia) })
  vi.resetModules()
  const pierwsza = await import('./InstallationService')
  const id = pierwsza.pobierzInstallationId()
  vi.resetModules()
  const druga = await import('./InstallationService')
  expect(druga.pobierzInstallationId()).toBe(id)
  expect(id).toMatch(/^[0-9a-f-]{36}$/)
})

it('zachowuje istniejący identyfikator przy braku crypto', async () => {
  localStorage.setItem('ogarniacz.installationId.v1', 'istniejaca-instalacja')
  vi.stubGlobal('crypto', undefined)
  vi.resetModules()
  expect((await import('./InstallationService')).pobierzInstallationId()).toBe('istniejaca-instalacja')
})
