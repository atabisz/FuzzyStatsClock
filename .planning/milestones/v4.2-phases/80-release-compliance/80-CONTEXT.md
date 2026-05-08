# Phase 80: Release & Compliance — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Milestone role:** LAST PHASE of v4.2 — after this lands, the milestone can be audited and tagged.

<domain>
## Phase Boundary

Ship a license-clean, per-user, no-UAC installer for v4.2 with CI gates that permanently prevent the two failure modes identified in research: (a) a stray `WinRing0*.sys` driver file in the publish output, (b) the string `LibreHardwareMonitor` creeping into `FuzzyClock.Core/` (which would violate its pure `net10.0` no-hardware-deps posture and break the hardware-free test invariant).

**In scope:**
- **REL-01:** Verify `LibreHardwareMonitorLib` is pinned at exact `Version="0.9.6"` in `FuzzyClock.App.csproj` (already present — verify no floating syntax; no `[0.9.6,)` range, no `*`, no `Update=` suffix)
- **REL-02:** `.github/workflows/release.yml` — add grep gate step AFTER Publish that fails the build if any `WinRing0*.sys` file appears in the `publish/` directory
- **REL-03:** `.github/workflows/release.yml` — add grep gate step BEFORE `dotnet restore` / build that fails the build if the literal string `LibreHardwareMonitor` appears anywhere under `FuzzyClock.Core/` (excluding bin/ / obj/ which aren't checked in anyway)
- **REL-04:** New `THIRD-PARTY-NOTICES.md` at repo root — handwritten, contains intro + verbatim MPL-2.0 license text + attribution blocks for LibreHardwareMonitorLib 0.9.6 and its transitive dependencies (HidSharp, DiskInfoToolkit, BlackSharp.Core, RAMSPDToolkit-NDD)
- **REL-05:** `FuzzyClock.iss` — add one `[Files]` line shipping `THIRD-PARTY-NOTICES.md` to `{app}` root alongside FuzzyClock.exe. DLL capture requirement satisfied by existing `PublishSingleFile=true` + `IncludeNativeLibrariesForSelfExtract=true` which bundles every transitive DLL inside FuzzyClock.exe (reinterpreted — see D-01)
- Human-verify checkpoint at the end: tag a v4.2.0 release locally (not pushed) or trigger a dry-run release workflow via `workflow_dispatch`; confirm the installer builds, installs clean on dev box, and `THIRD-PARTY-NOTICES.md` appears in `%LOCALAPPDATA%\Programs\FuzzyClock\`

**Out of scope (explicit):**
- Switching from `PublishSingleFile=true` to multi-file publish — REJECTED per D-01; too much surface area for regression at end of milestone
- Auto-generating THIRD-PARTY-NOTICES.md via `dotnet-project-licenses` or similar — REJECTED per D-02; LHM is pinned, notice is stable
- Version bump of `FuzzyClock.App.csproj` `<Version>` tag from stale `3.6.0` — CI release.yml injects actual version from git tag, so local-build inaccuracy is cosmetic; leave for a future polish
- Any functional change to widget or Core behavior — Phase 80 is pure release/compliance; no runtime behavior changes
- `PhraseEngineTests.SpecialCases_NoonAndMidnight` flake fix — logged separately in STATE.md Active TODOs; unrelated to Phase 80 scope but may be opportunistically bundled if a pre-release polish window opens (Claude's discretion, not locked)

</domain>

<decisions>
## Implementation Decisions

### REL-05 Interpretation (Area 1)

- **D-01:** **Keep `PublishSingleFile=true` + `IncludeNativeLibrariesForSelfExtract=true`.** The REL-05 requirement "Inno Setup [Files] section captures the LHM DLL and all transitive DLLs" is reinterpreted as "the shipped installer artifact captures all transitive DLLs" — which the current pipeline already achieves: every DLL (LibreHardwareMonitorLib, HidSharp, DiskInfoToolkit, BlackSharp.Core, RAMSPDToolkit-NDD, System.IO.Ports, System.Management, plus the LHM native pair under `runtimes/`) is bundled inside `FuzzyClock.exe` and self-extracted at first run. The Inno Setup `[Files]` section contains one primary `Source: "{#SourceDir}\FuzzyClock.exe"` entry; Phase 80 adds exactly ONE new entry (for THIRD-PARTY-NOTICES.md per REL-04 + D-04).
- **D-02:** **NOT switching to multi-file publish.** Explicit enumeration of all transitive DLLs in Inno Setup `[Files]` is rejected: (a) the transitive DLL set is coupled to LHM internals and can change on any minor version bump; (b) enumerating each under `runtimes/win-x64/lib/net10.0/` + native pair adds ~8 new `[Files]` entries to maintain; (c) current single-file approach is already a working, tested release pipeline (prior milestones v3.5+ shipped this way). Zero-regression posture wins at the end of a milestone.

### THIRD-PARTY-NOTICES Source of Truth (Area 2)

- **D-03:** **Handwritten single file at repo root: `THIRD-PARTY-NOTICES.md`.** Structure:
  1. Brief intro paragraph (one sentence: "This product uses third-party components; their licenses and attributions follow.")
  2. Verbatim MPL-2.0 license text (copied from https://www.mozilla.org/en-US/MPL/2.0/ — the canonical text)
  3. Attribution block for LibreHardwareMonitorLib 0.9.6 (copyright line from LHM's license file, link to upstream repo)
  4. Attribution blocks for transitive dependencies that require notice: **HidSharp** (MIT), **DiskInfoToolkit** (MPL-2.0), **BlackSharp.Core** (MPL-2.0), **RAMSPDToolkit-NDD** (MPL-2.0). Planner researches exact license + copyright line per package during PLAN execution.
  5. Optional: MIT license text for HidSharp
- **D-04:** **No auto-generation tool.** `dotnet-project-licenses`, `nuget-license`, and similar tools are rejected: (a) LHM is version-pinned at 0.9.6 so the notice is stable indefinitely; (b) adding a tool to CI introduces another failure surface; (c) tools sometimes miss licenses or pick wrong upstream URLs and need manual correction anyway.
- **D-05:** **NOTICES file only changes on LHM version bump.** Future milestones that bump LHM must update this file as part of the bump PR — add a note to the file itself reminding maintainers of this.

### CI Grep Gate Placement (Area 3)

- **D-06:** **REL-03 gate (`LibreHardwareMonitor` not in `FuzzyClock.Core/`) runs PRE-BUILD.** Placed as a step in `.github/workflows/release.yml` immediately after `actions/checkout@v4` and before `Restore` / `Test` / `Publish`. Fail-fast semantics: a Core-purity violation kills the workflow before ~5 minutes of build + test + publish time is spent. Exit-on-grep-match pattern:
  ```yaml
  - name: REL-03 guard — LibreHardwareMonitor absent from FuzzyClock.Core/
    shell: bash
    run: |
      if grep -r --include='*.cs' --include='*.csproj' 'LibreHardwareMonitor' FuzzyClock.Core/; then
        echo "::error::REL-03 violation: 'LibreHardwareMonitor' found in FuzzyClock.Core/"
        exit 1
      fi
  ```
- **D-07:** **REL-02 gate (`WinRing0*.sys` absent from publish/) runs POST-PUBLISH.** Must run after the `Publish` step because the `publish/` directory does not exist pre-publish. Place immediately after the existing Publish step:
  ```yaml
  - name: REL-02 guard — no WinRing0 driver in publish output
    shell: bash
    run: |
      if find publish/ -name 'WinRing0*.sys' -print -quit | grep -q .; then
        echo "::error::REL-02 violation: WinRing0*.sys leaked into publish/"
        exit 1
      fi
  ```
- **D-08:** **No redundant pre-build WinRing0 check.** Pre-build gate would trivially pass because `publish/` is empty — zero signal. Post-publish is the only meaningful location.

### REL-04 Installer Placement (Area 4)

- **D-09:** **THIRD-PARTY-NOTICES.md ships to `{app}` root.** Inno Setup [Files] addition:
  ```inno
  Source: "THIRD-PARTY-NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion
  ```
  Lands at `%LOCALAPPDATA%\Programs\FuzzyClock\THIRD-PARTY-NOTICES.md` alongside `FuzzyClock.exe`. Standard OSS convention; users who navigate to the install folder see it immediately.
- **D-10:** **No `isreadme` flag.** Inno Setup's `isreadme` flag is frequently misunderstood (it adds an option to open-on-completion, not a visible finish-page line). Notices don't need to be forced in front of users during install; being in the install folder is sufficient for license compliance purposes.
- **D-11:** **No Docs/ subfolder.** Single-file install layout; a Docs/ subfolder adds structure overhead with no current payoff. Future license additions (if any) can still nest there later without breaking anything.

### Release Pipeline Plumbing (details)

- **D-12:** **REL-01 verification, not mutation.** `FuzzyClock.App.csproj` line 15 already reads `<PackageReference Include="LibreHardwareMonitorLib" Version="0.9.6" />` — the exact-version syntax with `Version="0.9.6"` (NOT `Version="[0.9.6,)"` or `Version="*"`). Phase 80 verifies this via a plan task (read file, confirm literal string) + a CI guard that greps for `Version="0.9.6"` specifically. No csproj edit needed for REL-01.
- **D-13:** **REL-01 CI sentry (optional).** Add a tiny CI step after REL-03 gate: `grep -F '<PackageReference Include="LibreHardwareMonitorLib" Version="0.9.6" />' FuzzyClock.App/FuzzyClock.App.csproj` must return exit 0. Defensive against future accidental version-range edits. Planner's call whether this is worth the 100ms CI cost.
- **D-14:** **No changes to existing release.yml steps.** Only ADD new steps (REL-03 pre-build, REL-01 sentry optional, REL-02 post-publish). Do NOT touch `Restore`, `Test`, `Publish`, `Compile installer`, `Generate checksums`, `Create GitHub Release` steps. Zero regression surface on the working pipeline.

### Version & Tag (not a locked decision — planner's discretion)

- **D-15:** **`FuzzyClock.App.csproj` `<Version>3.6.0</Version>` is stale but harmless.** CI injects real version from tag via `/p:Version=…`. Local `dotnet run` reports 3.6.0 which is visually incorrect for a v4.2 build but has no functional consequence. Planner MAY bump it to `4.2.0` as a trivial polish within Phase 80 if budget allows; otherwise deferred to a future polish milestone.

### Human-Verify Checkpoint

- **D-16:** **Phase 80 MUST have a human-verify checkpoint** as the final task of the last plan. The gate runs the full release pipeline end-to-end on a tagged build (local `git tag v4.2.0` + GitHub Actions `workflow_dispatch`, or a dry-run local Inno Setup compilation) and walks an ~8-item checklist:
  1. `REL-01` — `grep -F 'Version="0.9.6"'` in csproj returns 1 match
  2. `REL-02` — `find publish/ -name 'WinRing0*.sys'` returns empty
  3. `REL-03` — `grep -r 'LibreHardwareMonitor' FuzzyClock.Core/` returns empty
  4. `REL-04` — `THIRD-PARTY-NOTICES.md` exists at repo root AND ships inside installer artifact
  5. `REL-05` — Installer built via Inno Setup; running `installer/FuzzyClockSetup-4.2.0.exe` on dev box installs to `%LOCALAPPDATA%\Programs\FuzzyClock\` with no UAC prompt; the installed app launches and renders the temps line (dev-box expected: `GPU 51°`)
  6. CI run (if actually triggered on GitHub): the two grep gates must either PASS (clean run) or FAIL with the expected error message if intentionally tripped (safety net test)
  7. `dotnet list package FuzzyClock.App` confirms `LibreHardwareMonitorLib 0.9.6` (NOT 0.9.6 with a `(*)` / `[*]` flag indicating approximate match)
  8. After-install: `%LOCALAPPDATA%\Programs\FuzzyClock\THIRD-PARTY-NOTICES.md` exists and is the same file as repo-root version

### Claude's Discretion

- Exact plan count (1 vs 2 — Phase 78 + 79 precedent is 2-plan split with human-verify as separate Plan 02). Given Phase 80 is smaller, 1 plan with a final human-verify task is also defensible.
- Whether the optional REL-01 CI sentry from D-13 is added (my lean: skip it; REL-01 is already enforced by the PackageReference semantics — if the version ever becomes a range, NuGet resolution will pull newer bits but the Version= attribute itself stays as written).
- Exact attribution wording for each transitive dep in THIRD-PARTY-NOTICES.md — planner researches license terms per package.
- Whether to bump `FuzzyClock.App.csproj` `<Version>3.6.0</Version>` → `<Version>4.2.0</Version>` (D-15 — trivial if bundled, else deferred).
- Exact test additions (if any) — REL gates are CI-only, not unit-testable in the traditional sense. Current test count = 562. Phase 80 likely adds zero unit tests (+0 net); CI guards are the tests.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — REL-01 through REL-05 (the 5 locked requirements for this phase); also references pinning rationale and "no UAC / per-user installer" invariants

### Roadmap
- `.planning/ROADMAP.md` §Phase 80 — SC1–SC5 define acceptance

### Research (seeds ship artifact plan)
- `.planning/research/STACK.md` — LHM 0.9.6 pin, transitive DLL list, MPL compliance checklist (the source for the attribution blocks in THIRD-PARTY-NOTICES.md)
- `.planning/research/PITFALLS.md` — "looks done but isn't" checklist; WinRing0 / admin-elevation landmines rationale for REL-02

### Prior Phase Context (locked; do NOT re-decide)
- `.planning/phases/75-hardware-discovery-spike-temperatureservice/75-CONTEXT.md` — LHM 0.9.6 as locked dependency; REL-03 invariant already defended across Phases 75–79
- `.planning/phases/76-appsettings-temperatureformatter-tests/76-01-SUMMARY.md` — Core-purity grep gate first asserted here
- `.planning/phases/78-temps-tab-in-settings/78-01-SUMMARY.md` / `78-02-SUMMARY.md` — 2-plan split precedent; human-verify in final plan
- `.planning/phases/79-temps-line-on-widget/79-02-SUMMARY.md` — most recent human-verify pattern; 22-item checklist structure

### Existing Release Pipeline (READ before modifying)
- `.github/workflows/release.yml` — 9 existing steps: checkout → setup-dotnet → extract-version → restore → test → publish → compile-installer → rename-exe → checksums → create-release. Phase 80 INSERTS new gate steps; does NOT edit existing steps.
- `FuzzyClock.iss` — Inno Setup config; [Files] currently has one entry (FuzzyClock.exe). Phase 80 adds one entry (THIRD-PARTY-NOTICES.md).
- `FuzzyClock.App/FuzzyClock.App.csproj` — line 15 has the pinned `LibreHardwareMonitorLib Version="0.9.6"`. REL-01 verification target; no edit.

### External (compliance sources)
- MPL-2.0 license text: https://www.mozilla.org/en-US/MPL/2.0/ (verbatim body to copy into THIRD-PARTY-NOTICES.md)
- LibreHardwareMonitor upstream: https://github.com/LibreHardwareMonitor/LibreHardwareMonitor (copyright / attribution source)
- Transitive dep licenses (planner enumerates via `dotnet list package --include-transitive` or reads from each package's NuGet metadata during PLAN)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **release.yml**: already shipped and production-tested across v3.5 → v4.1. Phase 80 adds 2 (or 3) steps to an existing 9-step pipeline; no restructure.
- **FuzzyClock.iss**: already handles per-user install / AppMutex / uninstaller settings-removal checkbox / auto-launch registry update. Phase 80 adds ONE line to `[Files]` block.
- **`PublishSingleFile=true` + `IncludeNativeLibrariesForSelfExtract=true`**: already bundles every DLL into FuzzyClock.exe and self-extracts at runtime. REL-05 artifact-capture interpretation honored.
- **REL-01 already satisfied in code**: `FuzzyClock.App.csproj:15` has exact-version `Version="0.9.6"` syntax.
- **REL-03 already clean in practice**: `grep -r "LibreHardwareMonitor" FuzzyClock.Core/` currently returns 0 matches. Phase 80 CI gate is future-proofing, not remediation.

### Established Patterns
- **Additive-only release.yml changes**: v3.5 shipped the pipeline; v3.6 through v4.1 didn't touch release steps. Phase 80 continues this "only add, never edit" posture.
- **Single [Files] line per shippable asset** in FuzzyClock.iss (currently 1 entry; Phase 80 makes it 2). Consistent with existing minimalism.
- **`::error::` prefix** on CI failure messages — GitHub Actions recognises this format and surfaces errors in the workflow summary panel.

### Integration Points
- `.github/workflows/release.yml`: INSERT "REL-03 guard" step between `Setup .NET` and `Extract version from tag`; INSERT "REL-02 guard" step between `Publish` and `Compile installer`.
- `FuzzyClock.iss`: INSERT one [Files] line after `Source: "{#SourceDir}\FuzzyClock.exe"`: `Source: "THIRD-PARTY-NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion`.
- `THIRD-PARTY-NOTICES.md`: NEW file at repo root.
- `FuzzyClock.App/FuzzyClock.App.csproj`: NO EDITS required; REL-01 already satisfied. (Optional D-15 version bump is Claude's discretion.)
- `FuzzyClock.Core/`: NO EDITS — REL-03 already clean. (Verify-only.)

### New Files
- `THIRD-PARTY-NOTICES.md` at repo root (only new non-planning file in Phase 80)
- Plan artifacts in `.planning/phases/80-release-compliance/` (CONTEXT.md here; planner writes PLAN / SUMMARY)

</code_context>

<specifics>
## Specific Ideas

- **Plan Phase 80 as MOSTLY an additive-release-step work with ONE new repo-root file**: very small code-change surface; the risky stuff is the content of THIRD-PARTY-NOTICES.md being legally correct.
- **Validate the CI guards actually fail when expected**: the human-verify checkpoint MUST include a "tripwire test" — either (a) create a temporary feature branch that intentionally adds a WinRing0.sys placeholder file to publish/ and confirm the workflow fails, OR (b) confirm the grep logic via local bash (`touch publish/WinRing0x64.sys && find publish/ -name 'WinRing0*.sys'`) returns the file so the exit-1 branch would fire. Bash validation is safer and cheaper than a dry-run CI push.
- **`dotnet list package --include-transitive FuzzyClock.App/FuzzyClock.App.csproj`** is the command that reveals the LHM transitive set. Planner runs this to get the authoritative list for THIRD-PARTY-NOTICES.md attribution blocks.
- **MPL-2.0 verbatim body** is ~170 lines of legal text. Copy-paste from mozilla.org/MPL/2.0/txt (plaintext form) — don't transcribe manually.
- **Testing the installer**: the human-verify phase should EITHER trigger a release on GitHub (tag push) OR compile the installer locally via `"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /DAppVersion=4.2.0 /DSourceDir=publish FuzzyClock.iss`. Local compilation is faster and doesn't consume a GitHub release artifact.

</specifics>

<deferred>
## Deferred Ideas

- **Switching to multi-file publish** — D-02 rejected; revisit only if PublishSingleFile self-extraction ever causes a startup regression.
- **Auto-generated NOTICES via `dotnet-project-licenses`** — D-04 rejected; revisit if the dependency list grows beyond 5–6 packages.
- **Bumping `FuzzyClock.App.csproj` `<Version>3.6.0</Version>` to `4.2.0`** — D-15 Claude's discretion; if planner doesn't bundle, defer to a post-milestone polish.
- **`isreadme` flag on installer notices** — D-10 rejected; niche and poorly-understood.
- **`{app}\Docs\` subfolder** — D-11 rejected; single-file install suffices.
- **PhraseEngineTests.SpecialCases_NoonAndMidnight flake** — tracked in STATE.md Active TODOs; opportunistic fix only, not Phase 80 scope.
- **Code-signing the installer binary** — huge topic; separate future milestone if ever pursued; SmartScreen warnings acceptable for v4.2.

</deferred>

---

*Phase: 80-release-compliance*
*Context gathered: 2026-05-04*
*LAST PHASE OF MILESTONE v4.2 — after this ships, the milestone completes.*
