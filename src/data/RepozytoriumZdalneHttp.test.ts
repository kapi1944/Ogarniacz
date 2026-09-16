import { afterEach, expect, it, vi } from 'vitest'
import { CapacitorHttp } from '@capacitor/core'
import { RepozytoriumZdalneHttp } from './RepozytoriumZdalneHttp'

afterEach(() => vi.restoreAllMocks())

it('wysyła sync do skonfigurowanego hosta z cookie, ID i timeoutem', async () => {
  const pobierz = vi.spyOn(CapacitorHttp, 'get').mockResolvedValue({ status: 200, data: { zmiany: [], synchronizowanoDo: '2026-09-16T00:00:00Z' }, headers: {}, url: '' })
  const repo = new RepozytoriumZdalneHttp('https://raspberrypi.tailb0bcf2.ts.net', undefined, () => 'instalacja-testowa')
  await expect(repo.pobierzZmiany('1970-01-01')).resolves.toEqual([])
  expect(pobierz).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://raspberrypi.tailb0bcf2.ts.net/api/sync/changes?od=1970-01-01', connectTimeout: 15000, readTimeout: 15000, webFetchExtra: { credentials: 'include' }, headers: expect.objectContaining({ 'x-ogarniacz-installation-id': 'instalacja-testowa' }) }))
  expect(repo.pobierzKursor()).toBe('2026-09-16T00:00:00Z')
})

it('rozpoznaje błąd DNS jako obiekt z mostu Androida i wskazuje Tailscale', async () => {
  vi.spyOn(CapacitorHttp, 'get').mockRejectedValue({ message: 'Unable to resolve host raspberrypi.tailb0bcf2.ts.net' })
  const repo = new RepozytoriumZdalneHttp('https://raspberrypi.tailb0bcf2.ts.net', undefined, () => 'instalacja-testowa')
  await expect(repo.pobierzZmiany('1970-01-01')).rejects.toThrow('Tailscale')
})

vi.mock('@capacitor/core', async (oryginal) => ({ ...await oryginal<typeof import('@capacitor/core')>(), CapacitorHttp: { get: vi.fn() } }))
