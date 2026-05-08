# Phase 67: GhostModeController Extension - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 67-ghostmodecontroller-extension
**Areas discussed:** Timer lifecycle, ProximityChanged fire condition, Activating path / WS_EX_TRANSPARENT ownership, Test assembly

---

## Timer lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, always-running | Start in Initialize(), run until Dispose(). Single timer owns all ghost mode polling. | ✓ |
| Separate proximity watch timer | Add a second always-running timer, keep existing restore timer lifecycle. | |
| You decide | Leave architecture choice to planner. | |

**User's choice:** Yes, always-running

---

**Window_MouseEnter after Phase 67**

| Option | Description | Selected |
|--------|-------------|----------|
| No — timer handles entry entirely | Timer detects ratio=1.0, calls Activate() internally. Window_MouseEnter no longer triggers ghost mode. Phase 68 removes the call. | ✓ |
| Yes, keep for zero-radius fallback | Window_MouseEnter still calls Activate() when GhostFadeRadiusPx=0. Two entry points. | |
| You decide | Leave to planner. | |

**User's choice:** No — timer handles entry entirely

---

## ProximityChanged fire condition

| Option | Description | Selected |
|--------|-------------|----------|
| Only when ratio changes | Fire only when new ratio differs from last emitted. ~13 events/sec while moving, silence when stationary. | ✓ |
| Every tick while ratio > 0.0 | Fire on every 75ms tick in the fade zone, regardless of movement. | |

**User's choice:** Only when ratio changes

---

**Silence rule**

| Option | Description | Selected |
|--------|-------------|----------|
| No — stay silent | No event when cursor is stationary outside zone (ratio=0.0 steady state). | ✓ |
| Yes — fire 0.0 every tick | Always fire, even when stationary outside zone. | |

**User's choice:** No — stay silent

---

## Activating path / WS_EX_TRANSPARENT ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Controller applies internally | Timer calls Activate() at ratio=1.0. WS_EX_TRANSPARENT stays inside controller. | ✓ |
| New Activating event, MainWindow calls Activate() | Timer fires Activating event, MainWindow calls back. More indirection. | |

**User's choice:** Controller applies it internally

---

**Restore path**

| Option | Description | Selected |
|--------|-------------|----------|
| Immediately when ratio drops below 1.0 | Remove WS_EX_TRANSPARENT as soon as cursor exits widget rect. Widget becomes interactive on retreat. | ✓ |
| Only when ratio reaches 0.0 | Keep click-through until cursor fully exits proximity zone. | |

**User's choice:** Immediately when ratio drops below 1.0

---

## Test assembly

| Option | Description | Selected |
|--------|-------------|----------|
| FuzzyClock.App.Tests | Tests alongside the controller in App.Tests (net10.0-windows, UseWPF=true). No new project. | ✓ |
| FuzzyClock.Core.Tests | Extract ComputeProximityRatio to Core, test without UseWPF. Requires moving code. | |
| You decide | Let planner decide. | |

**User's choice:** FuzzyClock.App.Tests

---

## Claude's Discretion

- Internal last-ratio tracking implementation
- Whether ComputeProximityRatio is a static method on GhostModeController or a separate class
- Whether to rename _restoreTimer field

## Deferred Ideas

None.
