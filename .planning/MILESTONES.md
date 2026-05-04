# Milestones

## v4.2 Temps & Menu (Shipped: 2026-05-04)

**Phases completed:** 6 phases (75–80), 10 plans, 562 MSTest green (445 Core + 117 App)

**Git range:** v4.1 → v4.2 (66 commits, 130 files, +17,522 / -2,064 lines)

**Key accomplishments:**

- TemperatureService singleton in `FuzzyClock.App` with LibreHardwareMonitorLib 0.9.6 (MPL-2.0 pinned), 5s async init via `Task.WhenAny`, dedicated 2s-cadence background task (Path 2 per spike-measured 608ms Update() mean), three-tier dispose (MainWindow.OnClosing + SessionEnding + ProcessExit) guarded by Interlocked single-entry; `IsReady` gate + `-1f` sentinel discipline mirrors StatsService conventions
- TemperatureFormatter pure static in `FuzzyClock.Core` (zero LHM refs) with 2-space separator, integer °C, `°` symbol only, empty-on-all-suppressed output; 8 `[TestMethod]` (12 runtime via DataRow); 5 AppSettings init-property bools persist across settings.json round-trips
- RightClickMenuGate pure predicate with 6 DataRow truth-table cases + MainWindow wiring (PreviewMouseRightButtonUp + `_menuOpen` field + Opening/Closed `+=` hooks preserving TrayMenuBuilder.SyncCheckmarks); widget right-click opens the exact tray ContextMenuStrip instance; TrayMenuBuilder.cs zero-diff invariant preserved
- Temps tab in Settings window (index 2 between Stats and Behavior) with master toggle + 4 per-sensor checkboxes (CPU/GPU/Mobo/NVMe with defaults ON/ON/OFF/OFF per NVMe-unreliable spike amendment) + disabled+"(N/A)" suffix logic + muted help text disclaimer; `TempSensorsPanel.IsEnabled` gated by master (mirrors GhostFadeRadiusPanel precedent)
- TempsText on widget renders below UptimeText inside StatsPanel with immediate reflow on Settings toggle (5 Phase 78 handlers each extended with `UpdateTempsDisplay();` after `SaveSettings();`); accent color + auto-contrast participation via `TempsText.Foreground = brush;` at BOTH ApplyTheme AND ApplyDisplayColor sites (Phase 33 critical pattern)
- MPL-2.0 release compliance: `THIRD-PARTY-NOTICES.md` at repo root (644 lines — verbatim MPL-2.0 + Apache-2.0 + MIT + attribution blocks for LHM 0.9.6 + 5 transitive deps); REL-02 post-publish CI grep gate (WinRing0*.sys absent); REL-03 pre-build CI grep gate (LibreHardwareMonitor absent from FuzzyClock.Core/); Inno Setup ships NOTICES to `{app}` root with `PrivilegesRequired=lowest` invariant preserved

**Key technical decisions:**

- D-05 Path 2 threading (spike measured 608ms Update() mean — exceeded 50ms piggyback threshold)
- D-01 PublishSingleFile=true preserved over multi-file publish (transitive DLLs self-extract from FuzzyClock.exe)
- D-03 Handwritten THIRD-PARTY-NOTICES over auto-generation tool (pinned dep → stable notice)
- NO-GO scope amendments 2026-05-04: GPU-only minimum bar per spike (NVMe not enumerated on PawnIO-free baseline); TEMP-TAB-03 NVMe default OFF; 5s init timeout per 4272ms Computer.Open() measurement

**Known deferred items at close:**

- `PhraseEngineTests.SpecialCases_NoonAndMidnight(12,0,"noon")` ~20% probabilistic flake — `EnglishPhraseProvider.NoonCandidates` random pick across 5 alternatives; introduced in `924562e` pre-v3.2; tracked in STATE.md Active TODOs for opportunistic fix
- `FuzzyClock.App.csproj <Version>3.6.0</Version>` stale — CI overrides on tag push so harmless; bump to 4.2.0 in post-milestone polish
- Phase 80 Items 5+8 of human-verify (installer end-to-end + NOTICES SHA256 parity) — deferred to first `v4.2.0` tag push since Inno Setup 6 not installed on dev box; installer compile deterministic given verified inputs

---

## v4.1 Polish & Phrases (Shipped: 2026-04-01)

**Phases completed:** 5 phases, 8 plans, 16 tasks

**Key accomplishments:**

