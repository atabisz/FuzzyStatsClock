# Pitfalls Research

**Domain:** Adding per-user installer, edge snapping, and Settings visual redesign to an existing WPF .NET 10 transparent overlay widget
**Project:** Fuzzy Clock v3.3
**Researched:** 2026-03-17
**Confidence:** HIGH — all pitfalls grounded in direct reading of `App.xaml.cs`, `MainWindow.xaml.cs`, `GhostModeController.cs`, `App.xaml`, `MainWindow.xaml`, `SettingsWindow.xaml`, and `PROJECT.md`.

---

> **Scope note:** This document covers pitfalls specific to v3.3 additions: per-user installer (no-admin, `%LOCALAPPDATA%` install path, upgrade detection), single-instance guard (Mutex in App.xaml.cs — already implemented; pitfalls concern maintenance and crash scenarios), edge snapping (snap-to-screen-edge on drag release, interaction with `SizeToContent=WidthAndHeight` and ghost mode), and Settings window visual redesign (WPF styles/ResourceDictionary applied to the existing SettingsWindow without breaking MainWindow). Prior milestone pitfalls (WS_EX_TRANSPARENT, ghost mode, frozen brushes, AppSettings migration, ApplyTheme coverage) are documented in the v3.2 PITFALLS.md and are not repeated here.

---

## Critical Pitfalls

Mistakes that cause incorrect behavior or require a rewrite to fix.

---

### Pitfall 1: SmartScreen Blocks Unsigned Installer — Users See "Windows protected your PC"

**What goes wrong:**
A per-user NSIS, Inno Setup, or WiX installer built without an Authenticode code-signing certificate triggers Windows SmartScreen on first download and run. The user sees a full-screen blue warning ("Windows protected your PC") with only an "Don't run" button visible; "Run anyway" is hidden behind "More info." Most non-technical users stop here and conclude the installer is malware. Even technical users are alarmed. The app never gets installed.

SmartScreen's reputation system (Application Reputation / SmartScreen Filter) requires a threshold of downloads before "reputation" is established — a new, unsigned binary starts with zero reputation every time the binary hash changes (i.e., every release build). Self-signed certificates (generated with `New-SelfSignedCertificate`) do not suppress SmartScreen — only certificates from a trusted CA (e.g., a commercial EV code-signing certificate or a standard OV certificate) build reputation.

