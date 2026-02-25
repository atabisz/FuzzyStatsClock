# Technology Stack

**Project:** Fuzzy Clock v1.1 — drag, position persistence, font size
**Researched:** 2026-02-25
**Confidence:** HIGH (all findings verified against official Microsoft documentation)

---

## Context: What Already Exists

The app is a working .NET 10 WPF widget (`net10.0-windows`, `UseWPF=true`) with:
- `WindowStyle=None`, `AllowsTransparency=True`, `Topmost=True`, `SizeToContent=WidthAndHeight`
- `Grid.ContextMenu` with a single `<MenuItem Header="Close" />` wired to `CloseMenuItem_Click`
- `DispatcherTimer` polling every 10 seconds, `PositionTopRight()` called after layout
- Two `TextBlock` elements (`PhraseText`, `ShadowText`) at `FontSize="32"`, `FontFamily="Segoe UI Light"`
- `FuzzyClock.App.csproj` has zero NuGet dependencies beyond the SDK

**v1.1 adds three features:** drag-to-reposition, JSON position+font-size persistence, font size submenu.

No new NuGet packages are needed. All three features use APIs already present in the .NET 10 SDK.

---

## Recommended Stack

### Core Technologies (unchanged from v1.0)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| .NET | 10.0 LTS | Runtime and SDK | Current LTS (Nov 2025 – Nov 2028). All new APIs used here ship in .NET 10. |
| WPF | Ships with .NET 10 | UI framework | `DragMove`, `LocationChanged`, `SystemParameters.VirtualScreen*`, `ContextMenu`/`MenuItem` submenu pattern — all built-in. |
| C# | 13 | Language | Ships with .NET 10 SDK. No version-specific features required for v1.1. |

### New APIs Required (no new packages)

#### 1. Drag: `Window.DragMove()`

| API | Assembly | Purpose |
|-----|----------|---------|
| `Window.DragMove()` | `PresentationFramework.dll` (already referenced via `UseWPF`) | Moves the window via OS-native drag when left button is held |

**Hook:** Handle `MouseLeftButtonDown` on the root `Grid` (the hit-testable element). Call `this.DragMove()` inside the handler. `DragMove` throws `InvalidOperationException` if the left button is not down when called — the `MouseLeftButtonDown` handler guarantees it is.

**Why `MouseLeftButtonDown` not `MouseMove`:** `DragMove` must be called while the left button is actively depressed. `MouseMove` fires continuously during movement but does not guarantee the button is still down. The official example uses `OnMouseLeftButtonDown`. `MouseMove`-based manual drag (tracking delta and setting `Left`/`Top`) is an alternative but has noticeable jitter compared to the OS-native `DragMove`.

**Integration point:** The root `Grid` already has `Background="#01000000"` making it fully hit-testable. Add `MouseLeftButtonDown="Grid_MouseLeftButtonDown"` to that `Grid` element in XAML.

```csharp
// MainWindow.xaml.cs
private void Grid_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
{
    this.DragMove();
}
```

Official docs: https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.dragmove

---

#### 2. Position Persistence: `System.Text.Json` + `Environment.GetFolderPath`

| API | Assembly/Package | Purpose |
|-----|-----------------|---------|
| `System.Text.Json.JsonSerializer` | `System.Text.Json.dll` — built into .NET 10, no NuGet required | Serialize/deserialize the settings record to/from JSON |
| `Environment.GetFolderPath(SpecialFolder.LocalApplicationData)` | `System.Runtime.dll` — BCL, always available | Resolve per-user, non-roaming app data path (`%LOCALAPPDATA%`) |

**Why `System.Text.Json` not Newtonsoft.Json:**
- Built into .NET 10 — zero NuGet cost, no version management, no transitive dependency risk.
- `JsonSerializer.Serialize` / `JsonSerializer.Deserialize<T>` cover the entire requirement: one small record with two `double` fields and one `int` field.
- Newtonsoft.Json adds a ~1.5 MB NuGet dependency for no capability gain on a simple flat-object scenario. The project has a strict zero-dependency philosophy validated in v1.0.

