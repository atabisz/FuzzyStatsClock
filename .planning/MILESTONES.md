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

