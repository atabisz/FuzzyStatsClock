# Feature Research

**Domain:** Desktop overlay widget — color themes and opacity control (v2.0)
**Researched:** 2026-02-27
**Confidence:** HIGH (all claims grounded in existing codebase inspection and WPF platform knowledge)

---

## Scope Note

This file supersedes the v1.2 FEATURES.md. It focuses exclusively on the two feature areas
targeted in v2.0: accent color theming (preset + custom) and widget opacity control.

The existing codebase (v1.9) is a transparent frameless always-on-top WPF window with:
- Phrase text (`PhraseText` TextBlock, `Foreground="White"`)
- Manual shadow text (`ShadowText` TextBlock, `Foreground="#BB000000"` — always dark)
- Analog dial (`HourHand`, `MinuteHand` Lines, `Stroke="White"`)
- Dial decorations (hour ticks as `Line` elements, minute dots as `Ellipse`, hour numbers
  as `TextBlock`) — all created in code-behind with `Brushes.White` / `Brushes.White` fill
- Stats bars (`CpuBar`, `GpuBar`, `MemBar`, `PagBar` Borders, `Background="White"`)
- Stats bar tracks (`CpuBarTrack` etc., `Background="#40FFFFFF"` — semi-transparent white track)
- Stats labels and percentage text (all `Foreground="White"`)
- `Window.Opacity` is currently at default (1.0 = fully opaque); no opacity control exists yet
- Settings persisted to `%LOCALAPPDATA%\FuzzyClock\settings.json` via `AppSettings` record

The "accent color" concept means a single color that simultaneously controls all of the above
white elements. The dark shadow text (`#BB000000`) is not accent-colored — it always stays dark
for legibility as a shadow.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that feel like obvious minimum requirements for any color/theme feature in a desktop
widget. Absence of any of these registers as incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Preset color list in right-click menu | Theme selection via submenu is the standard widget pattern; no separate window required | LOW | New "Theme" submenu with named `MenuItem` entries; radio-checked style matching existing font size and update interval patterns |
| Named presets (not hex strings) | Users relate to color names, not hex values; "Amber" is instantly understood | LOW | Fixed string labels in menu headers; the underlying color value is a constant in code |
| Active preset shown as checked | All existing multi-choice menus (font size, update interval) use `IsCheckable` + `ContextMenu_Opened` sync; users will expect the same | LOW | Same `ContextMenu_Opened` pattern already established in the codebase |
| One accent color applies everywhere | Users have zero tolerance for some elements being the old color and others the new; inconsistency reads as a bug | MEDIUM | Seven distinct code-behind assignments required: `PhraseText.Foreground`, `HourHand.Stroke`, `MinuteHand.Stroke`, all tick/dot/number element brushes in `_hourTickElements`/`_minuteDotElements`/`_hourNumberElements`, all four stat bar `Background`, all four stat label + percentage `TextBlock.Foreground`, bar track `Background` (semi-transparent version of accent); must apply via a single `ApplyAccentColor(Color c)` helper |
| Theme persists across restarts | All other preferences (font size, stats, dial mode) persist; users will expect theme to persist too | LOW | Add `AccentColor` field to `AppSettings` record; serialize as hex string or ARGB int; deserialize on load |
| Custom color picker option | "Custom..." entry at bottom of preset list is the universal pattern for named-presets-plus-custom | MEDIUM | No WPF built-in color picker dialog exists; use `System.Windows.Forms.ColorDialog` via WinForms interop (in-box .NET, no NuGet required); custom color also persists |
| Opacity presets in right-click menu | Opacity via right-click is the expected pattern for widgets; scroll-wheel is supplemental | LOW | New "Opacity" submenu with 25%/50%/75%/100% entries; same radio-checked pattern |
| Opacity persists across restarts | Same reasoning as theme; all preferences persist | LOW | Add `Opacity` (double, 0.25–1.0) field to `AppSettings` record |

### Expected Behavioral Details

These behaviors are so obvious to users of desktop widgets that they will not articulate them
as features, but will immediately notice if they are wrong.

