import { execFileSync } from 'node:child_process'

const baza = 'refs/remotes/origin/main'
const argumenty = process.argv.slice(2)
const noweZadanie = argumenty.length === 1 && argumenty[0] === '--nowe-zadanie'
const ostrzez = (tresc) => console.warn(`Ostrzeżenie: ${tresc}`)
const git = (...argumentyGita) => execFileSync('git', ['--no-optional-locks', ...argumentyGita], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trimEnd()

try {
  if (argumenty.length && !noweZadanie) {
    throw new Error('Użycie: node scripts/check-git-workflow.mjs [--nowe-zadanie]')
  }

  const [katalog, katalogGita, wspolnyKatalogGita] = git('rev-parse', '--path-format=absolute',
    '--show-toplevel', '--git-dir', '--git-common-dir').split(/\r?\n/)
  const stan = git('status', '--porcelain=v2', '--branch', '--ahead-behind', '--untracked-files=normal').split(/\r?\n/)
  const naglowki = new Map(stan.filter((wiersz) => wiersz.startsWith('# branch.')).map((wiersz) => {
    const podzial = wiersz.indexOf(' ', 2)
    return [wiersz.slice(9, podzial), wiersz.slice(podzial + 1)]
  }))
  const galaz = naglowki.get('head')
  const upstream = naglowki.get('upstream')
  const rozbieznosc = naglowki.get('ab')
  const bezCommita = naglowki.get('oid') === '(initial)'

  console.log(`Worktree: ${katalog}${katalogGita !== wspolnyKatalogGita ? ' (powiązane)' : ''}`)
  console.log('Porównanie korzysta z danych lokalnych. Aktualność referencji potwierdza osobny fetch.')
  if (galaz === '(detached)') ostrzez('Detached HEAD — ustal gałąź zadania przed edycją.')
  else console.log(`Gałąź: ${galaz}`)
  if (stan.some((wiersz) => !wiersz.startsWith('# '))) {
    ostrzez('Katalog zawiera niezacommitowane zmiany lub nieśledzone pliki. Zachowaj je przed zmianą gałęzi.')
  }

  if (upstream && rozbieznosc) {
    console.log(`Upstream: ${upstream} (${rozbieznosc}, ahead/behind)`)
    if (!rozbieznosc.endsWith(' -0')) {
      ostrzez('Gałąź jest do tyłu względem upstreamu. Sprawdź historię przed Pull lub Push.')
    }
  } else if (upstream) {
    ostrzez(`Brak lokalnej referencji upstreamu ${upstream}.`)
  } else if (galaz !== '(detached)') {
    console.log('Upstream: nieustawiony.')
  }

  if (bezCommita) {
    ostrzez('Gałąź nie ma jeszcze commita.')
  } else if (!git('for-each-ref', '--format=%(refname)', baza).split(/\r?\n/).includes(baza)) {
    ostrzez('Brak lokalnej referencji origin/main. Potwierdź bazę, gdy origin będzie dostępny.')
  } else {
    const [przed, za] = git('rev-list', '--left-right', '--count', `HEAD...${baza}`).split(/\s+/).map(Number)
    console.log(`Względem origin/main: ${przed} ahead, ${za} behind.`)
    if (za > 0) ostrzez('HEAD nie zawiera aktualnie znanego origin/main. Sprawdź zamierzoną bazę zadania.')
    if (noweZadanie && (przed > 0 || za > 0)) {
      ostrzez('Nowe niezależne zadanie zacznij od aktualnego origin/main. Istniejący PR lub celowa inna baza mogą uzasadniać tę gałąź.')
    }
  }
} catch (blad) {
  console.error(`Błąd: ${blad.stderr?.trim() || blad.message}`)
  process.exitCode = 1
}