- Backdrop padding increased to 12px around all widget content with automatic dimension propagation to edge snapping, ghost mode, contrast sampling, and position clamping
- Stats interval slider: continuous 0.5–10.0s replaces discrete 1s/3s/10s selector; `StatsIntervalSeconds` migrated from int to double across full stack
- Classic phrase provider expanded to 70 candidates (14 slots × 5 each); Terse expanded to 65 candidates (13 slots × 5 each) with British-idiom preservation
- Jive/Pirate/Yoda personality providers deepened with authentic linguistic patterns: AAVE rhythmic phrasing, nautical metaphors (bells/watch/glass/mark), strict OSV syntax inversion — 210 phrases total
- Named theme system removed (Midnight/Neon/Ghost/Warm/Terminal): 325 lines deleted, ThemeDefinition.cs deleted, Settings Appearance simplified to Accent Color first
- 501 MSTest tests (433 Core + 68 App), 0 failures; 25 files changed, +1,562 / -657 lines

---

## v4.0 Proximity Ghost Mode (Shipped: 2026-03-27)

**Phases completed:** 4 phases, 5 plans, 9 tasks

**Key accomplishments:**

- ComputeProximityRatio static method (Chebyshev distance, 12 TDD unit tests) + always-running timer with ProximityChanged event driving ghost state transitions entirely inside the controller
- Proximity fade wired into MainWindow: IsEnabled gate in controller, ProximityChanged drives this.Opacity via linear fade formula, drag guard, and legacy snap-to-ghost block deleted
- Proximity fade radius slider wired end-to-end: Settings > Behavior tab slider (20-200px) drives GhostModeController.GhostFadeRadiusPx live and persists via SaveSettings()
- ResetToDefaults() now resets GhostFadeRadiusPx to 80, closing the PROX-07 gap where the controller retained a stale user value after reset

---

## v3.9 LCD Clock + Japanese Styles (Shipped: 2026-03-27)

**Phases completed:** 5 phases, 6 plans, 14 tasks

**Key accomplishments:**

- Three Japanese phrase style providers added to FuzzyClock.Core: `JapaneseTersePhraseProvider` (clipped colloquial), `JapanesePoeticPhraseProvider` (atmospheric imagery), `JapaneseRudePhraseProvider` (blunt/impatient); registered in PhraseEngine as `ja-classic`/`ja-terse`/`ja-poetic`/`ja-rude`; 37 new unit tests covering all 12-bucket + noon/midnight cases
- ResolveLocaleKey helper extracted into MainWindow, consolidating three duplicate locale-resolution switch expressions and enabling Japanese phrase style variants in SettingsWindow
- LCD button and collapsible LcdOptionsPanel (24-hour, show-seconds, Dark/Paper/Silver style) added to Settings Appearance tab, wiring five event handlers to pre-existing MainWindow LCD hooks.
- `_colonVisible` bool toggle in LcdClockView.UpdateTime() makes Colon1 blink at 1 Hz using the existing 1s DispatcherTimer tick — no new timer, two lines changed
- LcdStyle validation guard in SettingsService.Validate() — unknown values (e.g. "Broken") reset to Dark default without throwing; 352 tests, 0 failures

---

## v3.8 Dial Settings (Shipped: 2026-03-23)

**Phases completed:** 1 phase, 1 plan

**Key accomplishments:**

- Dial face checkboxes (Hour Ticks, Minute Dots, Hour Numbers) wired to Settings > Appearance tab with `Visibility.Collapsed` gating — visible only when ClockType.Dial is active
- `PopulateControls` reads all three from `SettingsSnapshot`; each handler fires the pre-existing `HourTicksChanged`/`MinuteDotsChanged`/`HourNumbersChanged` event through the `_suppressEvents` guard
- Live widget update and `settings.json` persistence confirmed end-to-end; 299/299 MSTest tests pass (262 Core + 37 App)

---

## v3.7 Nixie Clock (Shipped: 2026-03-23)

**Phases completed:** 2 phases, 2 plans, 3 tasks

**Key accomplishments:**

- MSTest absent-field test for ClockType JSON deserialization default (ClockType.Phrase), closing Phase 58's final success criterion
- BackdropBorder is now the sole hover backdrop — 5 ContentBorder.Background assignments removed from MainWindow, build clean at 0 errors, 274 tests passing

---

## v3.6.2 Contrast Flicker Regression Fix (Shipped: 2026-03-19)

**Phases completed:** 1 phase (58), 1 plan
**Test suite:** 274 MSTest tests (249 Core + 25 App), 0 failures
**Files changed:** 1 code file (`ContrastRefreshController.cs`)