**Why it happens:**
Developers build the installer, test it on their own machine (where SmartScreen doesn't block self-approved executables), and only discover the SmartScreen block after a user reports it. The "it works on my machine" failure mode hides this until release.

**How to avoid:**
Choose one of these prevention strategies before the installer phase begins, not after:

1. **Use a trusted CA code-signing certificate.** An EV (Extended Validation) certificate suppresses SmartScreen immediately on first run for all users. Standard OV certificates build reputation over time (weeks to months of downloads). For a personal/hobby project, this is typically not cost-justified.

2. **Publish via Windows Package Manager (winget) or Microsoft Store.** Both distribution channels provide implicit SmartScreen reputation. Winget community packages require a PR to the winget-pkgs repository and Microsoft validation. Store submission has its own overhead. Either path eliminates the SmartScreen problem.

3. **Use ClickOnce deployment.** .NET 10 supports ClickOnce. Per-user install, no-admin, auto-update, and `%LOCALAPPDATA%` install path are all supported natively. SmartScreen treats ClickOnce manifests differently — a `.application` launch file is not a PE executable and does not trigger the same SmartScreen path. The tradeoff: ClickOnce has a different distribution model (URL-based, no offline installer).

4. **Document and accept the SmartScreen friction.** For a personal or small-audience project, document the "More info → Run anyway" steps in the README. This is acceptable if the audience is technical and the distribution is informal (GitHub Releases).

Prevention strategy for v3.3: Decide on distribution model before building the installer. If the installer is a `.exe`, document the SmartScreen issue in the release notes and README. Do not discover this post-release.

**Warning signs:**
- Building the installer without testing on a clean VM where the binary has no prior execution history.
- Testing the installer only on the developer machine (where Windows has already seen the executable).
- No code-signing certificate is in the build pipeline.

**Phase to address:** Installer phase — decide on signing/distribution strategy in the plan before writing the first installer script.

---

### Pitfall 2: Installer Upgrade Path Leaves Orphaned Registry Auto-Launch Entry

**What goes wrong:**
v2.6 implements auto-launch via `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` with a registry value pointing to the executable path (`AutoLaunchService.cs`). The value is written using `Process.GetCurrentProcess().MainModule.FileName` as the path. If the installer changes the install path between versions (e.g., v3.2 was run from `D:\Downloads\FuzzyClock.exe` and v3.3 installs to `%LOCALAPPDATA%\FuzzyClock\FuzzyClock.exe`), the old auto-launch registry entry still points to the old (now-deleted) path. Windows silently ignores broken Run entries at boot, but the auto-launch toggle in the app will show "disabled" (because `AutoLaunchService.IsEnabled()` checks for the current path, not the old path). The user re-enables auto-launch in the app, which writes the new path. But if the user never noticed, they expect auto-launch to work from the previous session's setting and are confused when it does not.

A secondary failure: the installer itself may add a separate auto-launch entry under a different name. Now two entries exist — one pointing to the old path (stale), one from the installer. The app's own toggle cannot remove the installer-managed entry because it does not know the installer's entry name.

**Why it happens:**
Auto-launch was implemented as a path-based registry value, not via a startup shortcut in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`. The path is hardcoded at write time. When the installation path changes, the stored path is wrong.

**How to avoid:**
The installer must remove any existing `FuzzyClock` auto-launch registry entry under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` during upgrade. Use the same registry value name that `AutoLaunchService` uses (`"FuzzyClock"` — verify against `AutoLaunchService.cs`). The installer script should:

1. On upgrade: delete the old `Run` entry (regardless of whether it points to the correct path).
2. On install completion: if `AppSettings.AutoLaunchEnabled` is `true` in the existing `settings.json`, re-write the `Run` entry with the new installation path.
3. On uninstall: always remove the `Run` entry.

Also: do not have the installer manage auto-launch independently of the app. One owner of the registry entry, one key name. The app manages auto-launch; the installer just cleans up the entry on uninstall.

**Warning signs:**
- After upgrading, the auto-launch tray toggle shows "disabled" even though the user had it enabled.
- Task Manager / Startup tab shows FuzzyClock with a broken path.
- The old executable location still exists (not cleaned up by the installer) and runs a stale version at boot.

**Phase to address:** Installer phase — handle upgrade path in the first installer draft.

---

### Pitfall 3: Mutex Abandonment on Crash Leaves Second Instance Blocked Until OS Cleanup

**What goes wrong:**
`App.xaml.cs` uses a named `Mutex("FuzzyClock_SingleInstance_v1", ...)` for single-instance enforcement. This is already implemented. The pitfall is what happens when the first instance crashes without releasing the mutex: the OS marks the mutex as "abandoned." On the next launch, `new Mutex(initiallyOwned: true, name, out createdNew)` throws `AbandonedMutexException` rather than returning `createdNew = false`. The current code does not handle `AbandonedMutexException`. The unhandled exception propagates through `OnStartup`, the app crashes immediately on launch after any prior crash, and the user cannot restart the widget without a reboot (or until the OS releases the abandoned mutex, which happens when the owning process fully exits).

The current implementation also disposes the mutex on `OnExit` but not in error paths. If `OnStartup` throws after the mutex is acquired but before `OnExit` can run, the mutex is held for the process lifetime but `ReleaseMutex()` is never called — same abandonment result.

**Why it happens:**
The abandonment case is not obvious during normal development testing (no crashes → no abandoned mutex → no exception). The `AbandonedMutexException` path is only hit after a crash, which is exactly when reliable restart matters most.

**How to avoid:**
Wrap the mutex creation in a try/catch for `AbandonedMutexException`. An abandoned mutex means the previous instance died; treat it as "no other instance running" and proceed:

```csharp
bool createdNew;
try
{
    _instanceMutex = new Mutex(initiallyOwned: true, "FuzzyClock_SingleInstance_v1", out createdNew);
}
catch (AbandonedMutexException)
{
    // Previous instance crashed without releasing; we now own the mutex.
    createdNew = true;
    // _instanceMutex is still set by the constructor before the exception is thrown.
}
```

The mutex constructor sets the out parameter and the object before throwing `AbandonedMutexException`, so `_instanceMutex` is valid after the catch.

**Warning signs:**
- Widget fails to launch after a crash; requires killing `FuzzyClock.exe` in Task Manager or rebooting.
- `AbandonedMutexException` appears in the Windows Application Event Log.
- The app cannot be restarted immediately after an `Environment.FailFast` or unhandled exception.

**Phase to address:** Single-instance / installer phase — add the try/catch when confirming single-instance implementation.

---

### Pitfall 4: Edge Snapping Conflicts with Ghost Mode Restore — Window Teleports After Ghost Exit

**What goes wrong:**
Edge snapping works by: on drag release (`Grid_MouseLeftButtonDown` returns from `DragMove()`), checking if `Left` or `Top` is within a snap threshold of a screen edge and adjusting `Left`/`Top` accordingly, then saving. This is straightforward.

The conflict: `GhostModeController._restoreTimer` fires every 75ms and calls `GetWindowRect(_hwnd, out RECT)` to check whether the cursor has left the ghost window. It compares `GetCursorPos()` against `GetWindowRect()`. If edge snapping fires after `DragMove()` returns and moves the window — say, from `Left=1894` to `Left=1920` (snapped to right edge) — and the ghost mode restore timer fires within the next 75ms interval while the cursor is still within the *pre-snap* window bounds but not the *post-snap* bounds, the restore fires spuriously (cursor outside post-snap rect → ghost restores). Immediately after ghost restore, if the user has not moved the mouse, `Window_MouseEnter` fires again (cursor is still over the original pre-snap position) → ghost re-activates → flicker loop.

In practice, this is only triggered if the user starts hover immediately after a drag that causes a snap. The 75ms timer makes the window for this race condition small but nonzero.

A second, separate conflict: the existing `UpdatePhraseIfChanged()` calls `UpdateLayout()` after phrase text changes, then re-clamps the window. Edge snapping's snap-on-layout-change (if implemented as a response to `SizeChanged` or `LocationChanged`) would fire on every phrase update, unintentionally snapping a window that the user has placed near (but not at) an edge.

**Why it happens:**
`DragMove()` is a blocking Win32 modal loop. `LocationChanged` fires during it (setting `_hasUserPosition = true`). After `DragMove()` returns, setting `Left`/`Top` for snap fires `LocationChanged` again. Ghost mode's restore timer runs independently on the DispatcherTimer thread. These three timelines can intersect.

**How to avoid:**
1. **Apply snap only on drag end, never on `LocationChanged` or `SizeChanged`.** The snap logic must live in `Grid_MouseLeftButtonDown` immediately after `DragMove()` returns and `_isDragging` is set to `false`. It must NOT be wired to `LocationChanged` or `SizeChanged` events — those fire on every phrase resize and would cause phantom snapping.

2. **Skip ghost activate for the 150ms window after a drag completes.** Add a `_justSnapped` timestamp. In `Window_MouseEnter`, if `DateTime.UtcNow - _lastDragEnd < TimeSpan.FromMilliseconds(150)`, skip ghost activation. This prevents the cursor-still-present-post-snap ghost trigger.

3. **Do not snap during ghost restore.** The ghost restore path (`GhostModeController.Restored` event) sets `Opacity` and clears `ContentBorder.Background`. It does NOT move the window. Snap must not be triggered by ghost restore.

**Warning signs:**
- Widget snaps to an edge, then immediately flashes (ghost activates and immediately restores).
- Phrase text changing at the 5-minute boundary causes the widget to snap to the nearest edge if it was placed close to the edge.
- `LocationChanged` handler is used as the snap trigger rather than post-DragMove.

**Phase to address:** Edge snapping phase — do not wire snap to LocationChanged; apply only post-DragMove.

---

### Pitfall 5: Edge Snapping with SizeToContent=WidthAndHeight — Snap Position Is Wrong Until After Layout

**What goes wrong:**
`MainWindow` uses `SizeToContent=WidthAndHeight`. This means `ActualWidth` and `ActualHeight` are not fixed; they change whenever the phrase text changes, the stats panel shows/hides, or the font size changes. Edge snapping to the right edge requires `Left = screenRight - ActualWidth`. If snap is computed before `UpdateLayout()` runs after a resize, `ActualWidth` is stale (reflects the pre-resize size), and the snapped position is wrong — a gap appears between the widget and the right edge, or the widget overflows the screen.

The existing `UpdatePhraseIfChanged()` already handles this: it calls `UpdateLayout()` before re-clamping. Edge snapping must follow the same pattern.

**Why it happens:**
`ActualWidth` in WPF is a layout-pass output. Setting `Left` or `Top` before calling `UpdateLayout()` means the position math uses the size from the previous layout pass. This is a well-known WPF gotcha for `SizeToContent` windows that is easy to miss when prototyping snap on a fixed-size window.

**How to avoid:**
In the snap computation immediately after `DragMove()` returns:

```csharp
DragMove();
_isDragging = false;
// Force layout to get current ActualWidth/ActualHeight before computing snap
UpdateLayout();
// Now ActualWidth and ActualHeight reflect the current phrase/stats state
ApplyEdgeSnap();  // uses ActualWidth, ActualHeight, screen bounds
SaveSettings();
```

`UpdateLayout()` is synchronous and safe here — it is the same call used in `UpdatePhraseIfChanged()` for the same reason.

**Warning signs:**
- Widget snapped to right edge shows a small gap (1–5px) on the right.
- Gap size varies depending on which phrase is showing (longer phrase = different `ActualWidth` = different gap).
- Snap works correctly on phrases of fixed length but not variable-length ones.

**Phase to address:** Edge snapping phase — call `UpdateLayout()` before snap computation.

---

### Pitfall 6: ResourceDictionary Added to App.xaml Leaks Styles Globally — MainWindow Gets Unintended Re-Styling

**What goes wrong:**
The Settings window redesign uses custom WPF styles (`Style` with `TargetType`). The developer adds a `ResourceDictionary` to `App.xaml`'s `Application.Resources` to share styles across the app. `App.xaml` currently has `<Application.Resources />` (empty). Adding a ResourceDictionary here makes all styles globally available. Any `Style` with `TargetType` and no `x:Key` becomes an **implicit style** — it applies to ALL instances of that control type in the entire application, including `MainWindow`.

Example: `<Style TargetType="Button">` added to App.xaml automatically applies to every Button in the app. `MainWindow` has no `Button` elements, but `SettingsWindow` does. However, if `MainWindow` ever gets a Button (e.g., for a future feature), it will inherit the Settings-specific style unexpectedly. More critically: `<Style TargetType="TabControl">` or `<Style TargetType="TextBlock">` in App.xaml will restyle `MainWindow`'s `TextBlock` elements (PhraseText, stats labels, etc.) — changing font, foreground, or padding in ways that break the carefully tuned overlay appearance.

**Why it happens:**
WPF's resource lookup walks up the logical tree: element → element.Resources → parent.Resources → ... → Application.Resources → theme dictionaries. A `Style` with `TargetType` and no `x:Key` in Application.Resources is resolved by type for any matching element anywhere in the app. Developers add resources to App.xaml for convenience without realizing the implicit-style scope.

**How to avoid:**
Do NOT add implicit styles (TargetType without x:Key) to App.xaml. Keep all Settings window styles inside `SettingsWindow.xaml`'s `<Window.Resources>` block. This is the existing pattern — `SettingsWindow.xaml` already has `<Window.Resources>` with `SegmentButtonStyle` defined there.

If a ResourceDictionary must be shared (e.g., a color palette), add it to App.xaml as **keyed resources only** (`x:Key` on every resource). Never add unkeyed styles to App.xaml.

```xaml
<!-- WRONG: implicit style leaks to MainWindow -->
<Style TargetType="TextBlock">
    <Setter Property="FontFamily" Value="Segoe UI" />
</Style>

<!-- CORRECT: keyed style, only applied when explicitly referenced -->
<Style x:Key="SettingsLabelStyle" TargetType="TextBlock">
    <Setter Property="FontFamily" Value="Segoe UI" />
</Style>
```

For the Settings redesign specifically: all new styles go in `SettingsWindow.xaml`'s `<Window.Resources>`. No new resources in `App.xaml`.

**Warning signs:**
- After adding a ResourceDictionary to App.xaml, `PhraseText` (or other MainWindow TextBlocks) changes appearance unexpectedly.
- The widget overlay gets a white background or visible border that wasn't there before.
- `SettingsWindow` styles look correct but MainWindow layout shifts.

**Phase to address:** Settings redesign phase — enforce the "styles in Window.Resources only" rule before adding any new XAML styles.

---

### Pitfall 7: Per-User Installer Install Path Breaks Existing Auto-Launch Registry Entry (First Install)

**What goes wrong:**
During development and pre-installer usage, users run `FuzzyClock.exe` directly from wherever they extracted it (e.g., `C:\Users\user\Downloads\FuzzyClock.exe` or `C:\tools\FuzzyClock.exe`). Auto-launch was written to that path. The per-user installer places the executable at `%LOCALAPPDATA%\FuzzyClock\FuzzyClock.exe`. After installation, the app runs from the new path, but auto-launch still points to the old path.

This is distinct from Pitfall 2 (upgrade-to-upgrade path). This is the first-install scenario where the user was running the portable EXE before any installer existed.

**Why it happens:**
`AutoLaunchService.IsEnabled()` checks whether `HKCU\...\Run\FuzzyClock` exists and points to the current executable. On first launch from the installed path, `IsEnabled()` returns `false` (old path ≠ new path). The user's saved `AppSettings.AutoLaunchEnabled = true` is applied by `ApplySettings()`, which calls `AutoLaunchService.Enable(currentPath)` — this re-writes the Run entry with the correct installed path. So the app self-heals if `ApplySettings()` always calls `AutoLaunchService.Enable/Disable` to reconcile the registry with the setting.

The real failure mode: if `ApplySettings()` only calls `Enable()` when `AutoLaunchEnabled` changes (i.e., the setting was previously `true` and is still `true` after loading), it may skip re-writing the stale path. The app needs to always reconcile registry state with setting state on startup, not just on toggle.

**How to avoid:**
In `ApplySettings()` (called at startup), always call the appropriate `AutoLaunchService` method regardless of whether the value changed:

```csharp
// Always reconcile — path may have changed even if the setting did not
if (settings.AutoLaunchEnabled)
    AutoLaunchService.Enable(Process.GetCurrentProcess().MainModule!.FileName);
else
    AutoLaunchService.Disable();
```

This is idempotent and self-healing: if the path is already correct, `Enable()` just overwrites with the same value. If it was stale, it corrects it. The existing code should be verified against this pattern.

**Warning signs:**
- After installation, Task Manager Startup tab shows FuzzyClock pointing to the old Downloads path.
- Auto-launch fails silently (old path not found at boot).
- `AutoLaunchService.IsEnabled()` returns `false` immediately after install even though the user had auto-launch enabled.

**Phase to address:** Installer phase — verify `ApplySettings()` always reconciles auto-launch registry with setting on startup.

---

### Pitfall 8: Edge Snap Threshold Too Aggressive — Overwrites Per-Monitor Position Memory for Near-Edge Placements

**What goes wrong:**
The per-monitor position memory system (`MonitorPositions` dictionary in `AppSettings`, keyed by monitor identity) saves the user's exact drag-released position. If the snap threshold is set too large (e.g., 30–50px), a user who intentionally placed the widget 20px from the right edge finds it snapping to the right edge on every drag. The "intentional near-edge" placement is never achievable — any position within the threshold gets replaced by the exact-edge position. This is especially frustrating for multi-monitor users who may want slightly different insets on each monitor.

A secondary issue: snap fires on drag end, which calls `SaveSettings()`. If the snap logic rounds to the edge, `MonitorPositions[currentKey]` is saved with the snapped position, not the user's released position. Subsequent launches restore the snapped position. The user's intent is irretrievably overwritten.

**Why it happens:**
Snap thresholds in typical desktop apps (Windows Snap Assist, Magnet on macOS) are 4–8px — tight enough to activate only when the user clearly intends to snap (releases near the edge). Developers sometimes use larger thresholds (20–40px) to make snapping "easier to activate," but this causes the overwrite problem for intentional near-edge placements.

**How to avoid:**
Use a snap threshold of 8px maximum (matching typical OS-level snap sensitivity). This is tight enough that users must intentionally release near the edge to trigger snap, and loose enough to avoid pixel-perfect precision requirements.

Document the threshold as a named constant:

```csharp
private const double EdgeSnapThreshold = 8.0;  // pixels; matches OS snap sensitivity
```

Do not make the threshold configurable for v3.3 — a fixed 8px is the right default and avoids per-user-setting complexity.

**Warning signs:**
- User complaint: "The widget always jumps to the edge even when I don't want it to."
- Snap activates when releasing the widget 15–20px from an edge.
- The threshold constant is larger than 10px.

**Phase to address:** Edge snapping phase — define threshold as a constant, set to ≤8px.

---

### Pitfall 9: Settings Window Redesign Breaks SettingsSnapshot Immutable Record — New Style Controls Added Without Matching Snapshot Fields

**What goes wrong:**
`SettingsWindow` uses a `SettingsSnapshot` immutable record (established in v3.2) to capture state at open time. The Settings redesign adds new visual controls (e.g., a preview panel, a color swatch, additional toggles). If a new control's value is not captured in `SettingsSnapshot` at open time, the "revert" path (cancel button, or ESC-to-close behavior) cannot restore the value. The user opens settings, changes the new control, cancels — the value remains changed even though they cancelled.

Conversely, if a new control is added to `SettingsSnapshot` but not to the populate-on-open logic, the control shows a stale value from the previous open (already documented as Pitfall 2 in v3.2 PITFALLS.md, but the new controls extend this risk surface).

**Why it happens:**
`SettingsSnapshot` is defined once and requires manual update when new controls are added. There is no compile-time enforcement that "every control must have a corresponding snapshot field." The missing snapshot field only manifests at runtime when the user cancels a change.

**How to avoid:**
For every new control added during the redesign:
1. Add its value to `SettingsSnapshot` in the same commit.
2. Populate the control from `SettingsSnapshot` in the `Refresh()` / populate-on-open path.
3. If cancel behavior is supported, verify the cancel path restores the snapshot value.

If the Settings window does not implement explicit cancel (changes are applied immediately via callbacks), document this in the phase plan — `SettingsSnapshot` is then used only for initial display accuracy, not for revert.

**Warning signs:**
- New control in Settings window shows a stale value when the window is opened a second time.
- Closing the Settings window (without a save/OK button) does not revert the last change made to the new control.
- `SettingsSnapshot` record definition in code is out of date with the control set in the XAML.

**Phase to address:** Settings redesign phase — update `SettingsSnapshot` in the same commit as each new control.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip code-signing the installer | No certificate cost/setup | SmartScreen blocks users; trust barrier on every release | Acceptable if audience is technical and distribution is informal (GitHub Releases, documented workaround) |
| Wire edge snap to `LocationChanged` instead of post-DragMove | Simpler event model | Fires on every phrase resize → phantom snapping near edges | Never — must be post-DragMove only |
| Use large snap threshold (20–30px) | "Easier" to snap | Overwrites intentional near-edge placements; user frustration | Never — use ≤8px |
| Add styles to App.xaml Application.Resources | Easy sharing | Implicit styles leak to MainWindow; overlay appearance corrupted | Never — use Window.Resources for SettingsWindow styles |
| Skip `UpdateLayout()` before snap computation | Saves one call | Snapped position wrong for variable-width SizeToContent window | Never |
| Installer manages auto-launch independently of app | Self-contained installer | Two competing Run entry owners; toggle confusion after upgrade | Never — app owns the Run entry; installer only cleans up on uninstall |
| Omit `AbandonedMutexException` handler | Less code | App cannot restart after crash until process fully exits | Never — the crash-restart case matters most |

---

## Integration Gotchas

Common mistakes when connecting new features to the existing MainWindow system.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| Edge snap + DragMove() | Wire snap to `LocationChanged` event | Apply snap in `Grid_MouseLeftButtonDown` after `DragMove()` returns |
| Edge snap + SizeToContent | Compute `Left = screen.Right - ActualWidth` before `UpdateLayout()` | Call `UpdateLayout()` first; then compute snap using current `ActualWidth` |
| Edge snap + ghost mode restore | Snap fires on ghost restore's Opacity/position change | Snap never runs in ghost restore path; only post-DragMove |
| Edge snap + per-monitor position memory | Save snapped position to `MonitorPositions` immediately | Same — just be aware snap overwrites the saved position; threshold ≤8px prevents unintended overwrites |
| ResourceDictionary + App.xaml | Add shared styles to Application.Resources | Keep all SettingsWindow styles in SettingsWindow.xaml Window.Resources; no unkeyed styles in App.xaml |
| Auto-launch + installer upgrade | Installer ignores old Run entry | Installer removes `HKCU\...\Run\FuzzyClock` on upgrade and uninstall |
| Auto-launch + path change | `ApplySettings()` only writes auto-launch on toggle | Always reconcile registry with setting on startup (idempotent Enable/Disable call) |
| Mutex + crash recovery | `AbandonedMutexException` propagates unhandled | Catch `AbandonedMutexException` in `OnStartup`; treat as `createdNew = true` |
| SettingsSnapshot + new controls | Add control without updating snapshot | Update `SettingsSnapshot` in the same commit as each new control |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `UpdateLayout()` called in edge snap on every `LocationChanged` | Excessive layout passes during drag — CPU spike, lag | Only call `UpdateLayout()` once post-DragMove, never in event handlers | Any drag near an edge |
| Snap logic calls `Screen.FromHandle` on every tick | Unnecessary Win32 call frequency | Only compute screen bounds during drag end, not in timers | Not a real concern at these intervals — future-proofing note |
| Installer writes large `%LOCALAPPDATA%` binary (trimmed/R2R publish) | Slow first-install on HDD | Use `dotnet publish -r win-x64 --self-contained false` for per-user installer if .NET 10 runtime is already present; use self-contained if not | Installation time on slow systems |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unsigned installer distributed via GitHub Releases | Users bypass SmartScreen warning; malicious actors could distribute a tampered version impersonating the app | Document the SmartScreen behavior; consider code-signing or winget distribution |
| Auto-launch executable path written from `Process.GetCurrentProcess().MainModule.FileName` without path validation | If the app is run from a network share or temp directory, the Run entry points to a transient path | Verify the install path is under `%LOCALAPPDATA%` before writing auto-launch; warn or skip if run from portable/temp location |
| Mutex name without version suffix allows cross-version blocking | A v3.2 instance would block a v3.3 instance from launching if the mutex name is the same | Current name is `FuzzyClock_SingleInstance_v1`; the `_v1` suffix is correct — do not remove it; only change the suffix if intentional multi-version coexistence is desired |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual feedback when snap activates | User doesn't know snap occurred; releases near edge and widget "jumps" unexpectedly | Brief (150ms) position animation or snap-indicator flash on edge contact — or at minimum, document snap in README |
| Snap only snaps, never un-snaps | Widget is permanently edge-stuck; user must drag far from edge to escape | Snap is a drag-end behavior only; no magnetic attraction during drag; any drag that ends >8px from edge does NOT snap |
| Settings redesign changes existing tab layout | Users familiar with v3.2 Settings window find controls in unexpected places | Keep the three-tab structure (Appearance / Stats / Behavior) from v3.2; redesign is visual (colors, spacing, controls polish) not structural |

---

## "Looks Done But Isn't" Checklist

- [ ] **Installer SmartScreen:** Test the installer on a clean VM with a fresh Windows account that has never run FuzzyClock. Confirm SmartScreen behavior and document it.
- [ ] **Installer upgrade path:** Install v3.2 (simulated), enable auto-launch, then install v3.3 over it. Verify: (1) old auto-launch Run entry is removed, (2) new Run entry points to new path if auto-launch was enabled, (3) settings.json is preserved.
- [ ] **Installer uninstall:** Verify uninstall removes the Run entry, the install directory, and the tray icon (app exits cleanly).
- [ ] **Mutex abandonment recovery:** Kill FuzzyClock.exe via Task Manager (simulates crash). Immediately relaunch. Verify it starts without error.
- [ ] **Edge snap threshold:** Release widget 5px from right edge → snaps. Release 10px from right edge → does NOT snap. Release 20px from right edge → does NOT snap.
- [ ] **Edge snap + SizeToContent:** Snap to right edge while showing a long phrase. Switch to a shorter phrase (phrase changes at 5-minute boundary). Widget remains flush with right edge (no gap appears).
- [ ] **Edge snap + ghost mode:** Snap widget to right edge. Hover over it (ghost activates, then restores). Widget position has not changed after ghost restore.
- [ ] **Edge snap + LocationChanged:** Phrase changes while widget is near (but not at) right edge (e.g., 15px from edge). Widget does NOT snap to the edge as a result of the phrase resize.
- [ ] **ResourceDictionary scope:** After adding Settings redesign styles, open MainWindow and verify: PhraseText font/color unchanged, stats labels unchanged, dial elements unchanged, no new background or border on the overlay.
- [ ] **App.xaml inspection:** Confirm `<Application.Resources />` remains empty or contains only keyed resources after the redesign.
- [ ] **Auto-launch path reconciliation:** Run the installed app. Check Task Manager Startup tab. The FuzzyClock entry points to the `%LOCALAPPDATA%` install path.
- [ ] **SettingsSnapshot coverage:** Open Settings window, change every new redesign control, close without saving (or cancel). Reopen Settings window. All controls show the pre-change values (if revert is supported) or the changed values (if apply-immediately model — document which).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SmartScreen blocks installer (P1) | MEDIUM | Sign the binary (requires certificate procurement) or switch to winget/ClickOnce distribution; or document workaround in release notes |
| Orphaned auto-launch entry after upgrade (P2) | LOW | Add installer script step to delete old Run entry; add `ApplySettings()` reconciliation; release patch installer |
| Mutex abandonment crash loop (P3) | LOW | Add `AbandonedMutexException` catch — one-line fix; patch release |
| Edge snap + ghost mode flicker (P4) | MEDIUM | Add `_lastDragEnd` timestamp; skip ghost activation 150ms post-drag; two-line fix |
| Wrong snap position (SizeToContent) (P5) | LOW | Add `UpdateLayout()` call before snap computation — one-line fix |
| App.xaml style leakage into MainWindow (P6) | LOW–MEDIUM | Move offending styles from App.xaml to SettingsWindow.xaml Window.Resources; test overlay appearance |
| Auto-launch stale path (P7) | LOW | Add idempotent reconciliation call in `ApplySettings()` — one-line fix; patch release |
| Snap threshold too aggressive (P8) | LOW | Reduce constant to ≤8px — one-line fix |
| SettingsSnapshot stale for new controls (P9) | LOW | Add missing field to `SettingsSnapshot`; update populate-on-open path |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SmartScreen unsigned installer (P1) | Installer phase — decide signing/distribution strategy in plan | Test on clean VM with fresh account |
| Orphaned auto-launch entry on upgrade (P2) | Installer phase — write upgrade script section | Install, upgrade, check Task Manager Startup tab |
| Mutex abandonment after crash (P3) | Single-instance / installer phase | Kill process, relaunch immediately; no crash |
| Edge snap + ghost mode flicker (P4) | Edge snapping phase | Snap to edge, hover over widget, verify no flicker |
| Edge snap + SizeToContent wrong position (P5) | Edge snapping phase | Snap while long phrase showing; verify flush edge |
| ResourceDictionary App.xaml leakage (P6) | Settings redesign phase — first style addition | Open MainWindow after adding styles; verify overlay unchanged |
| Auto-launch path stale after first install (P7) | Installer phase + ApplySettings() review | Run installed binary; check Run entry path in registry |
| Snap threshold too aggressive (P8) | Edge snapping phase | Release at 5px, 10px, 20px from edge; only 5px snaps |
| SettingsSnapshot incomplete for new controls (P9) | Settings redesign phase | Add new control, close Settings, reopen; state correct |

---

## Sources

| Source | Confidence |
|--------|------------|
| `App.xaml.cs` — single-instance Mutex implementation (already present); `AbandonedMutexException` handling absent; `OnExit` releases mutex correctly; read directly from source | HIGH |
| `GhostModeController.cs` — 75ms polling timer using `GetCursorPos` + `GetWindowRect`; `_isGhostMode` state; `Activate()` / `Restored` event; read directly from source | HIGH |
| `MainWindow.xaml.cs` — `DragMove()` in `Grid_MouseLeftButtonDown`; `_isDragging` flag; `LocationChanged → _hasUserPosition`; `UpdateLayout()` before re-clamp in `UpdatePhraseIfChanged()`; `Left`/`Top` assignments; `SizeToContent=WidthAndHeight`; read directly from source | HIGH |
| `App.xaml` — `<Application.Resources />` currently empty; read directly from source | HIGH |
| `SettingsWindow.xaml` — all styles in `<Window.Resources>`; `SegmentButtonStyle` defined there; no App.xaml resources used; read directly from source | HIGH |
| `AutoLaunchService.cs` (referenced in MainWindow.xaml.cs) — `Enable(path)` / `Disable()` / `IsEnabled()` pattern; path from `Process.GetCurrentProcess().MainModule.FileName`; confirmed from call sites | HIGH |
| `PROJECT.md` — v2.6: `HKCU\...\CurrentVersion\Run` registry entry written by `AutoLaunchService`; per-monitor position memory with `MonitorPositions` dict; `SizeToContent=WidthAndHeight` and clamping pattern documented | HIGH |
| `MEMORY.md` — ghost mode: `_restoreTimer` 75ms + `GetCursorPos` + `GetWindowRect`; `WS_EX_TRANSPARENT` pattern; synthetic `WM_MOUSELEAVE` note; `Mouse.GetPosition` failure under WS_EX_TRANSPARENT | HIGH |
| Windows SmartScreen / Application Reputation — unsigned PE executables trigger SmartScreen warning on first download; EV certificates suppress immediately; OV certificates build reputation over time; self-signed certificates do not suppress SmartScreen. Confidence based on well-documented Microsoft behavior (consistent across multiple official sources). | HIGH |
| WPF implicit style scoping — `Style` with `TargetType` and no `x:Key` in `Application.Resources` applies to all matching elements in the entire application. Standard WPF resource lookup documented in MSDN. | HIGH |
| .NET `AbandonedMutexException` behavior — thrown by `WaitOne()` and the `Mutex` constructor when acquiring an abandoned mutex; the mutex object is still set before the exception is thrown. Standard .NET BCL behavior. | HIGH |

---

*Pitfalls research for: Fuzzy Clock v3.3 — Per-user installer, edge snapping, Settings visual redesign*
*Researched: 2026-03-17*
