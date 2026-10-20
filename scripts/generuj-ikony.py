"""Generuje zasoby PRO z oryginalnego PNG; wymaga dostępnego Pillow."""

import base64
from pathlib import Path

from PIL import Image


KATALOG = Path(__file__).resolve().parent.parent
KATALOG_MARKI = KATALOG / "assets" / "branding"
ZRODLO = KATALOG_MARKI / "Ikona mózg–żarówka w zieleni i złocie_PRO.png"
ROZMIARY_ICO = (16, 24, 32, 48, 64, 128, 256)


def przeskaluj(obraz, rozmiar):
    # Pillow skaluje RGBA przez premultiplikację alfa, bez ciemnych obwódek.
    return obraz.resize((rozmiar, rozmiar), Image.Resampling.LANCZOS)


def dodaj_margines(obraz, rozmiar, bok_znaku):
    wynik = Image.new("RGBA", (rozmiar, rozmiar), (0, 0, 0, 0))
    odstep = (rozmiar - bok_znaku) // 2
    wynik.alpha_composite(przeskaluj(obraz, bok_znaku), (odstep, odstep))
    return wynik


def generuj():
    with Image.open(ZRODLO) as zrodlo:
        if zrodlo.mode != "RGBA" or zrodlo.size != (1100, 1100):
            raise ValueError("Oryginał musi być obrazem RGBA 1100 × 1100.")
        obraz = zrodlo.copy()

    katalog_publiczny = KATALOG / "public"
    for nazwa, rozmiar in (
        ("favicon-16.png", 16),
        ("favicon-32.png", 32),
        ("apple-touch-icon.png", 180),
        ("ikona-192.png", 192),
        ("ikona-512.png", 512),
    ):
        przeskaluj(obraz, rozmiar).save(katalog_publiczny / nazwa)

    # Każda klatka powstaje bezpośrednio z oryginału, bez kolejnego skalowania.
    klatki = [przeskaluj(obraz, rozmiar) for rozmiar in ROZMIARY_ICO]
    sciezka_ico = KATALOG_MARKI / "ogarniacz-pro.ico"
    klatki[-1].save(
        sciezka_ico,
        sizes=[(rozmiar, rozmiar) for rozmiar in ROZMIARY_ICO],
        append_images=klatki[:-1],
    )
    (katalog_publiczny / "favicon.ico").write_bytes(sciezka_ico.read_bytes())

    zawartosc_png = base64.b64encode((katalog_publiczny / "ikona-512.png").read_bytes()).decode("ascii")
    (katalog_publiczny / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        f'<image width="512" height="512" href="data:image/png;base64,{zawartosc_png}"/>'
        '</svg>\n',
        encoding="utf-8",
    )

    zasoby_androida = KATALOG / "android" / "app" / "src" / "main" / "res"
    for gestosc, rozmiar, rozmiar_warstwy, bok_znaku in (
        ("mdpi", 48, 108, 48),
        ("hdpi", 72, 162, 72),
        ("xhdpi", 96, 216, 96),
        ("xxhdpi", 144, 324, 144),
        ("xxxhdpi", 192, 432, 192),
    ):
        katalog_gestosci = zasoby_androida / f"mipmap-{gestosc}"
        przeskaluj(obraz, rozmiar).save(katalog_gestosci / "ic_launcher.png")
        # Cały kafelek mieści się w kole także w launcherach sprzed API 26.
        dodaj_margines(obraz, rozmiar, int(rozmiar * 0.68)).save(
            katalog_gestosci / "ic_launcher_round.png"
        )
        # Oryginał 48 dp na warstwie 108 dp mieści się w bezpiecznym kole 66 dp.
        dodaj_margines(obraz, rozmiar_warstwy, bok_znaku).save(
            katalog_gestosci / "ic_launcher_foreground.png"
        )

    print("Wygenerowano ikony Web/PWA, ICO oraz pięć gęstości Androida.")


if __name__ == "__main__":
    generuj()