**Key accomplishments:**

- Added `SHELLDLL_DefView` to shell class exclusion list in `HasAppWindowBeneath` — fixes AutoContrast flicker on desktops with visible icons (FIX-04/FIX-05)
- Added `DwmGetWindowAttribute(DWMWA_CLOAKED)` check to skip Windows 11 shell panels (`ApplicationFrameWindow` — Start menu, Search, Widgets) that remain in Z-order when dismissed but are hidden by DWM — root cause discovered during human verification after first fix
- AutoContrast still correctly switches text color to black/white when a real app window is beneath the widget; no regression (FIX-06); all 274 tests pass

---

## v3.6.1 Contrast Flicker Fix (Shipped: 2026-03-19)

**Phases completed:** 1 phase (57), 1 plan
**Test suite:** 274 MSTest tests (249 Core + 25 App), 0 failures

**Key accomplishments:**

- Added `HasAppWindowBeneath` Z-order walk guard in `ContrastRefreshController.Tick`: seeds from `GetWindow(widgetHwnd, GW_HWNDNEXT)`, checks `IsWindowVisible` + rect overlap + class name exclusion (Progman, WorkerW, SysListView32)
- Guard holds `_contrastState` stable on skip — preserves hysteresis from prior valid samples; eliminates contrast oscillation feedback loop over empty desktop
- `_hwnd` cached in `Initialize()` via `WindowInteropHelper`; `Overlaps` uses four-inequality RECT check (no extra P/Invoke)

---

## v3.5 Phrase Wrap + Installer (Shipped: 2026-03-18)

**Phases completed:** 8 phases (48–55), 12 plans

**Key accomplishments:**

- Dark-mode Settings window via ThemeMode="Dark" — standard controls restyled automatically, zero style leakage to MainWindow (SETR-01–04)
- Named-pipe single-instance IPC so second launch activates existing window; AbandonedMutexException guard for crash-restart (FIX-02, FIX-03)
- 8px edge snapping post-DragMove; ResetToDefaults() fully resets phrase style and locale (SNAP-01–03, FIX-01)
- Per-user Inno Setup installer: installs to %LOCALAPPDATA%\Programs\FuzzyClock\, no UAC, Start Menu shortcut, upgrade-safe, optional settings preserve on uninstall (INST-01–06, INST-08–09)
- GitHub Actions CI release pipeline: version-stamped publish, installer compilation, SHA256 checksums, draft GitHub Release on tag push (INST-07)
- PhraseWrapService with midpoint + natural pause (13 pause markers) split algorithms; wired into MainWindow Inlines renderer with per-style persistence (WRAP-01–03)
- IPhraseProvider.GetSegmentKey() — phrase providers only change on bucket advance, not every 10s tick; segment-key guard in UpdatePhraseIfChanged (SEGKEY-01–03)
- Full-widget BackdropBorder (phrase+date+stats+uptime); BackdropAlwaysVisible and BackdropOpacityPercent settings; SettingsWindow Appearance tab Backdrop section (BDROP-01–03)
- PoeticPhraseProvider rewritten: 48 templates all naming the hour via {h}/{h1}; GetStructuredPhrase splits qualifier from hour word for typographic emphasis (POETIC-01)
- 274 MSTest tests passing; CI gate enforced

---

## v1.0 MVP (Shipped: 2026-02-25)

**Phases completed:** 3 phases, 7 plans, 0 tasks

**Key accomplishments:**

- Shipped PhraseEngine.GetPhrase() covering all 12 five-minute bucket slots per hour with noon/midnight special cases — 51 unit tests passing
- Built transparent frameless always-on-top WPF overlay: no frame, no taskbar entry, no Alt+Tab entry via hidden ToolWindow owner pattern
- Single-instance Mutex guard prevents duplicate widget instances on the desktop
- Right-click context menu provides the only close mechanism (Alt+F4 disabled by WindowStyle=None)
- Manual-offset TextBlock drop shadow works reliably on AllowsTransparency windows (.NET 10 GPU path limitation bypassed)
- DispatcherTimer polls PhraseEngine every 10s; UpdateLayout() before PositionTopRight() ensures correct SizeToContent repositioning
- SetInitialPhrase() called before Show() eliminates placeholder flash on startup

---

## v1.1 Position + Font Size (Shipped: 2026-02-25)

**Phases completed:** 2 phases (4–5), 3 plans

**Key accomplishments:**

