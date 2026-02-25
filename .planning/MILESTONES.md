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