| Behavior | Why Expected | Notes |
|----------|--------------|-------|
| Color change is instant (no animation, no lag) | Every other right-click action (font size, dial mode, stats toggle) is immediate | Set all foreground/background brushes synchronously in the click handler; no animation |
| Opacity change is instant | Same expectation | `this.Opacity = value;` is synchronous |
| Preset checkmarks are mutually exclusive | Only one preset can be active; checking a new one unchecks the old | Code enforces exclusion; `ContextMenu_Opened` sets exactly one `IsChecked = true` |
| Custom color is treated as the active choice when set | After using the color picker, the "Custom..." item appears checked and all presets are unchecked | Track active theme as an enum or nullable preset ID; "custom" is a valid state |
| Scroll wheel on the widget adjusts opacity | Desktop widget convention; HWiNFO, Rainmeter, and similar tools use scroll wheel for opacity | `Window.MouseWheel` handler; increment/decrement by 0.10; clamp to [0.10, 1.0] (never fully invisible) |
| Scroll wheel opacity change persists | User scrolled to a comfortable opacity; it should stay on restart | Call `SaveSettings()` in the scroll handler |
| Bar track color is a semi-transparent tint of the accent | The track (`#40FFFFFF` in current code) is visually the "unfilled" portion of the bar; it should tint in the accent color, not stay white | Compute as `Color.FromArgb(0x40, accent.R, accent.G, accent.B)` |
| Shadow text does NOT change color | Shadow text is `#BB000000` (dark) for legibility against light backgrounds; recoloring it to the accent would break the shadow effect | Shadow is always dark; never accent-colored |

### The Five Required Presets

These are the five presets specified in PROJECT.md. Each requires a fixed accent `Color` value.

| Preset Name | Suggested Color | Hex | Why This Value |
|-------------|-----------------|-----|----------------|
| White | Full white | `#FFFFFFFF` | Current default; must be included so users can revert |
| Amber | Warm amber | `#FFFFBF00` | Classic amber LED color; reads well on dark backgrounds |
| Ice Blue | Cyan-leaning blue | `#FF00BFFF` | Deep sky blue; popular for tech/minimal widget themes |
| Green | Phosphor green | `#FF00FF41` | Classic terminal green; reads on dark and light backdrops |
| Hello Kitty Pink | Bright warm pink | `#FFFF69B4` | Hot pink; distinctive; matches the name's intent |

Note: exact color values are design decisions. The above are strong starting candidates.
The implementation should define these as `static readonly Color` constants, not magic strings.

---

## Differentiators (Nice to Have, Not Required for v2.0)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Color preview on hover in menu | Showing the color visually beside the preset name | MEDIUM | Requires custom `MenuItem` template with a small color swatch rectangle; out of scope for v2.0 |
| Opacity display while scrolling (e.g., brief OSD overlay) | Shows current % value while user scrolls | MEDIUM | Requires a temporary tooltip-like element; wheel events fire rapidly, so a fade-out timer is needed; out of scope |
| Per-element color overrides (e.g., different color for stats vs. dial) | More granular control | HIGH | Multiplies menu surface area and settings complexity; contradicts the "one accent color" design; out of scope |
| Gradient or multi-stop accent | Richer visual; used by some widgets | HIGH | Replaces `SolidColorBrush` with `LinearGradientBrush` across all elements; architectural change; out of scope |
| Dark/light mode variants per preset | Presets adapt to system theme | HIGH | Requires theme-detection (`SystemParameters.HighContrast`, registry query for dark mode); out of scope |
| Smooth opacity animation (easing on scroll) | Polished feel | MEDIUM | `DoubleAnimation` on `Window.Opacity`; not necessary for a widget; out of scope |

---

## Anti-Features (Scope Creep Risks)

Features that seem like natural extensions of color/opacity control but would break the
widget's design philosophy of "no settings screens, no complexity."