**Why `LocalApplicationData` not `ApplicationData`:**
- `LocalApplicationData` → `%LOCALAPPDATA%` (e.g. `C:\Users\<user>\AppData\Local`) — local machine, not roamed via Windows roaming profiles.
- `ApplicationData` → `%APPDATA%` (roaming) — for a window position that is screen-coordinate-specific, roaming across machines with different display configurations is wrong behavior. Use `LocalApplicationData`.

**Settings file location:** `%LOCALAPPDATA%\FuzzyClock\settings.json`

**Settings record (all that needs to persist):**

```csharp
// A simple record — System.Text.Json serializes public properties by default
internal sealed record WindowSettings(double Left, double Top, int FontSize)
{
    public static WindowSettings Default => new(
        Left: -1,   // sentinel: -1 means "not set, use PositionTopRight()"
        Top: -1,
        FontSize: 24
    );
}
```

**Save hook:** `Window.LocationChanged` fires after every `DragMove` completes (and also when `Left`/`Top` are set programmatically, or `WindowState` changes). Wire `LocationChanged` in the constructor. Debouncing is not necessary — `DragMove` is OS-native and `LocationChanged` fires once per completed move, not on every pixel.

Official docs:
- `LocationChanged`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.locationchanged
- `System.Text.Json` overview: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview
- `Environment.GetFolderPath`: https://learn.microsoft.com/en-us/dotnet/api/system.environment.getfolderpath

---

#### 3. Screen Bounds Clamping: `SystemParameters.VirtualScreen*`

| API | Assembly | Purpose |
|-----|----------|---------|
| `SystemParameters.VirtualScreenLeft` | `PresentationFramework.dll` | X origin of the multi-monitor virtual desktop |
| `SystemParameters.VirtualScreenTop` | `PresentationFramework.dll` | Y origin of the multi-monitor virtual desktop |
| `SystemParameters.VirtualScreenWidth` | `PresentationFramework.dll` | Total width of all monitors combined |
| `SystemParameters.VirtualScreenHeight` | `PresentationFramework.dll` | Total height of all monitors combined |

**Why `VirtualScreen*` not `PrimaryScreenWidth`/`PrimaryScreenHeight`:**
- `PrimaryScreenWidth` is what `PositionTopRight()` uses for initial placement. That is fine for a startup default.
- After a drag, the user may have moved the widget to a secondary monitor. On restore, clamping to the primary screen width would wrongly move a widget that was intentionally on a second monitor.
- `VirtualScreen*` gives the bounding rectangle of ALL monitors — the correct domain for clamp validation.
- `VirtualScreenLeft` can be negative on multi-monitor setups where the secondary monitor is to the left of the primary. The clamp logic must account for this.

**Clamping formula (on startup, after loading saved position):**

```csharp
private void ClampToScreen()
{
    double minLeft = SystemParameters.VirtualScreenLeft;
    double minTop  = SystemParameters.VirtualScreenTop;
    double maxLeft = SystemParameters.VirtualScreenLeft + SystemParameters.VirtualScreenWidth  - ActualWidth;
    double maxTop  = SystemParameters.VirtualScreenTop  + SystemParameters.VirtualScreenHeight - ActualHeight;

    Left = Math.Clamp(Left, minLeft, maxLeft);
    Top  = Math.Clamp(Top,  minTop,  maxTop);
}
```

Official docs: https://learn.microsoft.com/en-us/dotnet/api/system.windows.systemparameters.virtualscreenwidth

---

#### 4. Font Size Submenu: `MenuItem` with nested `MenuItem` children

| API | Assembly | Purpose |
|-----|----------|---------|
| `System.Windows.Controls.MenuItem` (nested items) | `PresentationFramework.dll` | Font Size submenu inside the existing `ContextMenu` |

