# Milestones

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

