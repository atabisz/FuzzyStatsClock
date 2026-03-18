using System.Threading;
using System.Windows;
// Disambiguate System.Windows.Application vs System.Windows.Forms.Application (UseWindowsForms=true)
using Application = System.Windows.Application;

namespace FuzzyClock.App;

public partial class App : Application
{
    private Mutex? _instanceMutex;
    private const string PipeName = "FuzzyClock_Activate_v1";

    protected override void OnStartup(StartupEventArgs e)
    {
        // Single-instance enforcement with crash-restart recovery.
        // If the previous instance crashed, the OS abandons the Mutex and the constructor
        // throws AbandonedMutexException. We catch it, take ownership, and treat as first instance.
        bool createdNew;
        try
        {
            _instanceMutex = new Mutex(initiallyOwned: true, "FuzzyClock_SingleInstance_v1", out createdNew);
        }
        catch (AbandonedMutexException ex)
        {
            // Previous instance crashed without releasing — we now own the mutex.
            _instanceMutex = ex.Mutex;   // use the Mutex from the exception, not a new one
            createdNew = true;
        }

        if (!createdNew)
        {
            SignalRunningInstance();
            _instanceMutex?.Dispose();
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
        StartPipeServer(mainWindow);

        // Session-end backup save: Window.Closing is NOT raised on Windows log-off or shutdown.
        // Application.SessionEnding covers those paths. Both Closing (in OnClosing) and
        // SessionEnding call the same SaveSettings() method.
        SessionEnding += (_, _) => (MainWindow as MainWindow)?.SaveSettings();
    }

    private static void SignalRunningInstance()
    {
        try
        {
            using var client = new System.IO.Pipes.NamedPipeClientStream(
                ".", PipeName, System.IO.Pipes.PipeDirection.Out);
            client.Connect(500); // 500ms timeout — running instance may still be starting
            using var writer = new System.IO.StreamWriter(client);
            writer.WriteLine("ACTIVATE");
            writer.Flush();
        }
        catch { /* running instance not ready yet — second instance exits quietly */ }
    }

    private void StartPipeServer(MainWindow mainWindow)
    {
        var thread = new Thread(() =>
        {
            while (true)
            {
                try
                {
                    using var server = new System.IO.Pipes.NamedPipeServerStream(
                        PipeName, System.IO.Pipes.PipeDirection.In,
                        maxNumberOfServerInstances: 1);
                    server.WaitForConnection();
                    using var reader = new System.IO.StreamReader(server);
                    if (reader.ReadLine() == "ACTIVATE")
                    {
                        Dispatcher.Invoke(() =>
                        {
                            if (mainWindow.WindowState == WindowState.Minimized)
                                mainWindow.WindowState = WindowState.Normal;
                            mainWindow.Activate();
                        });
                    }
                }
                catch (System.IO.IOException) { /* pipe broken on app exit — IsBackground=true handles cleanup */ }
                catch (ObjectDisposedException) { break; /* dispatcher shutting down */ }
            }
        })
        {
            IsBackground = true,   // CRITICAL: prevents this thread from blocking process exit
            Name = "FuzzyClock_PipeServer"
        };
        thread.Start();
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
