# Phase 50: Installer + CI - Research

**Researched:** 2026-03-18
**Domain:** Inno Setup per-user Windows installer + GitHub Actions release workflow
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Installer tool: Inno Setup (not Velopack, MSIX, or anything else)
- Install target: `%LOCALAPPDATA%\Programs\FuzzyClock\` — per-user, no UAC elevation
- Release trigger: git tag push (`v*`) only — intentional release signal
- Workflow sequence: tests pass first, then build artifacts — cannot ship broken build
- GitHub Release: auto-drafted as **draft** — user clicks Publish manually
- Version sourcing: strip `v` from tag, pad to 3 parts (e.g. `v3.3` → `3.3.0`); passed to `dotnet publish /p:Version=3.3.0` and to Inno Setup via CI env var
- Upgrade behavior: if FuzzyClock is running when installer launches, prompt user to close it
- Finish page: "Launch FuzzyClock" checkbox (opt-in relaunch after install/upgrade)
- Uninstall: settings.json preserved by default; optional "Also remove settings" checkbox
- Artifact names: `FuzzyClock-X.Y.Z.exe`, `FuzzyClockSetup-X.Y.Z.exe`, `checksums.txt`

### Claude's Discretion

- Exact Inno Setup script structure and section layout
- How to detect and signal the running process (`CloseApplications` directive vs `AppMutex` vs custom Pascal)
- GitHub Actions job/step breakdown
- .NET publish flags and self-contained vs framework-dependent choice

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INST-01 | FuzzyClockSetup.exe installs per-user to %LOCALAPPDATA%\Programs\FuzzyClock\ with no UAC prompt | `PrivilegesRequired=lowest` + `DefaultDirName={localappdata}\Programs\FuzzyClock` |
| INST-02 | Running the installer over an existing installation upgrades in-place without data loss | Same `AppId` GUID on every run; Inno Setup handles file replacement; settings dir is separate from install dir |
| INST-03 | Installer creates a Start Menu shortcut | `[Icons]` section with `{group}\FuzzyClock` entry |
| INST-04 | Installer registers in Add/Remove Programs with a clean uninstall path | Inno Setup does this automatically when `AppId`, `AppName`, `AppPublisher`, `AppVersion` are set |
| INST-05 | Uninstall removes app files but preserves settings.json | Settings live in `{localappdata}\FuzzyClock\` (separate dir from install); don't include that dir in `[Dirs]` |
| INST-06 | If auto-launch was enabled, installer updates HKCU Run entry to new install path | Pascal `CurStepChanged(ssPostInstall)` — check if Run key exists, rewrite with new path |
| INST-07 | CI produces FuzzyClock-X.Y.Z.exe, FuzzyClockSetup-X.Y.Z.exe, checksums.txt as draft GitHub Release on tag push | GitHub Actions with `softprops/action-gh-release@v2`; `draft: true`; PowerShell `Get-FileHash` for checksums |
| INST-08 | Installer prompts user to close running FuzzyClock before proceeding | `AppMutex=FuzzyClock_SingleInstance_v1` — matches mutex the app already creates |
| INST-09 | Finish page "Launch FuzzyClock" checkbox; uninstaller offers optional settings.json removal | `[Run]` entry with `postinstall nowait` flags; Pascal `InitializeUninstallProgressForm` for checkbox |
</phase_requirements>

---

## Summary

This phase has two deliverables: an Inno Setup `.iss` script that builds `FuzzyClockSetup.exe`, and an update to `.github/workflows/release.yml` that produces both the bare EXE and the installer as a draft GitHub Release with checksums when a `v*` tag is pushed.

The existing `release.yml` is already close to correct — it triggers on tag push, runs tests, publishes a self-contained single-file EXE via `dotnet publish`, and uploads to GitHub Releases using `softprops/action-gh-release@v2`. The required changes are: inject the version string from the git tag into both the `dotnet publish` command and the Inno Setup compiler invocation; add an `iscc` step after publish; rename artifacts with the version suffix; generate a `checksums.txt`; and mark the release as `draft: true`.

The app already creates a named mutex (`FuzzyClock_SingleInstance_v1`) for single-instance enforcement. Inno Setup's `AppMutex` directive uses this exact mutex name to detect a running instance and show a "please close it" dialog — no Pascal script needed for INST-08. The "Launch FuzzyClock" checkbox on the finish page is a built-in Inno Setup feature via `[Run]` section flags. The "Also remove settings" uninstall checkbox requires Pascal scripting since Inno Setup has no built-in uninstall checkbox UI.

**Primary recommendation:** Use `AppMutex` for running-instance detection (zero code), `[Run]` `postinstall` flag for finish page launch, Pascal `CurUninstallStepChanged` for optional settings removal, and a single GitHub Actions job that extracts the version from `GITHUB_REF`, publishes the EXE, compiles the installer, generates checksums, and uploads all three as a draft release.

---

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Inno Setup | 6.7.1 (pre-installed on `windows-latest`) | Windows installer compiler | Free, widely used, no UAC for per-user installs, built-in Pascal scripting |
| `softprops/action-gh-release` | v2 (v2.6.1 as of 2026-03) | Upload artifacts + create GitHub Release | Already in use in this repo; supports `draft: true`, multiple files, auto-generated notes |
| `actions/setup-dotnet` | v4 | Install .NET 10 SDK | Already in use |
| `actions/checkout` | v4 | Checkout repo | Already in use |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| PowerShell `Get-FileHash` | Built-in | Generate SHA256 checksums | Already available on `windows-latest`; no extra install |
| `dotnet publish` `/p:Version=` | .NET 10 | Stamp assembly version at publish time | Inject version from git tag |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `AppMutex` directive | Custom Pascal `FindWindowEx` or process enumeration | AppMutex is cleaner — uses the mutex the app already maintains; no custom code |
| `[Run]` `postinstall` | Pascal `CreateCustomPage` for finish page | Built-in flag is simpler; sufficient for a single "launch" checkbox |
| PowerShell `Get-FileHash` | `certutil -hashfile` or separate action | PowerShell is idiomatic on Windows runners and already available |

**Installation (CI):** Inno Setup is pre-installed on `windows-latest` at `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`. No install step needed.

---

## Architecture Patterns

### Recommended Project Structure

```
FuzzyClock.iss                  # Inno Setup script (repo root)
.github/
└── workflows/
    └── release.yml             # Updated release workflow (already exists)