- `AppSettings` positional record + `SettingsService` with atomic JSON I/O to `%LOCALAPPDATA%\FuzzyClock\settings.json`; multi-monitor VirtualScreen clamping; Left=-1 sentinel for first-run
- Widget drag via `DragMove()` — left-click repositions freely; position saved immediately on mouse-up
- Startup position restore — `ApplySettings()` before `Show()` with re-clamp on `ContentRendered`; widget stays fully on-screen after monitor disconnects
- `_hasUserPosition` snap guard prevents 5-min phrase-boundary updates from resetting widget to top-right
- Re-clamp after every phrase change — `SizeToContent=WidthAndHeight` window resize at screen edges handled correctly
- Font Size right-click submenu (Small 16pt / Medium 24pt / Large 32pt); `ContextMenu_Opened` syncs checkmarks; immediate apply with re-clamp; persisted via existing settings infrastructure

---

## v1.2 System Stats (Shipped: 2026-02-26)

**Phases completed:** 4 phases (6–9), 5 plans

**Key accomplishments:**

- AppSettings migrated to init-property record with `StatsVisible`/`StatsIntervalSeconds` fields; zero-interval guard prevents CPU spike from corrupted settings.json
- StatsService reads CPU, GPU, and MEM from Windows PDH counters on a background thread; GPU multi-instance `engtype_3D` enumeration with `_gpuAvailable` fallback for VMs/RDP; ~6s async init with `_initialized` guard ensuring no UI thread blocking
- Stats panel XAML: two-row grid, fixed `Width=180` on StatsPanel container (prevents jitter from SizeToContent when % text length changes), three labeled rows with horizontal bars and % text; geometry-constant bar widths (109px = 180 − 35 − 36) replacing `ActualWidth` dependency that caused zero-width bars on Collapsed→Visible transition
- Stats show/hide toggle (`MenuShowStats_Click` reads `StatsPanel.Visibility`, not `IsChecked`) and 1s/3s/10s interval selector via right-click Stats submenu; all four menu checkmarks synced in `ContextMenu_Opened` on every menu open
- Full persistence round-trip: `SaveSettings`/`ApplySettings` extended with stats fields; `ContentRendered` conditionally starts `_statsTimer` if settings restored `StatsVisible=true`; `SetStatsVisible(true)` calls `UpdateLayout()+Clamp()` to prevent off-screen push when showing stats near bottom edge

---

## v1.3 Individual Stat Visibility (Shipped: 2026-02-26)

**Phases completed:** 1 phase (10), 2 plans

**Key accomplishments:**

- Added `CpuVisible`, `GpuVisible`, `MemVisible` bool fields to `AppSettings` with init-property pattern and `= true` defaults; `SettingsService.Defaults()` updated explicitly
- Added `x:Name` to three stat row `Grid` elements in XAML; Stats submenu extended with Separator + three `IsCheckable` MenuItems (Show CPU / Show GPU / Show MEM)
- `SetStatRowVisible()` helper wires Visibility, one-way auto-collapse (last hidden row triggers `SetStatsVisible(false)`), and re-clamp-on-show
- Click handlers read row `Visibility` (not `IsChecked`) for reliable toggle direction — same pattern as `MenuShowStats_Click`
- `ContextMenu_Opened` syncs all three new `IsChecked` values from row Visibility; `ApplySettings()` sets rows directly (safe before `Show()`); `SaveSettings()` persists all three fields — full round-trip verified

---

## v1.4 PAG Stat Row (Shipped: 2026-02-26)

**Phases completed:** 1 phase (11), 2 plans

**Key accomplishments:**

- `AppSettings.PagVisible` init-property (default true) added; round-trips through System.Text.Json without breaking v1.3 settings files
- StatsService extended with PDH "Paging File"/"% Usage"/"_Total" counter using 4-param constructor, `PerformanceCounterCategory.Exists` + try/catch double guard, and -1f unavailable sentinel — same pattern as GPU fallback
- XAML `PagRow` Grid (identical structure to CPU/GPU/MEM rows: Segoe UI Light 12pt, `#40FFFFFF` track, 3-column layout) and `MenuPagVisible` MenuItem added to Stats submenu
- Six MainWindow.xaml.cs integration points wired: click handler (reads Visibility not IsChecked), UpdateStatsDisplay N/A branch, ContextMenu_Opened checkmark sync, ApplySettings direct assignment, SaveSettings persistence, SetStatRowVisible auto-collapse extended from 3-row to 4-row check
- All five STAT-11 through STAT-14 checks human-verified; v1.4 ships with PAG as fully independent fourth stat row alongside CPU, GPU, and MEM

---

