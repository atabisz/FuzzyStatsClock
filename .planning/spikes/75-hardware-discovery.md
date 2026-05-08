# Phase 75 Hardware Discovery Spike

**Date:** 2026-05-04
**Operator:** solo dev
**Methodology substitution:** per CONTEXT.md D-04, this spike substitutes a dev box without PawnIO for a fresh Win11 24H2 VM. The dev box was found to be a clean PawnIO-free baseline out of the gate — no uninstall was required. Justification: research establishes PawnIO absence is the sole relevant axis for clean-VM emulation; the precondition is satisfied regardless of how the machine arrived there.

## 1. Environment

- OS: Windows 11 Enterprise 10.0.26200 (win32)
- CPU: 12th Gen Intel Core i9-12900H (LHM Id `/intelcpu/0`)
- Discrete GPU: NVIDIA RTX A2000 8GB Laptop GPU (LHM Id `/gpu-nvidia/0`)
- Integrated GPU: Intel(R) UHD Graphics (LHM HardwareType `GpuIntel`)
- Motherboard: HP 89C0 (HP laptop OEM board; LHM Id `/motherboard`)
- NVMe: **NOT ENUMERATED** — see Section 4
- LibreHardwareMonitorLib: 0.9.6 (pinned exact version)
- PawnIO version at pre-uninstall: **N/A — not installed at spike start**
- PawnIO version at restore: **N/A — no restore cycle performed**
- Enumeration timestamp: 2026-05-04T16:37:20 (UTC)
- Uninstall timestamp: **N/A — uninstall step was a no-op because PawnIO was absent at Step 1 (see Section 2)**
- Restore timestamp: **N/A — skipped because no uninstall occurred**

## 2. Methodology

