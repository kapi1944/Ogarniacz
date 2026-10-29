#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define MyAppName "Ogarniacz"
[Setup]
AppId={{5C14B35A-38BC-461F-8798-507EA25A4496}
AppName={#MyAppName}
AppVersion={#AppVersion}
AppPublisher=Ogarniacz
SetupIconFile=..\public\favicon.ico
DefaultDirName={localappdata}\Programs\Ogarniacz
DefaultGroupName=Ogarniacz
PrivilegesRequired=lowest
OutputDir=..\artifacts\windows
OutputBaseFilename=Ogarniacz-{#AppVersion}-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Ogarniacz
[Files]
Source: "..\artifacts\windows\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autoprograms}\Ogarniacz"; Filename: "{app}\Ogarniacz.Desktop.exe"
Name: "{autodesktop}\Ogarniacz"; Filename: "{app}\Ogarniacz.Desktop.exe"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Utwórz skrót na pulpicie"; GroupDescription: "Skróty:"
[Run]
Filename: "{app}\Ogarniacz.Desktop.exe"; Description: "Uruchom Ogarniacza"; Flags: nowait postinstall skipifsilent
