!macro customInit
  ; Check if already running
  nsExec::ExecToLog 'tasklist /FI "IMAGENAME eq Nova IDE.exe" /NH'
  Pop $0
  ${If} $0 == "0"
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Nova IDE is already running.$\n$\nPlease close it before installing." IDOK continueInstall IDCANCEL abortInstall
    abortInstall:
      Abort
    continueInstall:
  ${EndIf}
!macroend

!macro customInstallMode
  ; Default to per-user install
  StrCpy $isForceCurrentInstallMode "1"
!macroend

!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Nova IDE Setup"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of Nova IDE.$\n$\nNova IDE is an autonomous AI-powered development environment with 147+ parallel agents.$\n$\nClick Next to continue."
!macroend

!macro customInitFinish
  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  ; Add to PATH (per-user)
  EnVar::AddValue "PATH" "$INSTDIR"
  
  ; Registry entries for uninstaller
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "DisplayName" "Nova IDE"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "DisplayIcon" "$\"$INSTDIR\Nova IDE.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "Publisher" "asubilla"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "DisplayVersion" "${VERSION}"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "NoRepair" 1
!macroend

!macro customUnInit
  ; Remove from PATH
  EnVar::RemoveValue "PATH" "$INSTDIR"
  
  ; Remove registry entries
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE"
  
  ; Remove installed files
  RMDir /r "$INSTDIR"
!macroend