Variance from the plan: the dev box was already a PawnIO-free baseline when Step 1 of Task 2 ran. The pre-uninstall registry scan (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`) returned no PawnIO entries; `sc.exe query pawnio` returned the canonical `[SC] EnumQueryServicesStatus:OpenService FAILED 1060: The specified service does not exist as an installed service.` This is captured verbatim in `scratch/pawnio-service-before.txt` at measurement time. Under D-04, the methodology cares only that PawnIO is absent at measurement time — not whether an uninstall cycle occurred — so the measurement proceeded directly without the uninstall/reboot/restore procedure. This is an intentional, documented variance; the invariant "dev box emulates a clean Win11 24H2 VM by having no PawnIO installed" is satisfied.

Procedure actually run:

1. Verified PawnIO absent: registry scan (empty) + `sc.exe query pawnio` (FAILED 1060).
2. Ran the throwaway enumerator (`scratch/Enumerator/`, LHM 0.9.6 via NuGet, `dotnet run -c Release`) against this clean state with all four `IsXxxEnabled` flags (`IsCpuEnabled`, `IsGpuEnabled`, `IsMotherboardEnabled`, `IsStorageEnabled`) set to true and every other flag at default false — matches the service runtime posture.
3. Captured `Computer.Open()` wall time, walked the full hardware tree, logged one priming `Update()` call, walked the tree again to capture post-prime sensor Values, then executed 20 `computer.Accept(new UpdateVisitor())` calls at ~2s spacing.
4. Recorded per-iteration elapsed ms and reported mean/min/max.
5. `Computer.Close()` before exit.
6. No restore phase was needed because no uninstall occurred. The dev box state post-spike is identical to pre-spike.

## 3. Full Sensor Tree (raw)

Verbatim from `scratch/enumerator-output.txt` (reencoded UTF-16LE → UTF-8 for readability; content is byte-identical).

```
=== Computer.Open() took 4272 ms

=== Full Sensor Tree (initial walk) ===
[Motherboard] HP 89C0  (Id=/motherboard)
[Cpu] 12th Gen Intel Core i9-12900H  (Id=/intelcpu/0)
  - Load         Name="CPU Core #1 Thread #1" Value=50
  - Load         Name="CPU Core #1 Thread #2" Value=0
  - Load         Name="CPU Core #2 Thread #1" Value=0
  - Load         Name="CPU Core #2 Thread #2" Value=0
  - Load         Name="CPU Core #3 Thread #1" Value=0
  - Load         Name="CPU Core #3 Thread #2" Value=0
  - Load         Name="CPU Core #4 Thread #1" Value=0
  - Load         Name="CPU Core #4 Thread #2" Value=0
  - Load         Name="CPU Core #5 Thread #1" Value=0
  - Load         Name="CPU Core #5 Thread #2" Value=0
  - Load         Name="CPU Core #6 Thread #1" Value=100
  - Load         Name="CPU Core #6 Thread #2" Value=0
  - Load         Name="CPU Core #7" Value=50
  - Load         Name="CPU Core #8" Value=50
  - Load         Name="CPU Core #9" Value=0
  - Load         Name="CPU Core #10" Value=0
  - Load         Name="CPU Core #11" Value=0
  - Load         Name="CPU Core #12" Value=0
  - Load         Name="CPU Core #13" Value=0
  - Load         Name="CPU Core #14" Value=0
  - Load         Name="CPU Total" Value=12.5
  - Load         Name="CPU Core Max" Value=100
  - Temperature  Name="Core Max" Value=null
  - Temperature  Name="Core Average" Value=null
  - Temperature  Name="P-Core #1" Value=null
  - Temperature  Name="P-Core #2" Value=null
  - Temperature  Name="P-Core #3" Value=null
  - Temperature  Name="P-Core #4" Value=null
  - Temperature  Name="P-Core #5" Value=null
  - Temperature  Name="P-Core #6" Value=null
  - Temperature  Name="E-Core #1" Value=null
  - Temperature  Name="E-Core #2" Value=null
  - Temperature  Name="E-Core #3" Value=null
  - Temperature  Name="E-Core #4" Value=null
  - Temperature  Name="E-Core #5" Value=null
  - Temperature  Name="E-Core #6" Value=null
  - Temperature  Name="E-Core #7" Value=null
  - Temperature  Name="E-Core #8" Value=null
  - Temperature  Name="CPU Package" Value=null
  - Temperature  Name="P-Core #1 Distance to TjMax" Value=null
  - Temperature  Name="P-Core #2 Distance to TjMax" Value=null
  - Temperature  Name="P-Core #3 Distance to TjMax" Value=null
  - Temperature  Name="P-Core #4 Distance to TjMax" Value=null
  - Temperature  Name="P-Core #5 Distance to TjMax" Value=null
  - Temperature  Name="P-Core #6 Distance to TjMax" Value=null
  - Temperature  Name="E-Core #1 Distance to TjMax" Value=null
  - Temperature  Name="E-Core #2 Distance to TjMax" Value=null
  - Temperature  Name="E-Core #3 Distance to TjMax" Value=null
  - Temperature  Name="E-Core #4 Distance to TjMax" Value=null
  - Temperature  Name="E-Core #5 Distance to TjMax" Value=null
  - Temperature  Name="E-Core #6 Distance to TjMax" Value=null
  - Temperature  Name="E-Core #7 Distance to TjMax" Value=null
  - Temperature  Name="E-Core #8 Distance to TjMax" Value=null
  - Clock        Name="P-Core #1" Value=null
  - Clock        Name="P-Core #2" Value=null
  - Clock        Name="P-Core #3" Value=null
  - Clock        Name="P-Core #4" Value=null
  - Clock        Name="P-Core #5" Value=null
  - Clock        Name="P-Core #6" Value=null
  - Clock        Name="E-Core #1" Value=null
  - Clock        Name="E-Core #2" Value=null
  - Clock        Name="E-Core #3" Value=null
  - Clock        Name="E-Core #4" Value=null
  - Clock        Name="E-Core #5" Value=null
  - Clock        Name="E-Core #6" Value=null
  - Clock        Name="E-Core #7" Value=null
  - Clock        Name="E-Core #8" Value=null
  - Power        Name="CPU Package" Value=null
  - Power        Name="CPU Cores" Value=null
  - Power        Name="CPU Memory" Value=null
  - Power        Name="CPU Platform" Value=null
[GpuNvidia] NVIDIA RTX A2000 8GB Laptop GPU  (Id=/gpu-nvidia/0)
  - Temperature  Name="GPU Core" Value=51
  - Clock        Name="GPU Core" Value=1335
  - Clock        Name="GPU Memory" Value=5469.992
  - Load         Name="GPU Core" Value=0
  - Load         Name="GPU Memory Controller" Value=0
  - Load         Name="GPU Video Engine" Value=0
  - Load         Name="GPU Bus" Value=0
  - Voltage      Name="GPU Core Voltage" Value=0.74375
  - SmallData    Name="D3D Dedicated Memory Used" Value=4.0625
  - SmallData    Name="D3D Shared Memory Used" Value=0.25
  - Load         Name="D3D 3D" Value=0
  - Load         Name="D3D Video Decode" Value=0
  - Load         Name="D3D Video Decode" Value=0
  - Load         Name="D3D Copy" Value=0
  - Load         Name="D3D Copy" Value=0
  - Load         Name="D3D Security" Value=0
  - Load         Name="D3D Video Encode" Value=0
  - Load         Name="D3D Optical Flow Accelerator 0" Value=0
  - Load         Name="D3D VR" Value=0
  - Load         Name="D3D Copy" Value=0
  - Load         Name="D3D Copy" Value=0
  - Load         Name="D3D Copy" Value=0
  - Load         Name="D3D Copy" Value=0
  - Temperature  Name="GPU Hot Spot" Value=61.1875
  - SmallData    Name="GPU Memory Total" Value=8192
  - SmallData    Name="GPU Memory Free" Value=8044
  - SmallData    Name="GPU Memory Used" Value=148
  - Load         Name="GPU Memory" Value=1.8066406
  - Power        Name="GPU Package" Value=8.753
  - Throughput   Name="GPU PCIe Rx" Value=0
  - Throughput   Name="GPU PCIe Tx" Value=149504
[GpuIntel] Intel(R) UHD Graphics  (Id=/gpu-intel-integrated/...)
  - Clock        Name="GPU Core" Value=null
  - Voltage      Name="GPU Core" Value=null
  - Power        Name="GPU Power" Value=null

=== Priming Update() (cold call, result discarded) ===
Cold Update() took 117 ms

=== Full Sensor Tree (post-prime, with values) ===
[Motherboard] HP 89C0  (Id=/motherboard)
[Cpu] 12th Gen Intel Core i9-12900H  (Id=/intelcpu/0)
  - ... (CPU Load sensors populated: CPU Total=22.39, CPU Core Max=83.48)
  - ... (all 22 Temperature sensors: Value=null — every one of "Core Max", "Core Average", "P-Core #1-6", "E-Core #1-8", "CPU Package", 14 "Distance to TjMax" entries)
  - ... (Clock sensors all null)
  - Power        Name="CPU Package" Value=0
  - Power        Name="CPU Cores" Value=0
  - Power        Name="CPU Memory" Value=0
  - Power        Name="CPU Platform" Value=0
[GpuNvidia] NVIDIA RTX A2000 8GB Laptop GPU  (Id=/gpu-nvidia/0)
  - Temperature  Name="GPU Core" Value=51
  - Temperature  Name="GPU Hot Spot" Value=61.5625
  - Power        Name="GPU Package" Value=9.351
  - ... (full NVIDIA sensor set continues as above; GPU temps readable)
[GpuIntel] Intel(R) UHD Graphics  (Id=/gpu-intel-integrated/...)
  - Clock        Name="GPU Core" Value=100
  - Voltage      Name="GPU Core" Value=0.277
  - Power        Name="GPU Power" Value=0
  - ... (Intel UHD has Clock/Voltage/Power/Load/SmallData sensors — NO Temperature sensor)

=== Steady-state Update() timing (20 iterations @ ~2s spacing) ===
  iter  1: 78 ms
  iter  2: 670 ms
  iter  3: 658 ms
  iter  4: 627 ms
  iter  5: 629 ms
  iter  6: 671 ms
  iter  7: 625 ms
  iter  8: 630 ms
  iter  9: 631 ms
  iter 10: 624 ms
  iter 11: 627 ms
  iter 12: 623 ms
  iter 13: 625 ms
  iter 14: 639 ms
  iter 15: 635 ms
  iter 16: 623 ms
  iter 17: 640 ms
  iter 18: 643 ms
  iter 19: 622 ms
  iter 20: 644 ms

=== Update() mean=608.2 min=78 max=671 ms
```

**Observations on the raw tree:**

- `HardwareType.Motherboard` (HP 89C0) enumerated with **zero sensors** — empty Sensors collection. No SubHardware. This confirms PawnIO-gating for Super-I/O SIO chips on this OEM board per PITFALLS.md; without PawnIO no motherboard temperature sensor is exposed.
- `HardwareType.Cpu` (i9-12900H) enumerated with **22 Temperature sensors**, every one of them reporting `Value=null` both pre- and post-prime. This is the expected no-PawnIO posture for modern Intel CPUs — MSR reads (Core Max, Core Average, P/E-core counters, CPU Package) all fail without the PawnIO driver, so LHM surfaces the sensor metadata but cannot populate values.
- `HardwareType.GpuNvidia` (RTX A2000) enumerated with **two readable Temperature sensors**: `"GPU Core" = 51` and `"GPU Hot Spot" = 61.5625` (values in °C, consistent across initial + post-prime walks). NVIDIA NVAPI path is PawnIO-independent.
- `HardwareType.GpuIntel` (UHD Graphics) enumerated with **zero Temperature sensors** — only Clock/Voltage/Power/Load/SmallData. Intel iGPU temps require PawnIO on this board.
- **`HardwareType.Storage` is entirely absent from the hardware tree.** `IsStorageEnabled = true` was set, `Computer.Open()` completed without error, but no top-level Storage IHardware entry was enumerated. There is therefore nothing to walk for NVMe SMART. See Section 4 note.

## 4. Per-Kind Resolution Table

| Sensor | LHM HardwareType | Resolved via (Name) | Value seen | Status |
|--------|------------------|---------------------|------------|--------|
| CPU    | Cpu              | priority list matched "CPU Package" (22 Temperature sensors present); post-prime Value=null on every Temperature sensor | null | N/A (Temperature metadata exists, Value never populates — PawnIO-gated) |
| GPU    | GpuNvidia        | priority list matched "GPU Core" (first hit on NVIDIA A2000) | 51.0 | **READABLE** |
| Mobo   | Motherboard      | no match (zero sensors enumerated on HP 89C0) | null | N/A (PawnIO-gated; no Super-I/O chip probed) |
| NVMe   | Storage          | no match — **HardwareType.Storage never enumerated** at top level or as SubHardware despite `IsStorageEnabled=true` | null | N/A (no IHardware of type Storage in tree) |

**GPU detail:** the NVIDIA A2000 also exposes `"GPU Hot Spot" = 61.5625`°C, which would be a better "real junction" reading than "GPU Core" for user display. Priority list D-09's seed has `"GPU Core"` first; that still resolves to a valid readable sensor. Planner may reorder in Plan 75-02 or leave as-is.

**NVMe detail (the gate failure):** the plan and research assumed `IsStorageEnabled=true` would always enumerate NVMe drives under `HardwareType.Storage`. On this HP laptop it did not — not at top-level, not as SubHardware. No exception was thrown; the Storage branch is simply empty. LHM 0.9.6 on Windows 11 26200 against this vendor's NVMe controller produces zero drives. This likely reflects one or more of: the NVMe driver not exposing SMART via the path LHM probes without elevation; the controller being an Intel VMD-backed drive that LHM cannot walk without a vendor-specific handle; or PawnIO-gating of the Windows NVMe IOCTL chain. Confirming which would require running the same enumerator either (a) with admin elevation, (b) with PawnIO installed for comparison, or (c) on a different box with a non-OEM NVMe. None of those are in scope for this spike.

## 5. Update() Timing

- Cold-call `Computer.Open()`: **4272 ms** (from enumerator first line)
- Priming `Update()` (discarded per protocol): 117 ms
- Steady-state `Update()` over 20 iterations at 2s spacing (iters 1–20 above):
  - **mean: 608.2 ms**
  - min: 78 ms (iter 1 — still cold-ish; second priming effect)
  - max: 671 ms (iter 2)
- Steady-state excluding iter 1 (mean of iters 2–20): **636.1 ms** — the "true" steady-state after the double-prime

The 4272 ms `Computer.Open()` warrants attention. The plan's `TemperatureService.InitializeCore()` timeout in Plan 75-02 is 3000 ms (TEMP-SVC-03); this spike shows the cold Open alone can take 4.3 seconds on this hardware. **Plan 75-02 will need to either raise the init timeout to ~5000 ms with a documented rationale, or accept that on this class of hardware the TemperatureService will frequently time out on startup and remain in `IsReady=false` silent-failure mode until next app launch.** This is a secondary risk surfaced by the spike but does not change the go/no-go result.

## 6. Go/No-Go Decision

**Decision (2026-05-04): NO-GO**

**Rationale:** D-02 gate requires `GPU=READABLE AND NVMe=READABLE`. GPU is READABLE (NVIDIA A2000: "GPU Core"=51°C, "GPU Hot Spot"=61.56°C, stable across 20 update iterations). NVMe is N/A — `HardwareType.Storage` never appears in the hardware tree on this dev box despite `IsStorageEnabled=true`, so the resolution algorithm has no IHardware to walk. One half of the required pair is missing; the gate fails.

**If NO-GO — scope reduction:**

The milestone cannot proceed at full scope. ROADMAP.md Phase 76 opens only after the following amendments are committed:

1. **REQUIREMENTS.md — Temps tab defaults:** TEMP-TAB-03 currently plans an NVMe default-off with GPU default-on. Because NVMe is confirmed N/A on the primary dev box, the amendment drops NVMe from the default-visible set entirely and marks the feature as "best-effort per user hardware — expect N/A on OEM laptops without admin elevation or PawnIO installed." The Temps line (Phase 79, TEMP-LINE-04) must hide the NVMe segment when `NvmeTempC == -1f` (already the -1f-sentinel contract) and never fall back to showing "NVMe: N/A" as standing UI text.
2. **REQUIREMENTS.md — TEMP-SVC-02:** `NvmeTempC` stays in the `ITempSource` contract with `-1f` sentinel (D-12 unchanged). Removing it would break the Fake test surface; the plan stands.
3. **REQUIREMENTS.md — Settings copy:** The Settings > Temps tab help text must include the phrase "NVMe temperature reporting requires administrator elevation and/or the PawnIO kernel driver on some systems; values may remain unavailable." This is a Phase 78 plan-level change.
4. **ROADMAP.md — Phase 75 SC1:** Amend the acceptance criterion from "GPU + NVMe both readable on clean Win11 24H2 VM" to "GPU readable on clean Win11 24H2 VM; NVMe best-effort with documented N/A fallback." Add an explicit note that the dev-box spike showed NVMe N/A even at baseline.
5. **ROADMAP.md — Phase 75 status:** Mark the spike complete; keep Plan 75-02 blocked pending the amendments above.

**Block condition on Phase 76:** Phase 76 is explicitly blocked until a commit amending the four items above lands on master. The GSD orchestrator's Wave 2 gate should halt at this point and route to milestone-amendment flow rather than auto-advancing to Phase 76.

**Note on dev-box representativeness:** per D-04, the dev box is a substitute for a clean Win11 24H2 VM. A true VM test might or might not also fail NVMe enumeration — virtual NVMe controllers behave differently from OEM hardware. The amendment above hedges by marking NVMe best-effort, which is safe regardless of VM outcome. A later crowdsourced report or CI VM run can firm this up if higher confidence is desired.

## 7. D-05 Threading Decision

**Measured steady-state Update() mean:** 608.2 ms (636.1 ms excluding the iter-1 double-prime artifact)
**Threshold:** 50 ms (per CONTEXT.md D-05)
**Decision:** **Path 1 (piggyback stats timer)** if mean < 50ms, **Path 2 (dedicated background task)** if mean >= 50ms.
**Chosen path:** **Path 2 (dedicated background task)** — measured mean is 12× the threshold. Piggybacking the 0.5s hover-fast-refresh stats timer would block the Dispatcher thread for >600 ms per tick, freezing the UI.
**Rationale:** at 608 ms steady-state, any on-Dispatcher invocation would blow past the 16 ms frame budget by 38× and be visually and interactively unacceptable. Per D-07, Plan 75-02 implements the long-lived `Task.Run` + `CancellationToken` background loop that sleeps 2 seconds between `Update()` calls (the D-06 floor) and writes results to volatile fields, with the single-entry `Interlocked.CompareExchange` Dispose gating `_cts.Cancel() → task.Wait(500ms) → _computer.Close()` per Research Section 6.1.

Plan 75-02 implements Path 2 and deletes the Path 1 code template. The Path 2 decision is final — no config switch, no runtime flip (per D-05).

---

**Scratch state after spike:** the `scratch/` folder (gitignored) is deleted post-report. Only this file and the `.gitignore` entry from Task 1 are the permanent artifacts of Plan 75-01.