| Anti-Feature | Why It Gets Requested | Why to Refuse | What to Do Instead |
|--------------|----------------------|---------------|-------------------|
| Full settings screen for color/opacity | "A settings window would be cleaner than submenus" | The widget has no settings screens by design; adding one means a second window, window lifecycle management, and a UI surface to maintain; this is the hardest rule in the project constraints | Keep everything in the right-click context menu, as with all prior settings |
| Separate color per element (phrase vs. dial vs. stats) | "I want my stats bars to be green but phrase to be white" | Triples the menu surface area; creates inconsistent visual; the "one accent color" model is a feature, not a limitation | Explain the design: one accent color is a deliberate aesthetic choice |
| Opacity per-element (e.g., transparent stats, opaque phrase) | "Just make the stats more transparent" | WPF `Window.Opacity` applies to the whole window; per-element transparency would require `UIElement.Opacity` or alpha channels in brushes for each element individually; complexity explosion | The whole-window opacity model is the correct abstraction; individual transparency is achievable via the bar track alpha (`#40XX...`) already in place |
| Live color preview in color picker | "Show me what it looks like as I drag the picker" | `ColorDialog` (WinForms) does not fire change events during drag; live preview requires a custom WPF color picker control (third-party or from scratch); significant complexity | Apply color only on dialog OK; users see it instantly after confirmation |
| System color theme sync (auto-follow Windows accent color) | "Use my Windows accent color automatically" | `SystemParameters.WindowGlassColor` or registry-based accent color is available but changes dynamically; subscribing to system theme changes adds event plumbing and may conflict with the user's explicit widget theme choice | Let users explicitly choose; add this as a v3+ consideration only |
| Opacity below 10% | "I want the widget to be nearly invisible" | Below ~10% the widget is functionally invisible and drag/interaction becomes unreliable (hit-test area is still full size but nothing is visible); confusing | Clamp minimum to 10% (0.10); document this as intentional |
| Color import/export | "Share my theme with friends" | The `AccentColor` hex is already human-readable in `settings.json`; power users can copy the JSON directly | Do nothing; the settings file is already the export mechanism |
| "Reset to default" menu item for theme | "Quick way to go back to white" | White is already the first preset in the menu; selecting it is one click | Include White as the first preset; no reset item needed |

---

## Feature Dependencies

