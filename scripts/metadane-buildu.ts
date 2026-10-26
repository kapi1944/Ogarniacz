import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

export function odczytajMetadaneBuildu(katalog: string, srodowisko: NodeJS.ProcessEnv = process.env) {
  const wykonajGit = (...argumenty: string[]) => execFileSync('git', ['-C', katalog, ...argumenty], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000,
  }).trim()
  let sha: string | null = null
  let zmodyfikowany: boolean | null = null
  try {
    // Archiwum przygotowane wewnątrz innego checkoutu nie może odziedziczyć jego HEAD.
    if (resolve(wykonajGit('rev-parse', '--show-toplevel')) === resolve(katalog)) {
      sha = wykonajGit('rev-parse', 'HEAD')
      zmodyfikowany = Boolean(wykonajGit('status', '--porcelain', '--untracked-files=normal'))
    }
  } catch { /* Archiwum Git na Raspberry otrzymuje SHA od istniejącego skryptu aktualizacji. */ }
  if (!sha && /^[a-f0-9]{40}$/i.test(srodowisko.GITHUB_SHA ?? '')) sha = srodowisko.GITHUB_SHA!
  if (sha && !/^[a-f0-9]{40}$/i.test(sha)) sha = null
  return { sha: sha?.toLowerCase() ?? null, zmodyfikowany, data: new Date().toISOString() }
}