**Pattern:** A `MenuItem` becomes a submenu parent when it has child `MenuItem` items. No `IsCheckable` needed — use `Click` handlers on each child. This is the standard WPF pattern, confirmed in official ContextMenu docs.

**XAML pattern (add inside the existing `<ContextMenu>`):**

```xaml
<MenuItem Header="Font Size">
    <MenuItem Header="16pt" Click="FontSize16_Click" />
    <MenuItem Header="24pt" Click="FontSize24_Click" />
    <MenuItem Header="32pt" Click="FontSize32_Click" />
</MenuItem>
<MenuItem Header="Close" Click="CloseMenuItem_Click" />
```

**Code-behind pattern for applying font size:**

```csharp
private void SetFontSize(int size)
{
    PhraseText.FontSize  = size;
    ShadowText.FontSize  = size;
    // SizeToContent=WidthAndHeight: force layout to re-measure before repositioning
    UpdateLayout();
    // Re-clamp/reposition if needed after size change affects window dimensions
    SaveSettings();
}
```

**Important interaction with `SizeToContent=WidthAndHeight`:** Changing `FontSize` changes the `TextBlock` layout size, which changes `ActualWidth`/`ActualHeight`. After setting font size, `UpdateLayout()` must be called before reading `ActualWidth` — the same pattern already used by `UpdatePhraseIfChanged()`. Save the new font size to the settings file immediately on selection.

Official docs: https://learn.microsoft.com/en-us/dotnet/desktop/wpf/controls/contextmenu

---

## Supporting Libraries

None required. This milestone adds zero NuGet packages.

| Library | Verdict | Reason |
|---------|---------|--------|
| Newtonsoft.Json | Not needed | `System.Text.Json` is built into .NET 10 and handles the single flat settings record without configuration |
| CommunityToolkit.Mvvm | Not needed | No MVVM needed; font size and position are set directly in code-behind on a single window |
| Microsoft.Xaml.Behaviors.Wpf | Not needed | `MouseLeftButtonDown` handler is sufficient; no behavior abstraction required |

---

## Alternatives Considered

| Feature | Recommended | Alternative | Why Not |
|---------|-------------|-------------|---------|
| Drag | `Window.DragMove()` in `MouseLeftButtonDown` | Manual `MouseMove` delta tracking (set `Left`/`Top` on each event) | Manual tracking has jitter on fast moves; re-implements what the OS already provides. `DragMove` is the WPF-idiomatic approach documented by Microsoft. |
| Persistence format | JSON via `System.Text.Json` | `Properties.Settings.Default` (app settings XML) | `Properties.Settings.Default` requires a designer-generated XML schema and behaves differently across publish modes (.NET 10 WPF apps with `PublishSingleFile` can lose app.config). A hand-written JSON file in `%LOCALAPPDATA%` is explicit and survives all publish modes. |
| Persistence format | JSON via `System.Text.Json` | Newtonsoft.Json | No capability gap for a flat two-field record. Adds a NuGet dependency for zero benefit. |
| Persistence location | `%LOCALAPPDATA%\FuzzyClock\settings.json` | `%APPDATA%` (roaming) | Window position is screen-coordinate-specific. Roaming to a different machine with different monitor layout would restore an off-screen position. |
| Screen bounds | `SystemParameters.VirtualScreen*` | `SystemParameters.PrimaryScreenWidth/Height` | Primary-only clamping wrongly moves widgets from secondary monitors. Virtual screen covers all monitors. |
| Font size submenu | Nested `MenuItem` items in XAML | Programmatic `MenuItem` construction in code-behind | XAML declaration is simpler and readable; three static items do not benefit from dynamic construction. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Newtonsoft.Json NuGet package | Adds ~1.5 MB dependency for a 3-field JSON record. Contradicts v1.0 zero-dependency principle. | `System.Text.Json` (built into SDK) |
| `MouseMove` for drag | Fires on every pixel; requires manual offset math; produces jitter on fast drags | `Window.DragMove()` called from `MouseLeftButtonDown` |
| `Application.SetEnvironmentVariable` or hardcoded paths for settings file | Non-portable; breaks on non-standard Windows installs | `Environment.GetFolderPath(SpecialFolder.LocalApplicationData)` |
| `Window.Closing` as the only save hook for position | If the process is killed (Task Manager), `Closing` does not fire and the last position is lost | `Window.LocationChanged` saves after each drag; `Closing` can also save as belt-and-suspenders |
| `IsCheckable="True"` on font size MenuItems | Creates checkbox-style toggles; requires manually unchecking the other items | Use plain `Click` handlers; indicate current selection via `FontWeight` or a bullet marker if needed (v1.1 can skip visual indication — the current font size is visible on the widget) |

