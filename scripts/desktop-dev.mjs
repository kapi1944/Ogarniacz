import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join } from 'node:path'

// Tryb developerski: niezależne okno Edge + lokalny Vite. Instalator produkcyjny
// korzysta z HTTPS Raspberry Pi (Windows WebView2), nigdy z tego serwera dev.
const url = 'http://127.0.0.1:5173/'
const root = process.cwd()
const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  stdio: 'inherit', shell: false,
})

const stop = () => { if (!vite.killed) vite.kill('SIGTERM') }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop)
process.on('exit', stop)

async function waitForVite() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (vite.exitCode !== null) throw new Error('Vite zakończył działanie przed uruchomieniem okna.')
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch { /* Serwer dopiero startuje. */ }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error('Vite nie odpowiada pod adresem ' + url)
}

async function chooseBrowser() {
  if (process.platform === 'win32') {
    const roots = [process.env['PROGRAMFILES(X86)'], process.env.PROGRAMFILES, process.env.LOCALAPPDATA].filter(Boolean)
    const variants = roots.flatMap((p) => [join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe')])
    for (const path of variants) {
      try { await access(path); return path } catch { /* kolejny kandydat */ }
    }
    return 'msedge.exe'
  }
  return process.platform === 'darwin' ? 'open' : 'microsoft-edge'
}

try {
  await waitForVite()
  const executable = await chooseBrowser()
  const args = process.platform === 'darwin' ? ['-a', 'Microsoft Edge', '--args', `--app=${url}`] : [`--app=${url}`]
  const edge = spawn(executable, args, { stdio: 'ignore', detached: true })
  edge.on('error', (error) => console.error('Nie udało się uruchomić Edge:', error.message, '\nAdres Vite:', url))
  edge.unref()
  console.log('Ogarniacz desktop:dev:', url)
} catch (error) {
  console.error(error.message)
  stop()
  process.exitCode = 1
}