```
[Accent Color — Preset Selection]
    └──requires──> [Theme submenu in ContextMenu] (new MenuItem with 5 named sub-items + separator + Custom)
    └──requires──> [ApplyAccentColor(Color) helper] (new; applies accent to all 20+ colored elements)
    └──requires──> [_accentColor field (Color)] (new field in MainWindow)
    └──persists-to──> [AppSettings.AccentColor (string or int)] (new field; hex string recommended)
    └──conflicts-with──> [hardcoded Brushes.White assignments throughout] (must be replaced)

[Accent Color — Custom Picker]
    └──requires──> [Preset Selection infrastructure] (same ApplyAccentColor helper; custom is just a non-preset Color)
    └──requires──> [System.Windows.Forms.ColorDialog] (WinForms interop; in-box .NET, no NuGet)
    └──requires──> [System.Windows.Forms reference in .csproj] (add <UseWindowsForms>true</UseWindowsForms>)
    └──soft-depends-on──> [Preset Selection] (custom color lives in the same submenu as presets)

[ApplyAccentColor(Color)]
    └──must-update──> [PhraseText.Foreground] (already in XAML as "White")
    └──must-update──> [HourHand.Stroke] (already in XAML as "White")
    └──must-update──> [MinuteHand.Stroke] (already in XAML as "White")
    └──must-update──> [_hourTickElements Line.Stroke] (created in code-behind with Brushes.White)
    └──must-update──> [_minuteDotElements Ellipse.Fill] (created in code-behind with Brushes.White)
    └──must-update──> [_hourNumberElements TextBlock.Foreground] (created in code-behind with Brushes.White)
    └──must-update──> [CpuBar/GpuBar/MemBar/PagBar.Background] (XAML "White")
    └──must-update──> [CpuText/GpuText/MemText/PagText.Foreground] (XAML "White")
    └──must-update──> [CPU/GPU/MEM/PAG label TextBlocks.Foreground] (XAML "White")
    └──must-update──> [CpuBarTrack/GpuBarTrack/MemBarTrack/PagBarTrack.Background] (semi-transparent accent)
    └──must-NOT-update──> [ShadowText.Foreground] (stays #BB000000 always)
    └──must-NOT-update──> [ContentBorder.Background] (hover backdrop; stays #59000000 / Transparent)

[Widget Opacity — Preset Selection]
    └──requires──> [Opacity submenu in ContextMenu] (new MenuItem with 25/50/75/100% sub-items)
    └──requires──> [_opacity field (double, default 1.0)] (new field in MainWindow)
    └──requires──> [this.Opacity = value] (Window.Opacity property; built-in WPF)
    └──persists-to──> [AppSettings.Opacity (double)] (new field, default 1.0)

[Widget Opacity — Scroll Wheel]
    └──requires──> [Opacity preset infrastructure] (same field + same this.Opacity assignment)
    └──requires──> [Window.MouseWheel event handler] (new; increment ±0.10, clamp [0.10, 1.0])
    └──soft-depends-on──> [Opacity presets] (shares the same _opacity field and SaveSettings call)

[AppSettings extension]
    └──new fields──> [AccentColor: string (hex, e.g. "#FFFFFFFF"), Opacity: double (default 1.0)]
    └──backward-compatible──> [init-property record pattern already in use; missing fields JSON-default safely]
    └──requires──> [AccentColor guard in Load()] (if null/empty → default to White)

[Theme submenu menu item visibility]
    └──no-mode-dependency──> [Theme applies in both phrase mode and dial mode; submenu always visible]
    └──contrast──> [Font Size submenu hidden in dial mode (MENU-01); Theme submenu is not mode-conditional]
```

### Dependency Notes

- **ApplyAccentColor is the centerpiece.** Every visual element that is currently `White` or
  `Brushes.White` must be updated through this single function. If any element is missed, users
  will see an inconsistency. A thorough audit of XAML and code-behind is required before
  implementation starts to enumerate all assignment sites.

- **Bar track color is derived, not independent.** The track (`#40FFFFFF`) is 25%-alpha white.
  When the accent changes, the track should become 25%-alpha of the accent color:
  `Color.FromArgb(0x40, accent.R, accent.G, accent.B)`. This maintains the visual relationship
  between the filled bar and its container.

- **Decorations are in code-behind.** Hour ticks, minute dots, and hour numbers are created in
  `InitDialDecorations()` with `Brushes.White`. These elements are stored in `_hourTickElements`,
  `_minuteDotElements`, and `_hourNumberElements` lists. `ApplyAccentColor` must iterate all
  three lists and update `Stroke`/`Fill`/`Foreground` on each element.

- **WinForms ColorDialog requires `<UseWindowsForms>true</UseWindowsForms>` in the `.csproj`.**
  No NuGet package is needed. This is the standard WPF + WinForms interop pattern for a color
  picker dialog. The dialog is modal; result is checked with `dialog.ShowDialog() == DialogResult.OK`.

- **Window.Opacity vs UIElement.Opacity.** Using `this.Opacity` (the `Window` property) applies
  uniform transparency to the entire window including all children. This is the correct model for
  "widget opacity." It also affects the hover backdrop — at 25% window opacity, the backdrop will
  appear more transparent than intended, but this is acceptable; the opacity is user-chosen and
  the backdrop is a subtle affordance, not a critical UI element.

- **Scroll wheel minimum.** Clamping opacity to 0.10 (not 0.0) prevents the widget from becoming
  fully invisible and unrecoverable via mouse interaction. The user would need to edit
  `settings.json` directly to recover from opacity=0.

- **No mode-conditional visibility for Theme or Opacity submenus.** Unlike Font Size (hidden in
  dial mode, MENU-01) and Dial Face (hidden in phrase mode, DIAL-09), Theme and Opacity apply
  in both modes. They must remain visible in `ContextMenu_Opened` regardless of `_dialMode`.