## v1.5 Hover Fast-Refresh (Shipped: 2026-02-26)

**Phases completed:** 1 phase (12), 1 plan

**Key accomplishments:**

- `Window_MouseEnter` handler switches `_statsTimer` to 0.5s cadence via Stop+set+Start when stats panel is visible (HVRF-01)
- `Window_MouseLeave` handler restores `_statsTimer` to `_statsIntervalSeconds` via Stop+set+Start on mouse leave (HVRF-02)
- Both handlers guard on `StatsPanel.Visibility == Visible` — hover has no effect when stats panel is hidden (HVRF-03)
- Event subscriptions wired in `ContentRendered` lambda after `_statsTimer` construction — zero XAML changes, `_statsIntervalSeconds` never written by hover

---

## v1.6 Dial Mode (Shipped: 2026-02-26)

**Phases completed:** 1 phase (13), 2 plans

**Key accomplishments:**

- `AppSettings.DialMode` bool init-property (default false) — JSON-safe persistence; no zero-guard needed for bool, no breaking change to existing settings files
- `DialCanvas` 80×80 Canvas with `HourHand` (25px, White, 2px, round caps) and `MinuteHand` (35px) WPF Lines in row 0 alongside `PhraseTextBlock`, initially `Visibility=Collapsed`
- `UpdateDialDisplay()` trig — X2=40+L×sin θ, Y2=40−L×cos θ from center (40,40); analog hour interpolation `((hour%12)/12.0 + minute/720.0)×360`; driven by existing 10s phrase timer tick
- `SetDialMode()` toggles PhraseText/ShadowText/DialCanvas Visibility + saves settings immediately; `ApplySettings()` sets Visibility directly (pre-Show() safe); `ContextMenu_Opened` syncs `MenuDialMode.IsChecked`
- All 5 DIAL-01 through DIAL-05 criteria human-verified: menu toggle + checkmark, hands-only display, correct analog hand positions, stats panel unaffected below dial, persistence across restart

---

## v1.7 Visual Polish (Shipped: 2026-02-26)

**Phases completed:** 1 phase (14), 1 plan

**Key accomplishments:**

- Removed hardcoded `#26000000` Border background; widget background is now fully transparent by default
- `Window_MouseEnter` sets `ContentBorder.Background` to `#59000000` (~35% black) when stats panel is visible (BACK-01/02)
- `Window_MouseLeave` clears backdrop unconditionally before the stats guard — prevents stale backdrop if stats hidden mid-hover (BACK-03 edge case)
- `Grid_MouseLeftButtonDown` guards `DragMove()` with `statsTimerWasRunning` stop/start — stat values freeze during drag, resume on release (DRAG-01)

---

## v1.8 Dial Enhancement (Shipped: 2026-02-26)

**Phases completed:** 2 phases (15–16), 3 plans

**Key accomplishments:**

- Hover backdrop decoupled from stats panel — `ContentBorder.Background` assignment moved before `StatsPanel.Visibility` guard in `Window_MouseEnter`; backdrop always shows on hover regardless of stats visibility (BACK-04)
- `InitDialDecorations()` creates 84 canvas elements once (12 tick `Line`s at R=31–36, 60 minute `Ellipse` dots at R=35, 12 hour number `TextBlock`s at R=25); toggled via `Visibility` with no re-layout cost
- `Dial Face` right-click submenu (`MenuDialFace`) with three `IsCheckable` items: Show Hour Ticks / Show Minute Marks / Show Hour Numbers; DIAL-09 hides submenu in phrase mode, restores in dial mode
- All three decoration preferences persisted to `settings.json` via new `AppSettings` bool init-properties (default `false` — preserves minimal dial for existing users)
- All five success criteria (DIAL-06/07/08/09 + persistence + phrase-mode round-trip) human-verified on first attempt

---

## v1.9 Context-Aware Menus (Shipped: 2026-02-26)

**Phases completed:** 1 phase (17), 2 plans

**Key accomplishments:**

- Applied DIAL-09 inverse pattern to Font Size submenu: `MenuFontSize.Visibility = _dialMode ? Collapsed : Visible` wired in `ContextMenu_Opened` and `SetDialMode()` — Font Size submenu hidden in dial mode, restored in phrase mode (MENU-01)
- All four MENU-01 success criteria human-verified: phrase-mode presence, dial-mode absence, restore-on-return, font size preference preserved

---

## v2.0 Visual Identity (Shipped: 2026-02-27)

**Phases completed:** 4 phases (18–21), 7 plans

**Key accomplishments:**

