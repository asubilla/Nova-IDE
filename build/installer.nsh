; ═══════════════════════════════════════════════════════════════════════════════
; Nova IDE - NSIS Installer Script
; Only uses valid electron-builder NSIS hook macros
; ═══════════════════════════════════════════════════════════════════════════════

; ─── customInit: Runs in .onInit ─────────────────────────────────────────────
!macro customInit
  SetDetailsView show
!macroend

; ─── customInstall: Runs after files are installed ───────────────────────────
!macro customInstall
  DetailPrint ""
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Nova IDE - Finalizing Installation"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint ""

  DetailPrint "[1/3] Creating desktop shortcut..."
  CreateShortCut "$DESKTOP\Nova IDE.lnk" "$INSTDIR\Nova IDE.exe" "" "$INSTDIR\Nova IDE.exe" 0
  DetailPrint "  [OK] Done"

  DetailPrint "[2/3] Creating Start Menu entries..."
  CreateDirectory "$SMPROGRAMS\Nova IDE"
  CreateShortCut "$SMPROGRAMS\Nova IDE\Nova IDE.lnk" "$INSTDIR\Nova IDE.exe" "" "$INSTDIR\Nova IDE.exe" 0
  DetailPrint "  [OK] Done"

  DetailPrint "[3/3] Writing registry entries..."
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "DisplayName" "Nova IDE"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "DisplayIcon" "$\"$INSTDIR\Nova IDE.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "Publisher" "asubilla"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "NoRepair" 1
  DetailPrint "  [OK] Done"

  DetailPrint ""
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Installation Complete!"
  DetailPrint "  Location: $INSTDIR"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
!macroend

; ─── customUnInstall: Runs during uninstall ──────────────────────────────────
!macro customUnInstall
  DetailPrint ""
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Nova IDE - Uninstalling"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint ""

  DetailPrint "[1/3] Removing desktop shortcut..."
  Delete "$DESKTOP\Nova IDE.lnk"
  DetailPrint "  [OK] Done"

  DetailPrint "[2/3] Removing Start Menu entries..."
  RMDir /r "$SMPROGRAMS\Nova IDE"
  DetailPrint "  [OK] Done"

  DetailPrint "[3/3] Removing registry entries..."
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE"
  DetailPrint "  [OK] Done"

  DetailPrint ""
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Uninstallation Complete!"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
!macroend