---

## MVP Definition for v2.0

### Ship with v2.0

- [ ] **THEME-01** — User can select from 5 named preset color themes (White, Amber, Ice Blue, Green, Hello Kitty Pink) via right-click "Theme" submenu; active preset shown as checked
- [ ] **THEME-02** — User can set a custom accent color via "Custom..." entry in the Theme submenu, using a color picker dialog
- [ ] **THEME-03** — Active accent color applies immediately and consistently to: phrase text, dial hands, dial decorations (ticks/dots/numbers), all stats bars and bar tracks (semi-transparent tint), all stats label and percentage text
- [ ] **THEME-04** — Theme selection (preset name or custom hex color) persists to `settings.json` and restores on launch
- [ ] **OPAC-01** — User can set widget opacity to 25%/50%/75%/100% via right-click "Opacity" submenu; active value shown as checked
- [ ] **OPAC-02** — User can adjust opacity using mouse scroll wheel in 10% increments; minimum opacity is 10%
- [ ] **OPAC-03** — Opacity applies to the entire window (`Window.Opacity`)
- [ ] **OPAC-04** — Opacity setting persists to `settings.json` and restores on launch

### Explicitly Not in v2.0

- Per-element color overrides
- Live preview while dragging the color picker
- System accent color sync
- Opacity animation/easing
- Settings screen / second window
- Opacity below 10%
- Per-element opacity

---

## Complexity Assessment

| Component | Complexity | Reason |
|-----------|------------|--------|
| Theme submenu in context menu | LOW | Follows existing radio-checked pattern (font size, update interval) exactly |
| `ApplyAccentColor(Color)` helper | LOW–MEDIUM | Straightforward property assignments; medium complexity only because of the element count (20+ sites) and the need to enumerate three decoration lists |
| Preset color constants | LOW | Five `static readonly Color` definitions; no logic |
| Custom color picker (ColorDialog) | LOW | Three lines of WinForms interop code; one `.csproj` flag change; no NuGet |
| Bar track semi-transparent tint | LOW | `Color.FromArgb(0x40, r, g, b)` derived from accent; no user-facing logic |
| AppSettings extension (AccentColor + Opacity) | LOW | Two new `init` fields; init-property record already handles JSON-default for missing fields |
| Opacity submenu | LOW | Same radio-checked pattern as theme and font size |
| Scroll wheel handler | LOW | `Window.MouseWheel` += handler; arithmetic clamp; call `SaveSettings()` |
| ApplySettings() extension | LOW | Call `ApplyAccentColor()` and set `this.Opacity` before `Show()`; same pre-Show() safety invariant already established |

---

## Sources

- Existing codebase: `C:/src/FuzzyStatsClock/FuzzyClock.App/MainWindow.xaml` and `MainWindow.xaml.cs` (HIGH confidence — first-party, inspected 2026-02-27)
- Existing codebase: `C:/src/FuzzyStatsClock/FuzzyClock.App/AppSettings.cs` (HIGH confidence — first-party, inspected 2026-02-27)
- WPF `Window.Opacity` property: https://learn.microsoft.com/en-us/dotnet/api/system.windows.window (HIGH confidence — official docs)
- WPF `UIElement.MouseWheel` event: https://learn.microsoft.com/en-us/dotnet/api/system.windows.uielement.mousewheel (HIGH confidence — official docs)
- WinForms `ColorDialog`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.colordialog (HIGH confidence — official docs; WPF+WinForms interop via `<UseWindowsForms>true</UseWindowsForms>`)
- `Color.FromArgb`: https://learn.microsoft.com/en-us/dotnet/api/system.windows.media.color.fromargb (HIGH confidence — official WPF Color struct docs)
- PROJECT.md v2.0 milestone context (HIGH confidence — first-party, inspected 2026-02-27)

---

*Feature research for: Fuzzy Clock v2.0 — color themes and opacity control*
*Researched: 2026-02-27*
