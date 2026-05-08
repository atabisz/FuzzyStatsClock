; FuzzyClock Inno Setup installer script
; Version injected by CI: ISCC /DAppVersion=X.Y.Z /DSourceDir=publish FuzzyClock.iss
; For local/dev builds, defaults are used:
#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif
#ifndef SourceDir
  #define SourceDir "publish"
#endif

[Setup]
AppId={{B8F2E3A1-7C4D-4E5F-9A6B-1D2E3F4A5B6C}
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
Source: "THIRD-PARTY-NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\FuzzyClock"; Filename: "{app}\FuzzyClock.exe"

[Run]
Filename: "{app}\FuzzyClock.exe"; Description: "Launch FuzzyClock"; Flags: postinstall nowait skipifsilent

[Code]
{ --- Auto-launch registry update on upgrade (INST-06) --- }
{ If the user had auto-launch enabled, rewrite the HKCU Run entry to point }
{ to the (potentially new) install path after an upgrade.                   }
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