```

The `.iss` file lives at the repo root for easy `iscc FuzzyClock.iss` invocation.

### Pattern 1: Per-User Install with No UAC

**What:** `PrivilegesRequired=lowest` forces the installer to run in user context. `DefaultDirName` uses the `{localappdata}` Inno Setup constant.

**When to use:** Any app that installs to AppData and needs no system-wide registry or file access.

**Example:**
```ini
; Source: https://jrsoftware.org/ishelp/topic_setup_privilegesrequired.htm
[Setup]
AppId={{YOUR-GUID-HERE}
AppName=FuzzyClock
AppVersion={#AppVersion}
AppPublisher=Alex Tabisz
DefaultDirName={localappdata}\Programs\FuzzyClock
DefaultGroupName=FuzzyClock
PrivilegesRequired=lowest
OutputBaseFilename=FuzzyClockSetup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
```

Note: `AppId` GUID must be generated once and never changed — it is the key Inno Setup uses to detect existing installs for upgrade and for Add/Remove Programs registration.

### Pattern 2: AppMutex for Running-Instance Detection (INST-08)

**What:** Inno Setup's `AppMutex` directive names a mutex the installer should check at startup. If the mutex exists (app is running), the installer shows a dialog asking the user to close the app before continuing.

**When to use:** Any app that maintains a named mutex for single-instance enforcement — which FuzzyClock already does.

**Example:**
```ini
; Source: https://jrsoftware.org/ishelp/topic_setup_appmutex.htm
[Setup]
AppMutex=FuzzyClock_SingleInstance_v1
```

The mutex name **must exactly match** what `App.xaml.cs` passes to `new Mutex(initiallyOwned: true, "FuzzyClock_SingleInstance_v1", out createdNew)`. The match is case-sensitive.

The dialog text Inno Setup shows: "Setup has detected that FuzzyClock is currently running. Please close all instances of it now, then click OK to continue, or Cancel to exit."

No custom Pascal script is needed.

### Pattern 3: Finish Page "Launch" Checkbox (INST-09, install half)

**What:** An entry in the `[Run]` section with `postinstall nowait` flags creates a checkbox on the Setup Completed wizard page.

**When to use:** Standard pattern for "Launch application when setup finishes."

**Example:**
```ini
; Source: https://jrsoftware.org/ishelp/topic_runsection.htm
[Run]
Filename: "{app}\FuzzyClock.exe"; \
    Description: "Launch FuzzyClock"; \
    Flags: postinstall nowait skipifsilent
```

`postinstall` — creates the finish-page checkbox.
`nowait` — setup doesn't wait for the app to exit before closing.
`skipifsilent` — checkbox has no effect when running in silent mode (`/silent`).

The checkbox is **checked by default**. To make it opt-in (unchecked), add the `unchecked` flag. Per the decisions, the checkbox should be checked (user confirmed "Launch FuzzyClock" is opt-in meaning it defaults checked). Use without `unchecked` flag.

### Pattern 4: Optional "Remove Settings" Uninstall Checkbox (INST-09, uninstall half)

**What:** Inno Setup has no built-in uninstall checkbox UI. The standard pattern is to add a checkbox via `InitializeUninstallProgressForm` and act on it in `CurUninstallStepChanged(usPostUninstall)`.

**When to use:** Any custom action the user can opt into during uninstall.

**Example:**
```pascal
; Pascal script section
[Code]
var
  RemoveSettingsCheckbox: TNewCheckBox;

procedure InitializeUninstallProgressForm();
var
  PageText: TNewStaticText;
begin
  // Add a checkbox below the progress bar on the uninstall confirmation page
  RemoveSettingsCheckbox := TNewCheckBox.Create(UninstallProgressForm);
  RemoveSettingsCheckbox.Parent := UninstallProgressForm;
  RemoveSettingsCheckbox.Caption := 'Also remove my settings and data';
  RemoveSettingsCheckbox.Checked := False;   // unchecked = preserve settings (default)
  RemoveSettingsCheckbox.Left := UninstallProgressForm.StatusLabel.Left;
  RemoveSettingsCheckbox.Top  := UninstallProgressForm.StatusLabel.Top +
                                 UninstallProgressForm.StatusLabel.Height + 8;
  RemoveSettingsCheckbox.Width := UninstallProgressForm.StatusLabel.Width;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  SettingsDir: string;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if Assigned(RemoveSettingsCheckbox) and RemoveSettingsCheckbox.Checked then
    begin
      SettingsDir := ExpandConstant('{localappdata}\FuzzyClock');
      DelTree(SettingsDir, True, True, True);
    end;
  end;
end;
```

`UninstallProgressForm` is the Inno Setup global for the uninstall progress window. `TNewCheckBox` is part of the Inno Setup VCL wrapper.

### Pattern 5: Auto-Launch Registry Update on Upgrade (INST-06)

**What:** If the user had auto-launch enabled, the HKCU Run entry points to the old EXE path. After install, the new EXE is at the same `{app}` path (per-user per-user install), so the entry may not need updating — but if `{app}` changes (first install vs upgrade to different path), the Pascal code must rewrite it.

**When to use:** Any app that stores a Run registry entry with an absolute path.

**Key insight:** Since `DefaultDirName` is fixed as `{localappdata}\Programs\FuzzyClock`, the path is deterministic and does not change between upgrades. The existing Run entry will already point to the correct path after upgrade. However, to be safe, the Pascal code should rewrite the value anyway.

**Example:**
```pascal
; Source: AutoLaunchService.cs pattern — HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
procedure CurStepChanged(CurStep: TSetupStep);
var
  RunKeyPath: string;
  ExePath: string;
begin
  if CurStep = ssPostInstall then
  begin
    RunKeyPath := 'SOFTWARE\Microsoft\Windows\CurrentVersion\Run';
    ExePath := ExpandConstant('{app}\FuzzyClock.exe');
    // Only update if the entry already exists (user had auto-launch enabled)
    if RegValueExists(HKEY_CURRENT_USER, RunKeyPath, 'FuzzyClock') then
      RegWriteStringValue(HKEY_CURRENT_USER, RunKeyPath, 'FuzzyClock', ExePath);
  end;
end;
```

### Pattern 6: Version Injection via CI Environment Variable

**What:** The Inno Setup preprocessor reads `#define AppVersion` from the command line via `/DAppVersion=3.3.0`. The `release.yml` extracts the tag name, strips `v`, pads to 3 parts, and passes it to both `dotnet publish` and `iscc`.

**Example (workflow):**
```yaml
- name: Extract version
  id: version
  shell: bash
  run: |
    TAG="${GITHUB_REF#refs/tags/v}"        # strips "refs/tags/v" → "3.3"
    # Pad to X.Y.Z
    IFS='.' read -ra PARTS <<< "$TAG"
    MAJOR="${PARTS[0]:-0}"
    MINOR="${PARTS[1]:-0}"
    PATCH="${PARTS[2]:-0}"
    echo "version=$MAJOR.$MINOR.$PATCH" >> "$GITHUB_OUTPUT"

- name: Publish EXE
  run: >
    dotnet publish FuzzyClock.App
    -r win-x64
    -c Release
    --no-restore
    --self-contained true
    -p:PublishSingleFile=true
    -p:PublishReadyToRun=true
    -p:IncludeNativeLibrariesForSelfExtract=true
    -p:Version=${{ steps.version.outputs.version }}
    -o publish/

- name: Rename EXE
  shell: bash
  run: mv publish/FuzzyClock.exe "publish/FuzzyClock-${{ steps.version.outputs.version }}.exe"

- name: Compile installer
  shell: cmd
  run: >
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    /DAppVersion=${{ steps.version.outputs.version }}
    /DSourceDir=publish
    FuzzyClock.iss
```

**Example (Inno Setup script preprocessor):**
```ini
; At top of .iss file — value injected by CI via /DAppVersion=X.Y.Z
; During local dev, provide a default for manual builds:
#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif

[Setup]
AppVersion={#AppVersion}
OutputBaseFilename=FuzzyClockSetup-{#AppVersion}
```

### Pattern 7: Checksums Generation

**What:** PowerShell `Get-FileHash` produces SHA256 hashes. Write both hashes to a single `checksums.txt`.

**Example:**
```yaml
- name: Generate checksums
  shell: pwsh
  run: |
    $ver = "${{ steps.version.outputs.version }}"
    $exe = "publish/FuzzyClock-$ver.exe"
    $setup = "installer/FuzzyClockSetup-$ver.exe"
    $hash1 = (Get-FileHash $exe -Algorithm SHA256).Hash
    $hash2 = (Get-FileHash $setup -Algorithm SHA256).Hash
    @"
    SHA256 ($exe) = $hash1
    SHA256 ($setup) = $hash2
    "@ | Out-File -FilePath "checksums.txt" -Encoding utf8
```

### Pattern 8: Draft GitHub Release with Multiple Files

**What:** `softprops/action-gh-release@v2` with `draft: true` and multiline `files:` glob.

**Example:**
```yaml
- name: Create draft GitHub Release
  uses: softprops/action-gh-release@v2
  with:
    draft: true
    generate_release_notes: true
    files: |
      publish/FuzzyClock-${{ steps.version.outputs.version }}.exe
      installer/FuzzyClockSetup-${{ steps.version.outputs.version }}.exe
      checksums.txt
```

### Anti-Patterns to Avoid

- **Hardcoding AppVersion in .iss:** Breaks reproducibility — always use `#define AppVersion` injected by CI.
- **Including settings directory in `[Dirs]`:** If `{localappdata}\FuzzyClock` is listed in `[Dirs]`, Inno Setup's uninstaller will remove it. The settings dir must never be listed in `[Dirs]` so the uninstaller leaves it alone by default.
- **Using `CloseApplications=yes` instead of `AppMutex`:** `CloseApplications` uses Windows Restart Manager to find processes holding file locks — it only fires when files are actually locked. `AppMutex` fires at installer startup regardless, which is the right behavior (show the dialog before any file operations start).
- **Not setting `AppId` GUID:** Without a stable `AppId`, each installer run registers as a new app in Add/Remove Programs instead of updating the existing entry. Generate a GUID once and commit it.
- **Putting installer output inside `publish/`:** The installer step reads from `publish/` as its source dir. If its output also goes to `publish/`, the path conflicts. Use a separate `installer/` output directory.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detect running instance | Process enumeration or `FindWindow` Pascal code | `AppMutex` directive | Built-in, uses the mutex the app already maintains |
| Finish page launch checkbox | Custom wizard page | `[Run]` `postinstall` flag | Built-in Inno Setup feature; one line |
| Add/Remove Programs registration | Manual registry writes | Inno Setup automatic (with `AppId` + `AppPublisher`) | Inno Setup handles all HKCU uninstall key writes automatically |
| SHA256 checksums | Separate action or third-party tool | PowerShell `Get-FileHash` | Available on all `windows-latest` runners, no install needed |
| Draft release upload | Custom GitHub API calls | `softprops/action-gh-release@v2` | Already in use; supports `draft: true` natively |

**Key insight:** Inno Setup handles ~80% of the requirements via built-in directives. Only the optional-remove-settings uninstall checkbox and the HKCU Run update require Pascal script.

---

## Common Pitfalls

### Pitfall 1: AppId GUID Changed Between Releases

**What goes wrong:** Inno Setup uses `AppId` to match an existing installation. If the GUID changes, the new installer creates a second Add/Remove Programs entry instead of updating the old one. Users end up with duplicate entries.

**Why it happens:** Developer regenerates the GUID per-build, or uses a variable instead of a hardcoded value.

**How to avoid:** Generate a GUID once (e.g. with PowerShell `[guid]::NewGuid()` or online generator), hardcode it in the `.iss` file, never change it.

**Warning signs:** Two "FuzzyClock" entries in Settings > Apps after upgrading.

### Pitfall 2: Uninstaller Removes Settings Directory

**What goes wrong:** If `{localappdata}\FuzzyClock` is listed in `[Dirs]`, the uninstaller deletes it (and `settings.json` with it) even when the user did not check the "Also remove settings" checkbox.

**Why it happens:** Inno Setup automatically removes directories listed in `[Dirs]` during uninstall.

**How to avoid:** Never list the settings directory in `[Dirs]`. The install dir (`{localappdata}\Programs\FuzzyClock`) goes in `[Dirs]`; the settings dir does not.

**Warning signs:** `settings.json` disappears after uninstall even with checkbox unchecked.

### Pitfall 3: Version Not Propagated to AssemblyVersion

**What goes wrong:** `dotnet publish /p:Version=3.3.0` sets `InformationalVersion` but may not update `AssemblyVersion` and `FileVersion` unless explicitly set.

**Why it happens:** The `.csproj` has hardcoded `<AssemblyVersion>3.0.0.0</AssemblyVersion>` and `<FileVersion>3.0.0.0</FileVersion>`. `/p:Version=` alone sets the package version and `InformationalVersion`, but `AssemblyVersion` is a separate property.

**How to avoid:** Pass three properties: `/p:Version=3.3.0 /p:AssemblyVersion=3.3.0.0 /p:FileVersion=3.3.0.0`

**Warning signs:** Right-clicking the EXE in Explorer shows "3.0.0.0" in file properties even after releasing 3.3.0.

### Pitfall 4: ISCC.exe Path on Windows Runners

**What goes wrong:** `iscc FuzzyClock.iss` fails because the Inno Setup directory is not on PATH.

**Why it happens:** Inno Setup is installed but its bin directory is not added to the system PATH on the GitHub runner.

**How to avoid:** Use the full path: `"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"`. Alternatively use `shell: cmd` with the full quoted path.

**Warning signs:** `iscc: command not found` or similar error in CI.

### Pitfall 5: Bash vs PowerShell String Interpolation in Workflow

**What goes wrong:** `${{ steps.version.outputs.version }}` is evaluated by GitHub Actions before the shell sees the command — but multi-step version extraction must use `$GITHUB_OUTPUT` correctly.

**Why it happens:** `echo "version=3.3.0" >> $GITHUB_OUTPUT` is the correct pattern; `set-output` is deprecated since 2022.

**How to avoid:** Always use `>> "$GITHUB_OUTPUT"` for step outputs. Use `${{ steps.step-id.outputs.output-name }}` syntax in subsequent steps.

**Warning signs:** Subsequent steps see empty string for `steps.version.outputs.version`.

### Pitfall 6: Finish Page Checkbox is Opt-Out by Default

**What goes wrong:** The CONTEXT says "Launch FuzzyClock" is a checkbox on the finish page. Without the `unchecked` flag, Inno Setup shows it **checked** by default. This is the correct behavior per the decisions ("leaving it checked launches the app") — so this is only a pitfall if someone adds `unchecked` flag incorrectly.

**How to avoid:** Do NOT add the `unchecked` flag. The checkbox should be checked by default.

---

## Code Examples

### Complete Minimal FuzzyClock.iss Structure

```ini
; Source: Research synthesis from https://jrsoftware.org/ishelp/

; Version injected by CI: ISCC /DAppVersion=3.3.0 FuzzyClock.iss
; For local/dev builds:
#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif
; SourceDir is the dotnet publish output folder, injected by CI
#ifndef SourceDir
  #define SourceDir "publish"
#endif

[Setup]
AppId={{GENERATE-ONE-GUID-AND-HARDCODE-IT}
AppName=FuzzyClock
AppVersion={#AppVersion}
AppPublisher=Alex Tabisz
AppPublisherURL=https://github.com/altabisz/FuzzyStatsClock
AppSupportURL=https://github.com/altabisz/FuzzyStatsClock/issues
DefaultDirName={localappdata}\Programs\FuzzyClock
DefaultGroupName=FuzzyClock
PrivilegesRequired=lowest
OutputDir=installer
OutputBaseFilename=FuzzyClockSetup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
AppMutex=FuzzyClock_SingleInstance_v1
UninstallDisplayName=FuzzyClock

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#SourceDir}\FuzzyClock.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\FuzzyClock"; Filename: "{app}\FuzzyClock.exe"

[Run]
Filename: "{app}\FuzzyClock.exe"; \
    Description: "Launch FuzzyClock"; \
    Flags: postinstall nowait skipifsilent

[Code]
{ --- Auto-launch registry update on upgrade (INST-06) --- }
procedure CurStepChanged(CurStep: TSetupStep);
var
  RunKeyPath: string;
  ExePath: string;
begin
  if CurStep = ssPostInstall then
  begin
    RunKeyPath := 'SOFTWARE\Microsoft\Windows\CurrentVersion\Run';
    ExePath := ExpandConstant('{app}\FuzzyClock.exe');
    if RegValueExists(HKEY_CURRENT_USER, RunKeyPath, 'FuzzyClock') then
      RegWriteStringValue(HKEY_CURRENT_USER, RunKeyPath, 'FuzzyClock', ExePath);
  end;
end;

{ --- Optional "remove settings" checkbox on uninstall (INST-09) --- }
var
  RemoveSettingsCheckbox: TNewCheckBox;

procedure InitializeUninstallProgressForm();
begin
  RemoveSettingsCheckbox := TNewCheckBox.Create(UninstallProgressForm);
  RemoveSettingsCheckbox.Parent := UninstallProgressForm;
  RemoveSettingsCheckbox.Caption := 'Also remove my settings (settings.json)';
  RemoveSettingsCheckbox.Checked := False;
  RemoveSettingsCheckbox.Left  := UninstallProgressForm.StatusLabel.Left;
  RemoveSettingsCheckbox.Top   := UninstallProgressForm.StatusLabel.Top +
                                   UninstallProgressForm.StatusLabel.Height + 8;
  RemoveSettingsCheckbox.Width := UninstallProgressForm.StatusLabel.Width;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  SettingsDir: string;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if Assigned(RemoveSettingsCheckbox) and RemoveSettingsCheckbox.Checked then
    begin
      SettingsDir := ExpandConstant('{localappdata}\FuzzyClock');
      DelTree(SettingsDir, True, True, True);
    end;
  end;
end;
```

### Complete Updated release.yml

```yaml
# Source: existing .github/workflows/release.yml + research
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: windows-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'

      - name: Extract version from tag
        id: version
        shell: bash
        run: |
          TAG="${GITHUB_REF#refs/tags/v}"
          IFS='.' read -ra PARTS <<< "$TAG"
          MAJOR="${PARTS[0]:-0}"
          MINOR="${PARTS[1]:-0}"
          PATCH="${PARTS[2]:-0}"
          echo "version=$MAJOR.$MINOR.$PATCH" >> "$GITHUB_OUTPUT"

      - name: Restore
        run: dotnet restore -r win-x64 -p:PublishReadyToRun=true

      - name: Test
        run: dotnet test --no-restore --configuration Release

      - name: Publish EXE
        run: >
          dotnet publish FuzzyClock.App
          -r win-x64
          -c Release
          --no-restore
          --self-contained true
          -p:PublishSingleFile=true
          -p:PublishReadyToRun=true
          -p:IncludeNativeLibrariesForSelfExtract=true
          -p:Version=${{ steps.version.outputs.version }}
          -p:AssemblyVersion=${{ steps.version.outputs.version }}.0
          -p:FileVersion=${{ steps.version.outputs.version }}.0
          -o publish/

      - name: Rename EXE artifact
        shell: bash
        run: mv publish/FuzzyClock.exe "publish/FuzzyClock-${{ steps.version.outputs.version }}.exe"

      - name: Compile installer
        shell: cmd
        run: >
          "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
          /DAppVersion=${{ steps.version.outputs.version }}
          /DSourceDir=publish
          FuzzyClock.iss

      - name: Generate checksums
        shell: pwsh
        run: |
          $ver = "${{ steps.version.outputs.version }}"
          $exe   = "publish/FuzzyClock-$ver.exe"
          $setup = "installer/FuzzyClockSetup-$ver.exe"
          $h1 = (Get-FileHash $exe   -Algorithm SHA256).Hash
          $h2 = (Get-FileHash $setup -Algorithm SHA256).Hash
          "SHA256 ($exe) = $h1`nSHA256 ($setup) = $h2" |
            Out-File -FilePath checksums.txt -Encoding utf8

      - name: Create draft GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          draft: true
          generate_release_notes: true
          files: |
            publish/FuzzyClock-${{ steps.version.outputs.version }}.exe
            installer/FuzzyClockSetup-${{ steps.version.outputs.version }}.exe
            checksums.txt
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `set-output` in GitHub Actions | `>> "$GITHUB_OUTPUT"` | Sep 2022 | Old syntax still works but deprecated; new syntax required |
| `softprops/action-gh-release@v1` | `@v2` | 2023 | v2 is current; v1 still works but unmaintained |
| `echo "::set-output name=…"` | `echo "name=value" >> "$GITHUB_OUTPUT"` | Sep 2022 | Deprecation warning in CI logs if old syntax used |

**Deprecated/outdated:**
- `set-output` command: replaced by `$GITHUB_OUTPUT` file append
- `save-state` command: replaced by `$GITHUB_STATE` file append

---

## Open Questions

1. **Does `UninstallProgressForm` show a confirmation dialog before the progress bar?**
   - What we know: `InitializeUninstallProgressForm` fires at uninstall form startup; the checkbox will appear during uninstall progress display.
   - What's unclear: Whether the checkbox is visible *before* the user confirms uninstall, or only during the progress bar phase. If only during progress, the user may not see it in time to check it.
   - Recommendation: Test locally. If timing is wrong, use `InitializeUninstall()` to show a `MsgBox` with a custom dialog asking about settings removal as a fallback.

2. **AssemblyVersion 4-part vs 3-part padding**
   - What we know: AssemblyVersion requires 4 parts (`X.Y.Z.0`). The tag is 2–3 parts.
   - What's unclear: Whether `/p:AssemblyVersion=3.3.0.0` overrides the `.csproj` `<AssemblyVersion>` correctly.
   - Recommendation: Pass explicitly as shown in the code example. Verify with `sigcheck` or file properties after first test run.

3. **Inno Setup `{app}` path on first vs subsequent installs**
   - What we know: `DefaultDirName={localappdata}\Programs\FuzzyClock` is presented to the user who can change it.
   - What's unclear: If a user customizes the path, `ExpandConstant('{app}')` in Pascal still returns the actual install path chosen — this is correct behavior.
   - Recommendation: No action needed; `{app}` always reflects the actual chosen install directory.

---

## Sources

### Primary (HIGH confidence)

- Inno Setup Help — PrivilegesRequired: https://jrsoftware.org/ishelp/topic_setup_privilegesrequired.htm — confirmed `lowest` for per-user installs
- Inno Setup Help — AppMutex: https://jrsoftware.org/ishelp/topic_setup_appmutex.htm — confirmed mutex name detection mechanism
- Inno Setup Help — CloseApplications: https://jrsoftware.org/ishelp/topic_setup_closeapplications.htm — confirmed `yes`/`no`/`force` values
- Inno Setup Help — [Run] section postinstall flag: https://jrsoftware.org/ishelp/topic_runsection.htm — confirmed `postinstall`, `nowait`, `unchecked` flags
- Inno Setup Help — Script events: https://jrsoftware.org/ishelp/topic_scriptevents.htm — confirmed `InitializeUninstallProgressForm`, `CurUninstallStepChanged`, `CurStepChanged`
- `softprops/action-gh-release` README: https://github.com/softprops/action-gh-release — confirmed `draft: true`, multiline `files:`, `generate_release_notes`
- GitHub Actions runner images README — Inno Setup 6.7.1 pre-installed on `windows-latest`
- `FuzzyClock.App/App.xaml.cs` — mutex name is `FuzzyClock_SingleInstance_v1`
- `FuzzyClock.App/AutoLaunchService.cs` — HKCU Run key path and value name `FuzzyClock`
- `.github/workflows/release.yml` — existing workflow structure (trigger, dotnet version, publish flags, release action)

### Secondary (MEDIUM confidence)

- Inno Setup general feature overview: https://jrsoftware.org/isinfo.php — version availability, Windows 11 support confirmed

### Tertiary (LOW confidence)

- `InitializeUninstallProgressForm` checkbox positioning — exact pixel offsets may need adjustment; pattern derived from script events documentation and common usage, not a direct code example from official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Inno Setup directives confirmed via official docs; GitHub Actions action confirmed via repo README
- Architecture: HIGH — all key directives (`AppMutex`, `PrivilegesRequired=lowest`, `[Run] postinstall`) verified via official Inno Setup help
- Pitfalls: HIGH — `AppId` stability, settings dir exclusion from `[Dirs]`, ISCC path are well-known Inno Setup gotchas confirmed by docs
- Pascal uninstall checkbox: MEDIUM — pattern is standard but exact form property layout needs local testing

**Research date:** 2026-03-18
**Valid until:** 2026-09-18 (Inno Setup stable; GitHub Actions actions stable)
