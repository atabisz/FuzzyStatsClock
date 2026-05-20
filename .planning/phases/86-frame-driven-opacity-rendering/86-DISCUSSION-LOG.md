# Phase 86: Frame-driven opacity rendering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 86-frame-driven-opacity-rendering
**Areas discussed:** Fade speed / feel, Subscribe/unsubscribe wiring, LerpRatio helper home, Idle-frame behavior

---

## Fade speed / feel

| Option | Description | Selected |
|--------|-------------|----------|
| Smooth ~150 ms | alpha ≈ 15; ratio reaches 90% of target in ~150 ms. Clearly visible glide masks frame-rate variation under CPU load. Standard UI fade-in/out feel. | ✓ |
| Snappy ~75 ms | alpha ≈ 30; ratio reaches 90% in ~75 ms. Almost instant — the per-frame pump barely glides. May not visibly demonstrate the 'smooth under load' milestone goal. | |
| Cinematic ~300 ms | alpha ≈ 8; ratio reaches 90% in ~300 ms. Very visible glide, risks feeling laggy when cursor crosses the zone fast. | |
| Pick during play-testing | Lock the lerp formula shape but defer the alpha constant until manual play-testing on Phase 87. | |

**User's choice:** Smooth ~150 ms
**Notes:** Locks `alpha = 15.0` constant in code (no settings tunable — REQUIREMENTS.md explicit YAGNI). Time-stable exponential lerp shape: `current + (target - current) * (1 - Math.Exp(-alpha * deltaSeconds))`. Terminal-state snap on `0.0`/`1.0` keeps ghost activation crisp regardless of feel constant.

---

## Subscribe/unsubscribe wiring

| Option | Description | Selected |
|--------|-------------|----------|
| EnabledChanged event raised inside the IsEnabled setter | Add `event Action<bool>? EnabledChanged` on GhostModeController; setter raises on actual change. MainWindow subscribes once. Future writers can't forget — property self-announces. | ✓ |
| EnabledChanged event raised by callers | Same event but each writer also raises it. More boilerplate; one missed call site silently breaks the pump. | |
| Touch each of the 3 IsEnabled call sites | No new event. Each writer also calls AttachRenderPump/DetachRenderPump directly. No compiler help — a future 4th writer breaks the pump silently. | |

**User's choice:** EnabledChanged event raised inside the IsEnabled setter
**Notes:** Setter compares old vs new before raising, so the no-change path is allocation-free and idempotent. Three current writers (tray toggle line 189, ApplySettings line 316, Settings dialog line 480) all already on UI thread — no `BeginInvoke` needed inside the setter. Belt-and-braces synchronous attach in `ContentRendered` covers the "default value already matches" no-event case at startup.

---

## LerpRatio helper home

| Option | Description | Selected |
|--------|-------------|----------|
| Static internal on GhostModeController | Sits next to ComputeProximityRatio. Same precedent from Phase 85. Same InternalsVisibleTo plumbing exposes it. Zero new files. | ✓ |
| New static class in FuzzyClock.App | Dedicated home (e.g. RatioLerp.cs). Cleaner separation, but new file. | |
| FuzzyClock.Core | Cross-project home, no WPF/App refs. Most architecturally pure but introduces ghost-fade vocabulary into Core for the first time — overkill for one helper. | |

**User's choice:** Static internal on GhostModeController
**Notes:** Helper is consumed by MainWindow not the controller, but it's pure-static so the home is a namespace anchor only. Phase 85 set the precedent with `internal SampleResult` and `internal enum GhostTransition` on the same controller. Phase 87 unit tests reach it via the existing `InternalsVisibleTo("FuzzyClock.App.Tests")` directive — no project changes.

---

## Idle-frame behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Stay subscribed, early-return on convergence | Subscribe on ghost-enabled, unsubscribe on ghost-disabled. Handler early-returns when `current == target`. Matches FADE-04 wording exactly. Two lifecycle transitions only. | ✓ |
| Edge-driven attach/detach on convergence | Attach when target diverges, detach when re-converged. Zero per-frame cost at steady state, but four lifecycle transitions and higher subscription-leak risk. | |

**User's choice:** Stay subscribed, early-return on convergence
**Notes:** FADE-04 wording explicitly frames the lifecycle as gated by IsEnabled. Per-frame cost at steady state is one method call + one comparison + return — trivial. Exact-equality compare on `double` is safe because the only path to convergence is the terminal-state snap, which writes the exact target value (`0.0` or `1.0`). The exponential lerp itself never reaches exact convergence; the snap closes the loop.

---

## Claude's Discretion

- Exact spelling of the render handler (`OnRenderingTick` vs `OnCompositionRender` vs `LerpPump`).
- Whether `_renderPumpAttached` is a separate `bool` or inferred by null-checking a captured handler delegate.
- Exact location of the `alpha = 15.0` constant (recommended: `private const double LerpAlpha = 15.0;` near the field block in MainWindow so the JIT inlines it).
- Whether to clamp `deltaSeconds` to `[0.0, 0.1]` defensively against clock changes / VM time-warp (recommended: yes — one `Math.Clamp` call per frame is free).

## Deferred Ideas

- User-facing fade-speed tunable — REQUIREMENTS.md "Future Requirements" explicit YAGNI.
- Frame-rate-insensitive linear lerp ("step toward target by step * deltaSeconds") — exponential gives softer feel, matches every animation framework default.
- Coalescing `ProximityChanged` events between frames — premature; UI thread no longer samples (Phase 85), `_targetRatio = ratio` is a single field write. Revisit only if Phase 87 perf testing shows dispatcher saturation.
- Mid-range epsilon snap (e.g. `Math.Abs(current - target) < 0.001` → snap) — not needed; only `0.0` and `1.0` convergence matters for activation/restore semantics.
- Replacing `CompositionTarget.Rendering` with a frame-rate `DispatcherTimer` — defeats the entire point of Phase 86.