- Extended AppSettings with `AccentColor` (hex string, 8-digit AARRGGBB, default `#FFFFFFFF`) and `Opacity` (double, init default 1.0) init-properties; `SettingsService` guards prevent invisible-widget regression on upgrade (Opacity=0.0 guard) and null/empty AccentColor
- Window opacity control via right-click Opacity submenu (25%/50%/75%/100%) and `PreviewMouseWheel` scroll (10% steps, 10% floor); `Window.Opacity` applies to the entire widget uniformly; opacity persisted and restored on launch
- Accent color theming via `ApplyTheme()` covering 14 elements: phrase text, drop shadow, both dial hands, all 12 decoration elements (tick marks, minute dots, hour numbers), 4 stats fill bars, and 4 stats % text values; 5 named presets (White/Amber/Ice Blue/Green/Hello Kitty Pink); `ContextMenu_Opened` derives checkmark from `_accentColor` hex on the fly — no secondary theme-name field needed
- Custom color picker via Windows `ColorDialog` with `Win32Window : IWin32Window` HWND adapter; `UseWindowsForms=true` enabled with `using` aliases to resolve WinForms/WPF type name collisions; dialog always appears in front of the `Topmost=True` widget; custom colors persist as hex and restore identically on launch; no preset checkmark shown when custom color is active

---

## v2.1 Uptime (Shipped: 2026-02-27)

**Phases completed:** 2 phases (22–23), 2 plans, 4 tasks

**Key accomplishments:**

- `AppSettings.UptimeVisible { get; init; } = true` — explicit init default ensures the uptime row is visible on first launch and on upgrade from v2.0 settings.json (JSON-absent bool would otherwise deserialize as false)
- UptimeText TextBlock placed inside StatsPanel's StackPanel — auto-hides with stats; independently toggleable via "Show Uptime" in the Stats right-click submenu; accent-colored from launch via `ApplyTheme()`
- `up Xd Xh Xm` format with full leading zero-unit suppression: 3-case if/else (`days > 0` / `hours > 0` / else) produces `up 5h 3m`, not `up 0d 5h 3m`; sub-hour shows `up 45m`
- `Queue<float> _cpuSamples` rolling averages for 1m/5m/15m with interval-aware window sizing (`Math.Ceiling(windowSeconds / _statsIntervalSeconds)`) — adapts to 1s/3s/10s intervals without hardcoded sample counts
- `StatsService.IsReady` property (exposes `volatile bool _initialized`) guards cold-start: buffer push skipped until ~6s init completes; no zero-depressed averages on launch
- `_isHoverFastRefresh` flag gates buffer push during 0.5s hover cadence — prevents 6× oversampling that would corrupt the labeled 1m/5m/15m time windows

---

## v2.2 System Tray (Shipped: 2026-03-02)

**Phases completed:** 1 phase (24), 2 plans

**Key accomplishments:**

- `System.Windows.Forms.NotifyIcon` tray icon (16×16 analog clock face — dark circle, white hands at 10:10, white rim) visible in Windows notification area while app is running
- Right-click tray context menu with exactly two items: "Reset to Defaults" and "Quit"
- `ResetToDefaults()` snaps widget to factory state instantly: White accent color, 100% opacity, 16pt font, phrase mode (dial disabled), centered on primary screen, saved to settings.json immediately
- `Quit` calls `Application.Current.Shutdown()` via `Dispatcher.Invoke` — clean WPF exit, no orphaned process
- `_trayIcon.Dispose()` in `Window.Closed` event — tray icon removed from notification area on any exit path (tray Quit, Alt+F4, window close)

---

## v2.3 Ghost Mode (Shipped: 2026-03-02)

**Phases completed:** 3 phases (25–27), 3 plans

**Key accomplishments:**

- Phrase text horizontally centered in the widget content area via `TextAlignment=Center` + `HorizontalAlignment=Stretch` on both PhraseText and ShadowText TextBlocks — shadow offset preserved via shared Grid cell
- Ghost mode core: widget auto-hides (`Opacity=0` + `WS_EX_TRANSPARENT` click-through) on `MouseEnter`; restores via 75ms `DispatcherTimer` polling `GetCursorPos+GetWindowRect` (pure Win32 — bypasses WPF input broken under WS_EX_TRANSPARENT)
- Ctrl+Alt interaction modifier: `GetAsyncKeyState(VK_LCONTROL) & 0x8000` + `GetAsyncKeyState(VK_LMENU) & 0x8000` guard at top of `Window_MouseEnter` — holding left Ctrl+Alt suppresses ghost and activates normal hover (backdrop + fast-refresh) instead; `VK_LMENU` avoids AltGr false-positives on EU keyboards
- Ghost mode tray toggle: checkable "Ghost Mode" item in system tray context menu (with separator above Reset to Defaults); state persists to `settings.json` via `AppSettings.GhostModeEnabled`

