"""Zasoby Android Luxury z oryginalnego PNG; wymaga Pillow, bez generowania logo."""

from pathlib import Path

from PIL import Image, ImageDraw


KATALOG = Path(__file__).resolve().parent.parent
ZRODLO = KATALOG / "multimedia" / "Ogarniacz_Luxury_Android.png"
ZASOBY = KATALOG / "android" / "app" / "src" / "main" / "res"
TLO = (0, 37, 28, 255)
GESTOSCI = (("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4))


def wczytaj_oryginal():
    with Image.open(ZRODLO) as oryginal:
        if oryginal.mode != "RGBA" or oryginal.size != (1254, 1254):
            raise ValueError("Oczekiwano oryginału Luxury RGBA 1254 × 1254.")
        # Usuwamy wyłącznie zewnętrzny margines eksportu. Próg pomija szum alfa.
        # Kwadratowy wycinek zachowuje proporcje całej kompozycji.
        return oryginal.crop((42, 41, 1212, 1211))


def przeskaluj(obraz, rozmiar):
    return obraz.resize((rozmiar, rozmiar), Image.Resampling.LANCZOS)


def generuj():
    obraz = wczytaj_oryginal()
    for gestosc, mnoznik in GESTOSCI:
        katalog = ZASOBY / f"mipmap-{gestosc}"
        rozmiar = round(48 * mnoznik)
        przeskaluj(obraz, rozmiar).save(katalog / "ic_launcher.png")

        # Starszy roundIcon ma rzeczywistą maskę koła, bez pomniejszonego kafelka.
        okragla = Image.new("RGBA", obraz.size, TLO)
        okragla.alpha_composite(obraz)
        maska = Image.new("L", obraz.size)
        ImageDraw.Draw(maska).ellipse((0, 0, obraz.width - 1, obraz.height - 1), fill=255)
        okragla.putalpha(maska)
        przeskaluj(okragla, rozmiar).save(katalog / "ic_launcher_round.png")

        # 108 dp obejmuje zapas animacji. Nominalna maska zajmuje środkowe 72 dp;
        # nie należy wciskać całego ozdobnego kafelka w bezpieczne koło 66 dp.
        warstwa = Image.new("RGBA", (round(108 * mnoznik),) * 2)
        odstep = round(18 * mnoznik)
        warstwa.alpha_composite(przeskaluj(obraz, round(72 * mnoznik)), (odstep, odstep))
        warstwa.save(katalog / "ic_launcher_foreground.png")

    print("Wygenerowano 15 PNG Android Luxury; zasoby Web/PWA pozostają bez zmian.")


if __name__ == "__main__":
    generuj()
