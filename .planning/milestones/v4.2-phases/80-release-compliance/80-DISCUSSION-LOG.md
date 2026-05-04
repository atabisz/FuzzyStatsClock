# Phase 80: Release & Compliance — Discussion Log

**Session date:** 2026-05-04
**Mode:** discuss (default, interactive)
**Areas selected:** All 4 gray areas

---

## Area 1: PublishSingleFile vs [Files] DLL list (REL-05)

**Q:** REL-05 says "Inno Setup [Files] section captures the LHM DLL and all transitive DLLs". Current release.yml uses `PublishSingleFile=true` which bundles everything into FuzzyClock.exe. Which interpretation?

**Options presented:**
- **Keep PublishSingleFile, interpret REL-05 as "artifact contains DLLs" (Recommended)** — single-file self-extraction already satisfies the intent; smallest regression surface at end of milestone
- Switch to multi-file publish + explicit [Files] list — stricter literal reading; more maintenance; DLL set coupled to LHM internals
- Hybrid — single-file for code + explicit [Files] entry for NOTICES only — impossible to get clean REL-05 literal compliance with single-file since DLLs aren't on disk

**User selected:** Keep PublishSingleFile, interpret REL-05 as "artifact contains DLLs" (Recommended)

**Captured as:** D-01 + D-02

---

## Area 2: THIRD-PARTY-NOTICES source of truth (REL-04)

**Q:** Handwritten or auto-generated?

**Options presented:**
- **Handwritten (Recommended)** — single manual NOTICES.md; stable because LHM is version-pinned; easy to review
- Auto-generated via dotnet-project-licenses — more robust across upgrades; adds tooling + CI failure surface
- Hybrid — manual MPL-2.0 body + generated attribution appendix — overkill for pinned single-dependency

**User selected:** Handwritten (Recommended)

**Captured as:** D-03 + D-04 + D-05

---

## Area 3: CI grep gate placement (REL-02 + REL-03)

**Q:** Where in release.yml do the REL-02 (WinRing0*.sys absent from publish output) and REL-03 (LibreHardwareMonitor absent from FuzzyClock.Core/) gates land?

**Options presented:**
- **REL-03 pre-build, REL-02 post-publish (Recommended)** — REL-03 fail-fast before build; REL-02 necessarily post-publish because publish/ doesn't exist pre-build
- Both pre-build — REL-02 pre-build is broken (nothing to grep)
- Both post-publish — wastes ~5 min of CI time if REL-03 fails
- Both pre-build AND post-publish — redundant; adds CI time

**User selected:** REL-03 pre-build, REL-02 post-publish (Recommended)

**Captured as:** D-06 + D-07 + D-08

---

## Area 4: REL-04 installer placement

**Q:** Where inside the installed `{app}` folder does THIRD-PARTY-NOTICES.md land?

**Options presented:**
- **Root of {app} — alongside FuzzyClock.exe (Recommended)** — standard OSS convention; visible when user navigates to install dir
- Docs subfolder {app}\Docs\ — cleaner organization but overkill for one file
- Root + `isreadme` flag — flag frequently misunderstood; niche behavior

**User selected:** Root of {app} — alongside FuzzyClock.exe (Recommended)

**Captured as:** D-09 + D-10 + D-11

---

## Plumbing details (not asked; derived from codebase reconnaissance)

- **D-12:** REL-01 is verification-only — `FuzzyClock.App.csproj:15` already has `Version="0.9.6"` exact-syntax
- **D-13:** Optional REL-01 CI sentry — planner's call whether to add a grep check for the exact version-pinning line
- **D-14:** No edits to existing release.yml steps; only ADD new steps
- **D-15:** `FuzzyClock.App.csproj` `<Version>3.6.0</Version>` is stale but CI injects real version; Claude's discretion to bump to 4.2.0 if budget allows
- **D-16:** Human-verify checkpoint mandatory — 8-item checklist mapping to REL-01..05

---

## Claude's Discretion (deferred to planner)

- Plan count — 1 vs 2 plans (Phase 78/79 precedent is 2-plan split with human-verify in Plan 02; Phase 80 is smaller and could be a single plan)
- Whether to add the optional REL-01 CI sentry (D-13)
- Whether to bundle the `FuzzyClock.App.csproj` Version bump (D-15)
- Exact transitive-dep license attribution text in THIRD-PARTY-NOTICES.md (planner researches each package's license)
- Whether to validate CI gates work via temporary tripwire test (local bash validation safer than actual CI push)

---

## Deferred Ideas Captured

- Multi-file publish (D-02 rejected) — revisit only if single-file causes startup regression
- Auto-generated NOTICES (D-04 rejected) — revisit if deps grow beyond 5-6 packages
- `isreadme` installer flag (D-10 rejected) — niche, poorly understood
- `{app}\Docs\` subfolder (D-11 rejected) — single-file layout suffices
- Code-signing installer binary — separate future milestone
- `PhraseEngineTests.SpecialCases_NoonAndMidnight` flake — already tracked in STATE.md Active TODOs; opportunistic fix

---

*Discussion complete — 4/4 gray areas resolved; 0 scope creep; CONTEXT.md written with 16 locked decisions (D-01..D-16).*
