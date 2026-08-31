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
