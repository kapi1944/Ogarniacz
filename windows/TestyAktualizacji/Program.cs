using System.Text.Json;
using Ogarniacz.Desktop;

static void Sprawdz(bool warunek, string nazwa)
{
    if (!warunek) throw new Exception(nazwa);
    Console.WriteLine("PASS: " + nazwa);
}
static (string Komunikat, string? Adres) Odczytaj(string wersja, bool instalator = true, string? adres = null, Version? obecna = null)
{
    using var dokument = JsonDocument.Parse(JsonSerializer.Serialize(new {
        tag_name = "v" + wersja,
        assets = instalator ? new[] { new { name = $"Ogarniacz-{wersja}-Setup.exe", browser_download_url = adres ?? $"https://github.com/kapi1944/Ogarniacz/releases/download/v{wersja}/Ogarniacz-{wersja}-Setup.exe" } } : []
    }));
    return DiagnostykaAktualizacji.Odczytaj(dokument.RootElement, obecna ?? new Version(1, 1, 1, 0));
}
Sprawdz(Odczytaj("1.1.1").Adres is null && Odczytaj("1.1.1").Komunikat.Contains("Aktualna wersja EXE"), "wersja assembly X.Y.Z.0 nie daje fałszywej aktualizacji");
Sprawdz(Odczytaj("1.1.2").Adres is not null, "nowszy produkt proponuje ręczne pobranie");
Sprawdz(Odczytaj("1.1.0").Adres is null, "starszy produkt nie proponuje downgrade");
Sprawdz(Odczytaj("1.1.1", false).Komunikat.Contains("Brak instalatora"), "brak EXE także dla tej samej wersji nie potwierdza aktualności");
Sprawdz(Odczytaj("1.1.2", false).Adres is null, "brak EXE blokuje pobranie");
foreach (var wersja in new[] { "1.1", "1.1.2.3", "bledna" })
{
    try { Odczytaj(wersja); throw new Exception("Zaakceptowano błędną wersję"); }
    catch (InvalidDataException) { Console.WriteLine("PASS: odrzucono " + wersja); }
}
try { Odczytaj("1.1.2", adres: "https://obca.example/setup.exe"); throw new Exception("Zaakceptowano obcy adres"); }
catch (InvalidDataException) { Console.WriteLine("PASS: niezgodny adres wersji"); }
foreach (var blad in new Exception[] { new HttpRequestException(), new TaskCanceledException(), new JsonException() })
    Sprawdz(DiagnostykaAktualizacji.OpiszBlad(blad).Contains("Nie potwierdzono"), "błąd nie ogłasza sukcesu: " + blad.GetType().Name);

try { using var brak = JsonDocument.Parse("{}"); DiagnostykaAktualizacji.Odczytaj(brak.RootElement, new Version(1, 1, 1)); throw new Exception("Zaakceptowano niepełny manifest"); }
catch (KeyNotFoundException) { Console.WriteLine("PASS: brak wymaganych pól manifestu"); }
