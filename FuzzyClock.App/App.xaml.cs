using System.Threading;
using System.Windows;
// Disambiguate System.Windows.Application vs System.Windows.Forms.Application (UseWindowsForms=true)
using Application = System.Windows.Application;

namespace FuzzyClock.App;

public partial class App : Application
{
    private Mutex? _instanceMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        // Single-instance enforcement: check Mutex before any window is created
        // to prevent a second overlay from briefly appearing before shutdown
        _instanceMutex = new Mutex(initiallyOwned: true, "FuzzyClock_SingleInstance_v1", out bool createdNew);

        if (!createdNew)
        {
            _instanceMutex.Dispose();
            _instanceMutex = null;
            Shutdown();
            return;
        }

        base.OnStartup(e);

        // Hidden owner window: suppresses overlay from both taskbar and Alt+Tab switcher.
        // ShowInTaskbar=False alone does not suppress the Alt+Tab entry — the window-owner
        // trick is the pure-WPF pattern for complete taskbar/switcher suppression.
        var hiddenOwner = new Window
        {
            Width = 0,
            Height = 0,
            WindowStyle = WindowStyle.ToolWindow,
            ShowInTaskbar = false,
            Visibility = Visibility.Hidden
        };

        // Owner must be shown before setting as Owner for ownership to take effect
        hiddenOwner.Show();

        // Load saved settings before creating MainWindow — position must be applied
        // after new MainWindow() but before Show() (WindowStartupLocation.Manual requirement).
        var settings = SettingsService.Load();

        var mainWindow = new MainWindow();
        mainWindow.Owner = hiddenOwner;
        mainWindow.ApplySettings(settings);                     // before Show() — critical ordering
        mainWindow.SetInitialPhrase(DateTime.Now);
        mainWindow.Show();

        // Session-end backup save: Window.Closing is NOT raised on Windows log-off or shutdown.
        // Application.SessionEnding covers those paths. Both Closing (in OnClosing) and
        // SessionEnding call the same SaveSettings() method.
        SessionEnding += (_, _) => (MainWindow as MainWindow)?.SaveSettings();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        if (_instanceMutex != null)
        {
            _instanceMutex.ReleaseMutex();
            _instanceMutex.Dispose();
            _instanceMutex = null;
        }

        base.OnExit(e);
    }
}