---

## v2.5 Unit Tests (Shipped: 2026-03-03)

**Phases completed:** 3 phases (28–30), 3 plans, 8 tasks
**Test suite:** 73 tests (64 Core + 9 App), 0 failures
**Files changed:** 10 new files created, 5 modified — 2095 insertions, 70 deletions

**Key accomplishments:**

- `UptimeFormatter.Format(TimeSpan)` and `DialGeometry.GetHour/MinuteAngleDegrees()` extracted from MainWindow into `FuzzyClock.Core` as pure static classes — 13 MSTest boundary-condition tests (7 + 6) all passing
- `FuzzyClock.App.Tests` project added (net10.0-windows, MSTest 4.0.1, UseWPF=true) with `SettingsService.Validate()` pure static method and pure `Clamp()` overload (no file I/O, no SystemParameters dependency) — 9 test cases covering AppSettings round-trip, absent-field init defaults, and all three Validate guards
- GitHub Actions `release.yml` hardened with `dotnet restore → dotnet test → dotnet publish` step order; no `continue-on-error` — all 73 tests gate the release artifact; a broken test prevents `FuzzyClock.exe` from being produced

---

## v2.6 Polish (Shipped: 2026-03-03)

**Phases completed:** 2 phases (31–32), 4 plans
**Test suite:** 78 tests (up from 73), 0 failures
**Files changed:** 37 files changed, +2696 lines

**Key accomplishments:**

- `AutoLaunchService` writes/removes `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` registry entry; tray menu toggle updates checkmark on `Opening`; `AppSettings.AutoLaunchEnabled` (default false) persists to settings.json and is re-synced with the registry on every launch
- `MonitorService` enumerates monitors via `QueryDisplayConfig` P/Invoke for human-readable friendly names (e.g. "Dell U2720Q"); deduplicates identical names with `-2`/`-3` suffixes by `Screen.AllScreens` order; falls back to GDI device name when no friendly name available
- `AppSettings` migrated from flat `Left`/`Top` doubles to `Dictionary<string, MonitorPosition>` + `LastActiveMonitor` string; `SettingsService.Load()` migrates old settings.json via `JsonDocument` pre-parse probe — users keep their saved position on the primary monitor after upgrade
- Per-monitor position save/restore: drag-end upserts to destination monitor key; cross-monitor drag clears source entry before save; startup restores `MonitorPositions[LastActiveMonitor]` or centers on primary if monitor absent
- Startup clamping uses `FindScreenForKey(_currentMonitorKey)` + `SettingsService.Clamp(MonitorPosition, width, height, screen)` against the target screen's `WorkingArea` — position stays valid even after resolution changes
- Test suite extended to 78 MSTest tests: 5 new tests covering `MonitorPosition` clamp bounds, `AppSettings` init defaults for `MonitorPositions` and `LastActiveMonitor`, and the migration probe round-trip

---

## v2.7 Auto-Contrast (Shipped: 2026-03-03)

**Phases completed:** 1 phase (33), 3 plans
**Test suite:** 88 tests (74 Core + 14 App), 0 failures
**Files changed:** 21 files changed, +1981 lines

**Key accomplishments:**

- `ContrastService` (FuzzyClock.Core): pure WCAG 2.1 relative luminance + contrast ratio math, hysteresis state machine (enter override at ratio <4.5, exit at ratio >5.5), HSL accent adjustment (±5 steps up to ±40), black/white fallback — TDD with 10 new MSTest methods
- `ContrastSamplerService` (FuzzyClock.App): BitBlt screen capture from desktop DC under widget footprint, step-sampling at 200px cap per dimension, full GDI resource cleanup in try/finally
- 500ms `DispatcherTimer` in MainWindow: sample → `ContrastService.ComputeDisplayColor` → `ApplyDisplayColor`; pauses when ghost mode active or `Opacity=0`; freezes color during drag via `_isDragging` flag
- Tray "Auto-Contrast" checkable toggle: off by default, persisted to `settings.json`, restores on launch, disabled by Reset to Defaults; `AppSettings.AutoContrastEnabled` init-property (default false)
- Bug found and fixed during human verification: stats row label TextBlocks (CPU/GPU/MEM/PAG) were unnamed in XAML and missing from `ApplyDisplayColor` and `ApplyTheme`; added `x:Name` and full coverage to both methods
- Version bumped to 2.7.0; 88 tests passing (74 Core + 14 App), 0 build errors, 0 warnings

