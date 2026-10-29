using System.Diagnostics;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Ogarniacz.Desktop;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new OgarniaczWindow());
    }
}

internal sealed class OgarniaczWindow : Form
{
    private readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    private readonly string settingsFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ogarniacz", "Desktop");
    private readonly ToolStripMenuItem addressMenu = new("Adres serwera…");
    private readonly ToolStripMenuItem updateMenu = new("Sprawdź nową wersję instalatora");
    private readonly ToolStripMenuItem reloadMenu = new("Odśwież");
    private Uri? server;

    public OgarniaczWindow()
    {
        Text = "Ogarniacz";
        Width = 1340;
        Height = 860;
        MinimumSize = new Size(400, 480);
        StartPosition = FormStartPosition.CenterScreen;
        var menu = new MenuStrip();
        menu.Items.Add(addressMenu);
        menu.Items.Add(reloadMenu);
        menu.Items.Add(updateMenu);
        MainMenuStrip = menu;
        Controls.Add(browser);
        Controls.Add(menu);
        addressMenu.Click += async (_, _) => await ConfigureServerAsync();
        reloadMenu.Click += (_, _) => browser.Reload();
        updateMenu.Click += async (_, _) => await CheckUpdateAsync(showUpToDate: true);
        Shown += async (_, _) => await StartupAsync();
    }

    private async Task StartupAsync()
    {
        Directory.CreateDirectory(settingsFolder);
        try
        {
            var environment = await CoreWebView2Environment.CreateAsync(
                userDataFolder: Path.Combine(settingsFolder, "WebView2"));
            await browser.EnsureCoreWebView2Async(environment);
            browser.CoreWebView2.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                OpenExternal(args.Uri);
            };
            browser.CoreWebView2.NavigationStarting += (_, args) =>
            {
                if (server is null) return;
                if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var destination)) return;
                if (destination.Host.Equals(server.Host, StringComparison.OrdinalIgnoreCase)
                    && destination.Port == server.Port && destination.Scheme == server.Scheme) return;
                args.Cancel = true;
                OpenExternal(args.Uri);
            };
        }
        catch (Exception error)
        {
            MessageBox.Show(this,
                "Nie można uruchomić Microsoft Edge WebView2 Runtime. Zainstaluj WebView2 Runtime i spróbuj ponownie.\n\n" + error.Message,
                "Ogarniacz — brak WebView2", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
            return;
        }

        var file = Path.Combine(settingsFolder, "server-url.txt");
        if (File.Exists(file) && TryServerUri(File.ReadAllText(file), out var saved))
        {
            Navigate(saved);
        }
        else
        {
            await ConfigureServerAsync();
        }
        _ = CheckUpdateAsync(showUpToDate: false);
    }

    private static bool TryServerUri(string value, out Uri uri)
    {
        if (Uri.TryCreate(value.Trim(), UriKind.Absolute, out var candidate)
            && candidate.Scheme == Uri.UriSchemeHttps
            && candidate.UserInfo.Length == 0
            && string.IsNullOrEmpty(candidate.Query)
            && string.IsNullOrEmpty(candidate.Fragment)
            && candidate.AbsolutePath == "/")
        {
            uri = candidate;
            return true;
        }
        uri = null!;
        return false;
    }

    private Task ConfigureServerAsync()
    {
        using var dialog = new Form
        {
            Text = "Adres Ogarniacza (HTTPS)", Width = 580, Height = 195,
            FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false, MinimizeBox = false
        };
        var label = new Label { Left = 16, Top = 12, Width = 530, Height = 44,
            Text = "Wpisz produkcyjny adres HTTPS serwera Ogarniacza (np. adres Tailscale Serve).\nZmiana adresu nie przenosi danych lokalnych między witrynami." };
        var input = new TextBox { Left = 16, Top = 64, Width = 530, Text = server?.ToString() ?? "https://" };
        var save = new Button { Text = "Zapisz", Left = 356, Top = 100, Width = 90, DialogResult = DialogResult.OK };
        var cancel = new Button { Text = "Anuluj", Left = 455, Top = 100, Width = 90, DialogResult = DialogResult.Cancel };
        dialog.Controls.AddRange([label, input, save, cancel]);
        dialog.AcceptButton = save;
        dialog.CancelButton = cancel;
        while (dialog.ShowDialog(this) == DialogResult.OK)
        {
            if (!TryServerUri(input.Text, out var uri))
            {
                MessageBox.Show(dialog, "Wpisz adres HTTPS w postaci https://host/ (bez ścieżki, hasła i parametrów).",
                    "Nieprawidłowy adres", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                continue;
            }
            Directory.CreateDirectory(settingsFolder);
            File.WriteAllText(Path.Combine(settingsFolder, "server-url.txt"), uri.ToString());
            Navigate(uri);
            break;
        }
        return Task.CompletedTask;
    }

    private void Navigate(Uri uri)
    {
        server = uri;
        browser.Source = uri;
    }

    private static void OpenExternal(string address)
    {
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp)) return;
        Process.Start(new ProcessStartInfo { FileName = uri.ToString(), UseShellExecute = true });
    }

    private async Task CheckUpdateAsync(bool showUpToDate)
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(12) };
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Ogarniacz-Desktop/1.0");
            using var response = await client.GetAsync("https://api.github.com/repos/kapi1944/Ogarniacz/releases/latest");
            response.EnsureSuccessStatusCode();
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var tag = document.RootElement.GetProperty("tag_name").GetString()?.TrimStart('v');
            if (!Version.TryParse(tag, out var newest)) return;
            var current = typeof(OgarniaczWindow).Assembly.GetName().Version ?? new Version(0, 0);
            if (newest <= current)
            {
                if (showUpToDate) MessageBox.Show(this, "Masz aktualny instalator Windows.", "Ogarniacz");
                return;
            }
            foreach (var asset in document.RootElement.GetProperty("assets").EnumerateArray())
            {
                var name = asset.GetProperty("name").GetString();
                if (name is null || !name.EndsWith("-Setup.exe", StringComparison.OrdinalIgnoreCase)) continue;
                var url = asset.GetProperty("browser_download_url").GetString();
                if (url is null) return;
                if (MessageBox.Show(this,
                    $"Dostępny jest nowy instalator Windows {newest} (obecnie {current}). Otworzyć stronę pobierania?",
                    "Aktualizacja Ogarniacza", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                    OpenExternal(url);
                return;
            }
        }
        catch (Exception error)
        {
            if (showUpToDate) MessageBox.Show(this, "Nie udało się sprawdzić aktualizacji: " + error.Message,
                "Ogarniacz", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }
}
