# Phase 74: Remove Named Themes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 74-remove-named-themes
**Areas discussed:** Migration strategy

---

## Migration Strategy

### Q1: Migration approach

| Option | Description | Selected |
|--------|-------------|----------|
| Just delete Theme field | AccentColor is already saved alongside Theme. Removing Theme field means JSON ignores it. Simplest and safest. | ✓ |
| Explicit mapping in Load() | Map Theme name → AccentColor hex before returning. Safety net. Requires keeping BuiltInThemes temporarily. | |
| Migration + cleanup write | Map in Load() then re-save without Theme field. Most thorough but adds file I/O. | |

**User's choice:** Just delete Theme field (Recommended)
**Notes:** SaveSettings() writes AccentColor hex every time, so individually persisted value is guaranteed to match theme's accent color.

### Q2: Old Theme key handling

| Option | Description | Selected |
|--------|-------------|----------|
| Silently ignore | System.Text.Json skips unknown keys by default. No diagnostic noise. | ✓ |
| Log to debug output | Debug.WriteLine if Theme key detected. Helps debugging but adds code path. | |

**User's choice:** Silently ignore (Recommended)

### Q3: ResetToDefaults handling

| Option | Description | Selected |
|--------|-------------|----------|
| No change needed | Once _currentTheme is deleted, nothing to clear. Concept vanishes. | ✓ |
| Verify and document | Double-check and add comment if ambiguity. | |

**User's choice:** No change needed (Recommended)

### Q4: SettingsSnapshot.ActiveTheme

| Option | Description | Selected |
|--------|-------------|----------|
| Delete entirely | No downstream code reads it once theme cards removed. Clean deletion. | ✓ |
| Keep as deprecated null field | Belt and suspenders. | |

**User's choice:** Delete ActiveTheme entirely (Recommended)

### Q5: PROJECT.md update

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, update PROJECT.md | Keep project description accurate. Remove theme references. | ✓ |
| Defer to milestone close | PROJECT.md gets a full pass during /gsd:complete-milestone. | |

**User's choice:** Yes, update PROJECT.md (Recommended)

### Q6: ThemeDefinition.cs file

| Option | Description | Selected |
|--------|-------------|----------|
| Delete entirely | No purpose once themes removed. Clean deletion. | ✓ |
| Keep as empty stub | Dead code, not recommended. | |

**User's choice:** Delete entirely (Recommended)

### Q7: Migration tests

| Option | Description | Selected |
|--------|-------------|----------|
| Existing tests sufficient | AppSettings round-trip tests verify JSON deserialization. Build verification confirms deletion. | ✓ |
| Add migration test | Test old settings.json with Theme key still produces correct AccentColor. Tests a no-op path. | |

**User's choice:** Existing tests sufficient (Recommended)

---

## Claude's Discretion

- Settings UI layout adjustment after theme card row removal
- Order of deletions across files
- Whether to update existing tests referencing theme names

## Deferred Ideas

None — discussion stayed within phase scope
