@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
if errorlevel 1 goto blad_katalogu

where git >nul 2>&1
if errorlevel 1 goto brak_git
where node >nul 2>&1
if errorlevel 1 goto brak_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto brak_npm

git rev-parse --show-toplevel >nul 2>&1
if errorlevel 1 goto blad_repozytorium
set "stara_blokada="
for /f "delims=" %%W in ('git rev-parse HEAD:package-lock.json 2^>nul') do set "stara_blokada=%%W"
if not defined stara_blokada goto blad_blokady

echo Sprawdzam aktualizacje...
git fetch origin main
if errorlevel 1 (
    echo Nie udało się sprawdzić aktualizacji. Uruchomię lokalną wersję.
    goto zaleznosci
)

set "lokalne_zmiany="
for /f "delims=" %%W in ('git status --porcelain --untracked-files^=normal') do set "lokalne_zmiany=tak"
if defined lokalne_zmiany (
    echo Wykryto lokalne zmiany — pomijam aktualizację.
    goto zaleznosci
)

set "galaz="
for /f "delims=" %%W in ('git branch --show-current') do set "galaz=%%W"
if not "%galaz%"=="main" (
    echo Bieżąca gałąź to nie main — pomijam aktualizację.
    goto zaleznosci
)

set "lokalny_commit="
set "zdalny_commit="
for /f "delims=" %%W in ('git rev-parse HEAD') do set "lokalny_commit=%%W"
for /f "delims=" %%W in ('git rev-parse refs/remotes/origin/main 2^>nul') do set "zdalny_commit=%%W"
if not defined lokalny_commit goto blad_repozytorium
if not defined zdalny_commit (
    echo Brak origin/main — pomijam aktualizację.
    goto zaleznosci
)
if "%lokalny_commit%"=="%zdalny_commit%" (
    echo Ogarniacz jest aktualny.
    goto zaleznosci
)

git merge-base --is-ancestor HEAD origin/main
if errorlevel 1 (
    echo Lokalny main zawiera własne commity lub rozbieżną historię — pomijam aktualizację.
    goto zaleznosci
)

echo Znaleziono aktualizację...
git pull --ff-only
if errorlevel 1 (
    echo Aktualizacja nie powiodła się. Zatrzymuję launcher; sprawdź komunikat Git.
    goto blad
)
echo Aktualizacja zakończona.

:zaleznosci
set "nowa_blokada="
for /f "delims=" %%W in ('git rev-parse HEAD:package-lock.json 2^>nul') do set "nowa_blokada=%%W"
if not defined nowa_blokada goto blad_blokady
if not exist "node_modules\" goto instalacja
if not "%stara_blokada%"=="%nowa_blokada%" goto instalacja
goto uruchomienie

:instalacja
echo Instaluję zależności...
call npm.cmd ci
if errorlevel 1 (
    echo Instalacja zależności nie powiodła się.
    goto blad
)

:uruchomienie
echo Uruchamiam Ogarniacza...
call npm.cmd run dev -- --open
if errorlevel 1 (
    echo Uruchomienie Ogarniacza nie powiodło się.
    goto blad
)
exit /b 0

:brak_git
echo Nie znaleziono git. Zainstaluj Git i dodaj go do PATH.
goto blad
:brak_node
echo Nie znaleziono node. Zainstaluj Node.js i dodaj go do PATH.
goto blad
:brak_npm
echo Nie znaleziono npm.cmd. Sprawdź instalację Node.js i PATH.
goto blad
:blad_katalogu
echo Nie można otworzyć katalogu launchera.
goto blad
:blad_repozytorium
echo Nie można odczytać repozytorium Git.
goto blad
:blad_blokady
echo Nie można odczytać package-lock.json z bieżącego commita.
:blad
pause
exit /b 1