---

## Integration Points with Existing Code

| Existing Element | Change Required |
|-----------------|-----------------|
| `Grid` root element | Add `MouseLeftButtonDown="Grid_MouseLeftButtonDown"` attribute |
| `Grid.ContextMenu` / `ContextMenu` | Add `<MenuItem Header="Font Size">` parent with three child `<MenuItem>` items above the Close item |
| `ContentRendered` handler | After `PositionTopRight()`, load settings: if saved position is valid, apply it and clamp; otherwise keep `PositionTopRight()` result |
| `PositionTopRight()` method | Keep as fallback for first-run or invalid saved position |
| `UpdatePhraseIfChanged()` | No change needed; already calls `UpdateLayout()` before repositioning |
| `PhraseText` / `ShadowText` TextBlocks | `FontSize` set dynamically from loaded settings; still driven from code-behind, not XAML literals |
| Constructor | Wire `this.LocationChanged += (_, _) => SaveSettings();` |

---

## File Location for Settings

```
%LOCALAPPDATA%\FuzzyClock\settings.json
```

Resolved in code as:

```csharp
private static string SettingsPath =>
    Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FuzzyClock",
        "settings.json");
```

`Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath)!)` must be called before the first write (idempotent — safe to call even if the directory already exists).

---

## Sources

- `Window.DragMove` official docs (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.dragmove
  — Confirms `MouseLeftButtonDown` as the correct hook; documents `InvalidOperationException` on non-pressed state. Confidence: HIGH.
- `Window.LocationChanged` official docs (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.window.locationchanged
  — Confirms event fires after `DragMove` completes and after programmatic `Left`/`Top` changes. Confidence: HIGH.
- `System.Text.Json` overview: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview
  — Confirms built-in as shared framework since .NET Core 3.0; no NuGet needed on .NET 10. Confidence: HIGH.
- `SystemParameters.VirtualScreenWidth` official docs (windowsdesktop-10.0): https://learn.microsoft.com/en-us/dotnet/api/system.windows.systemparameters.virtualscreenwidth
  — Confirms "bounding rectangle of all display monitors"; documents `VirtualScreenTop`/`VirtualScreenLeft` for negative-coordinate second monitors. Confidence: HIGH.
- WPF ContextMenu overview (updated 2026-01-28): https://learn.microsoft.com/en-us/dotnet/desktop/wpf/controls/contextmenu
  — Confirms nested `MenuItem` XAML pattern for submenus (`<MenuItem Header="Parent"><MenuItem Header="Child"/></MenuItem>`). Confidence: HIGH.
- `Environment.GetFolderPath` official docs (.NET 10): https://learn.microsoft.com/en-us/dotnet/api/system.environment.getfolderpath
  — Confirms `SpecialFolder.LocalApplicationData` maps to `%LOCALAPPDATA%`. Confidence: HIGH.
- Existing project source: `C:/src/gsd1/FuzzyClock.App/MainWindow.xaml` and `MainWindow.xaml.cs`
  — Confirmed existing ContextMenu structure, Grid hit-test background, TextBlock names, and `PositionTopRight` implementation. Confidence: HIGH (read directly).

---
*Stack research for: Fuzzy Clock v1.1 — WPF drag, persistence, font size*
*Researched: 2026-02-25*
