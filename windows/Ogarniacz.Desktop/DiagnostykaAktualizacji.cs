using System.Text.Json;

namespace Ogarniacz.Desktop;

internal static class DiagnostykaAktualizacji
{
    internal static (string Komunikat, string? Adres) Odczytaj(JsonElement wydanie, Version zainstalowana)
    {
        var tag = wydanie.GetProperty("tag_name").GetString();
        var tekstWersji = tag?.StartsWith('v') == true ? tag[1..] : null;
        if (!Version.TryParse(tekstWersji, out var najnowsza) || najnowsza.Build < 0 || najnowsza.Revision >= 0)
            throw new InvalidDataException("Nieprawidłowa wersja produktu w GitHub Release.");
        var obecna = new Version(zainstalowana.Major, zainstalowana.Minor, Math.Max(0, zainstalowana.Build));
        var opis = $"Platforma: Windows x64. Kanał: stabilny GitHub Release.\nZainstalowany EXE: {obecna}. Najnowszy produkt: {najnowsza}.\nFrontend pochodzi z serwera; jego wersję odczytaj w Ustawieniach aplikacji.\n";
        var nazwa = $"Ogarniacz-{tekstWersji}-Setup.exe";
        var adres = $"https://github.com/kapi1944/Ogarniacz/releases/download/{tag}/{nazwa}";
        var instalator = wydanie.GetProperty("assets").EnumerateArray().FirstOrDefault(plik => plik.GetProperty("name").GetString() == nazwa);
        if (instalator.ValueKind == JsonValueKind.Undefined)
            return (opis + "Brak instalatora Windows w najnowszym wydaniu. Nie potwierdzono dostępności aktualizacji EXE.", null);
        if (instalator.GetProperty("browser_download_url").GetString() != adres)
            throw new InvalidDataException("Adres instalatora nie odpowiada oficjalnej wersji produktu.");
        if (najnowsza <= obecna) return (opis + "Aktualna wersja EXE. Nie ma nowszego instalatora; stan frontendu sprawdzany jest osobno.", null);
        return (opis + "Dostępna aktualizacja EXE. Otworzyć pobieranie instalatora? Instalację uruchamiasz i potwierdzasz samodzielnie.", adres);
    }

    internal static string OpiszBlad(Exception blad) => blad switch
    {
        HttpRequestException => "Brak połączenia lub błąd HTTP. Nie potwierdzono najnowszej wersji. Spróbuj ponownie.",
        TaskCanceledException => "Przekroczono czas sprawdzania. Nie potwierdzono najnowszej wersji. Sprawdź połączenie.",
        JsonException or KeyNotFoundException or InvalidOperationException => "Błędne dane GitHub Release. Nie potwierdzono najnowszej wersji.",
        InvalidDataException => blad.Message,
        _ => "Błąd sprawdzania aktualizacji. Nie potwierdzono najnowszej wersji.",
    };
}