---

## v2.8 Uptime and Docs (Shipped: 2026-03-04)

**Phases completed:** 1 phase (34), 2 plans
**Files changed:** 14 files changed, +1142 lines

**Key accomplishments:**

- Verified active process count (`pct >= 5.0` CPU threshold, `{N}p` format) appended to uptime line in `UpdateUptimeDisplay()` — PROC-01 already fully implemented; 88 tests passing, 0 failures
- README updated to accurately list all 8 v2.7+ features: ghost mode, auto-contrast, tray controls, accent colors, opacity, uptime row with `142p` example, auto-launch, per-monitor position memory
- Fixed stale "right-click is the primary UI" text — correctly identifies system tray as primary settings surface (v2.4 migration)
- Expanded tray menu table with complete item list (Ghost Mode, Auto-Launch, Auto-Contrast, Reset to Defaults, Quit) previously undocumented
- Fixed cosmetic README label: "Phrase Mode / Dial Mode" → "Dial Mode" (reflects single toggle, not two-item choice)

---

## v2.9 Process Threshold (Shipped: 2026-03-05)

**Phases completed:** 1 phase (35), 1 plan, 2 tasks

**Key accomplishments:**

- `AppSettings.ProcessCountThresholdPercent` (double, default 5.0) added with `SettingsService.Validate()` guard constraining to {2.0, 5.0, 10.0} ladder
- Tray Stats submenu gains "Process Threshold" sub-submenu with three mutually-exclusive checkable items (2%/5%/10%); `SyncCheckmarks` enforces exactly one checked at all times
- `UpdateUptimeDisplay()` replaces hardcoded `pct >= 5.0` with `pct >= _processCountThreshold` — threshold is now fully user-configurable
- `SetProcessThreshold()` immediately refreshes the `{N}p` display and persists to settings.json; Reset to Defaults restores 5%
- Also fixed: `AutoContrastEnabled = false` omission in `SettingsService.Defaults()` (cosmetic; record default was already false)

---

## v3.1 Quality + Battery (Shipped: 2026-03-08)

**Phases completed:** 4 phases (37–40), 6 plans
**Test suite:** 122 tests (97 Core + 25 App), 0 failures
**Files changed:** 33 files changed, +2663 lines

**Key accomplishments:**

- Battery stat row added below PAG: `SystemInformation.PowerStatus` data source; `⚡ {pct}%` when AC-connected; `N/A` sentinel on desktops/VMs; tray Stats toggle; persisted default-enabled
- `DateFormatter` extracted from MainWindow into FuzzyClock.Core as a pure static class; `Format(string, DateTime)` with injected date for test determinism; 6 unit tests covering all 4 formats
- AppSettings JSON round-trip tests added for `ShowDate` and `DateFormat` fields with 2 absent-field isolation tests (STEST-08)
- README accuracy pass: Short/Long date format examples corrected to match actual `ddd, MMM d` / `dddd, MMMM d` output; test count updated from 114 to 122; AC indicator order corrected
- Battery AC indicator order fixed: code changed to produce `⚡ 87%` (prefix) matching user intent and README

---

## v3.2 Expanded Experience (Shipped: 2026-03-09)

**Phases completed:** 7 phases (41–47), 16 plans

**Key accomplishments:**

- PhraseEngine refactored to `IPhraseProvider` static facade with locale-keyed provider registry — unblocks phrase styles and multilingual without touching MainWindow
- 3-tab modeless Settings window (Appearance / Stats / Behavior) replaces 40-item tray menu; live-apply with no Apply button; tray pruned to 8 items
- 5 built-in named themes (Minimal, Neon, Ghost, Warm, Ocean) apply accent color, opacity, font size, clock style, and stats visibility atomically; persisted
- Battery low alert — battery row turns red when unplugged below configurable threshold (10% / 15% / 20%, default 20%)
- English phrase personalities: Terse ("half three"), Poetic ("the small hours"), Rude ("nearly four, move it") — each with TDD provider and Settings wiring
- Multilingual phrases: French, Spanish, German, Japanese, Polish auto-detected from `CultureInfo.CurrentUICulture`; English fallback for unsupported locales; 102 new provider tests
- 224 MSTest tests total (199 Core + 25 App), 0 failures

---
