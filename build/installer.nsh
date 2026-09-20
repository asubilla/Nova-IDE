; ═══════════════════════════════════════════════════════════════════════════════
; Nova IDE - NSIS Installer Script
; Real-time file progress, shortcuts, PATH, registry
; ═══════════════════════════════════════════════════════════════════════════════

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

Var AddToPath
Var CreateDesktopShortcut
Var CreateStartMenuShortcut

; ─── PreInit: Check running app + previous install ───────────────────────────
!macro customInit
  nsExec::ExecToLog 'tasklist /FI "IMAGENAME eq Nova IDE.exe" /NH'
  Pop $0
  ${If} $0 == "0"
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Nova IDE is already running.$\n$\nPlease close it before continuing installation." IDOK continueInstall IDCANCEL abortInstall
    abortInstall:
      Abort
    continueInstall:
  ${EndIf}

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "InstallLocation"
  ${If} $0 != ""
    MessageBox MB_YESNO|MB_ICONQUESTION "Nova IDE is already installed at:$\n$0$\n$\nDo you want to reinstall it?" IDYES continueInstall IDCANCEL abortReinstall
    abortReinstall:
      Abort
  ${EndIf}

  SetDetailsView show
!macroend

; ─── Post-Install: Shortcuts, PATH, Registry ─────────────────────────────────
!macro customInitFinish
  DetailPrint ""
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Nova IDE v${VERSION} - Finalizing Installation"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint ""

  DetailPrint "[1/6] Creating uninstaller..."
  DetailPrint "  -> $INSTDIR\uninstall.exe"
  WriteUninstaller "$INSTDIR\uninstall.exe"
  DetailPrint "  [OK] Done"
  DetailPrint ""

  DetailPrint "[2/6] Adding Nova IDE to system PATH..."
  DetailPrint "  -> $INSTDIR"
  EnVar::AddValue "PATH" "$INSTDIR"
  DetailPrint "  [OK] PATH updated"
  DetailPrint ""

  DetailPrint "[3/6] Creating desktop shortcut..."
  DetailPrint "  -> $DESKTOP\Nova IDE.lnk"
  CreateShortCut "$DESKTOP\Nova IDE.lnk" "$INSTDIR\Nova IDE.exe" "" "$INSTDIR\Nova IDE.exe" 0
  DetailPrint "  [OK] Done"
  DetailPrint ""

  DetailPrint "[4/6] Creating Start Menu entries..."
  DetailPrint "  -> $SMPROGRAMS\Nova IDE"
  CreateDirectory "$SMPROGRAMS\Nova IDE"
  CreateShortCut "$SMPROGRAMS\Nova IDE\Nova IDE.lnk" "$INSTDIR\Nova IDE.exe" "" "$INSTDIR\Nova IDE.exe" 0
  CreateShortCut "$SMPROGRAMS\Nova IDE\Uninstall Nova IDE.lnk" "$INSTDIR\uninstall.exe"
  DetailPrint "  [OK] Done"
  DetailPrint ""

  DetailPrint "[5/6] Writing registry entries..."
  DetailPrint "  -> HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "DisplayName" "Nova IDE"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "DisplayIcon" "$\"$INSTDIR\Nova IDE.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "Publisher" "asubilla"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "URLInfoAbout" "https://github.com/asubilla/Nova-IDE"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "NoRepair" 1
  DetailPrint "  [OK] Done"
  DetailPrint ""

  DetailPrint "[6/6] Calculating installed size..."
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "EstimatedSize" "$0"
  DetailPrint "  [OK] Done"
  DetailPrint ""

  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Installation Complete!"
  DetailPrint "  Location: $INSTDIR"
  DetailPrint "  Version:  ${VERSION}"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
!macroend

; ─── Uninstall: Remove everything with progress ──────────────────────────────
!macro customUnInit
  DetailPrint ""
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Nova IDE - Uninstalling"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint ""

  DetailPrint "[1/5] Removing from system PATH..."
  DetailPrint "  -> $INSTDIR"
  EnVar::RemoveValue "PATH" "$INSTDIR"
  DetailPrint "  [OK] Done"
  DetailPrint ""

  DetailPrint "[2/5] Removing desktop shortcut..."
  DetailPrint "  -> $DESKTOP\Nova IDE.lnk"
  Delete "$DESKTOP\Nova IDE.lnk"
  DetailPrint "  [OK] Done"
  DetailPrint ""

  DetailPrint "[3/5] Removing Start Menu entries..."
  DetailPrint "  -> $SMPROGRAMS\Nova IDE"
  RMDir /r "$SMPROGRAMS\Nova IDE"
  DetailPrint "  [OK] Done"
  DetailPrint ""

  DetailPrint "[4/5] Removing registry entries..."
  DetailPrint "  -> HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE"
  DetailPrint "  [OK] Done"
  DetailPrint ""

  DetailPrint "[5/5] Removing installed files..."
  DetailPrint "  -> Scanning $INSTDIR"
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  DetailPrint "    Found: $1 files, $2 folders, $0 KB"
  DetailPrint "  -> Deleting all files..."
  RMDir /r "$INSTDIR"
  DetailPrint "  [OK] All files removed"
  DetailPrint ""

  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Uninstallation Complete!"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
!macroend
