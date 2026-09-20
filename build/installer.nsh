; ═══════════════════════════════════════════════════════════════════════════════
; Nova IDE - Professional NSIS Installer Script
; Features: License, Components, Progress %, Details, Finish Page, Auto-Path
;           Directory Browser (any drive/folder), Real-time File Progress
; ═══════════════════════════════════════════════════════════════════════════════

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

; ─── Variables ────────────────────────────────────────────────────────────────
Var AddToPath
Var CreateDesktopShortcut
Var CreateStartMenuShortcut
Var InstallMode
Var ProgressText

; ─── Installer Page Customization ─────────────────────────────────────────────
; Show detailed file operations during install
!define MUI_INSTFILES_PAGE_HEADER "Installing Nova IDE..."
!define MUI_INSTFILES_PAGE_HEADER_SUB "Please wait while Nova IDE is being installed..."
!define MUI_INSTFILES_PAGE_FINISH "Nova IDE has been installed successfully!"

; ─── Directory Page Customization ─────────────────────────────────────────────
!define MUI_DIRECTORYPAGE_TEXT_TOP "Choose the folder where Nova IDE will be installed.$\n$\nYou can install to any drive (C:, D:, E:, etc.) or browse to any custom folder.$\n$\nClick Browse to select a different location."
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "Destination Folder"

; ─── Custom Init ──────────────────────────────────────────────────────────────
!macro customInit
  ; Check if already running
  nsExec::ExecToLog 'tasklist /FI "IMAGENAME eq Nova IDE.exe" /NH'
  Pop $0
  ${If} $0 == "0"
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Nova IDE is already running.$\n$\nPlease close it before continuing installation." IDOK continueInstall IDCANCEL abortInstall
    abortInstall:
      Abort
    continueInstall:
  ${EndIf}

  ; Check for previous installation
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "InstallLocation"
  ${If} $0 != ""
    MessageBox MB_YESNO|MB_ICONQUESTION "Nova IDE is already installed at:$\n$0$\n$\nDo you want to reinstall it?" IDYES reinstallInit IDNO abortReinstall
    abortReinstall:
      Abort
    reinstallInit:
  ${EndIf}

  ; Show detail view for real-time file progress
  SetDetailsView show
!macroend

; ─── Custom Install Mode ─────────────────────────────────────────────────────
!macro customInstallMode
  ; Default to per-user install
  StrCpy $isForceCurrentInstallMode "1"
!macroend

; ─── Custom Header (Welcome Page) ────────────────────────────────────────────
!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Nova IDE Setup"
  !define MUI_WELCOMEPAGE_TEXT "Nova IDE - Autonomous AI-Powered Development Environment$\n$\nVersion: ${VERSION}$\n$\nFeatures:$\n  • 147+ Parallel AI Agents$\n  • Real-time Code Generation$\n  • Monaco Code Editor$\n  • Built-in Terminal & Git$\n  • MCP/LSP Plugin Support$\n  • BYOK/BYOA Configuration$\n$\nThis wizard will guide you through the installation.$\n$\nClick Next to continue."
!macroend

; ─── Custom PreInit ──────────────────────────────────────────────────────────
!macro customPreInit
  ; Set default component states
  StrCpy $AddToPath "1"
  StrCpy $CreateDesktopShortcut "1"
  StrCpy $CreateStartMenuShortcut "1"
!macroend

; ─── Custom InitFinish (Post-Install) ────────────────────────────────────────
; This runs AFTER electron-builder copies all files
!macro customInitFinish
  DetailPrint ""
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Nova IDE v${VERSION} - Finalizing Installation"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint ""

  ; ── Step 1: Create Uninstaller ──
  DetailPrint "[1/6] Creating uninstaller..."
  DetailPrint "  -> Writing uninstall.exe to $INSTDIR"
  WriteUninstaller "$INSTDIR\uninstall.exe"
  DetailPrint "  [OK] Uninstaller created successfully"
  DetailPrint ""

  ; ── Step 2: Add to PATH ──
  ${If} $AddToPath == "1"
    DetailPrint "[2/6] Adding Nova IDE to system PATH..."
    DetailPrint "  -> PATH location: $INSTDIR"
    EnVar::AddValue "PATH" "$INSTDIR"
    ${If} $0 == "0"
      DetailPrint "  [OK] Added to PATH successfully"
    ${Else}
      DetailPrint "  [WARN] Could not add to PATH - may need manual configuration"
    ${EndIf}
  ${Else}
    DetailPrint "[2/6] Skipping PATH (user declined)"
  ${EndIf}
  DetailPrint ""

  ; ── Step 3: Create Desktop Shortcut ──
  ${If} $CreateDesktopShortcut == "1"
    DetailPrint "[3/6] Creating desktop shortcut..."
    DetailPrint "  -> Target: $INSTDIR\Nova IDE.exe"
    DetailPrint "  -> Location: $DESKTOP\Nova IDE.lnk"
    CreateShortCut "$DESKTOP\Nova IDE.lnk" "$INSTDIR\Nova IDE.exe" "" "$INSTDIR\Nova IDE.exe" 0
    DetailPrint "  [OK] Desktop shortcut created"
  ${Else}
    DetailPrint "[3/6] Skipping desktop shortcut (user declined)"
  ${EndIf}
  DetailPrint ""

  ; ── Step 4: Create Start Menu Shortcuts ──
  ${If} $CreateStartMenuShortcut == "1"
    DetailPrint "[4/6] Creating Start Menu entries..."
    DetailPrint "  -> Creating folder: $SMPROGRAMS\Nova IDE"
    CreateDirectory "$SMPROGRAMS\Nova IDE"
    DetailPrint "  -> Nova IDE.lnk"
    CreateShortCut "$SMPROGRAMS\Nova IDE\Nova IDE.lnk" "$INSTDIR\Nova IDE.exe" "" "$INSTDIR\Nova IDE.exe" 0
    DetailPrint "  -> Uninstall Nova IDE.lnk"
    CreateShortCut "$SMPROGRAMS\Nova IDE\Uninstall Nova IDE.lnk" "$INSTDIR\uninstall.exe"
    DetailPrint "  [OK] Start Menu entries created"
  ${Else}
    DetailPrint "[4/6] Skipping Start Menu (user declined)"
  ${EndIf}
  DetailPrint ""

  ; ── Step 5: Write Registry Entries ──
  DetailPrint "[5/6] Writing registry entries for Add/Remove Programs..."
  DetailPrint "  -> HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "DisplayName" "Nova IDE"
  DetailPrint "    DisplayName = Nova IDE"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  DetailPrint "    UninstallString = $\"$INSTDIR\uninstall.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "InstallLocation" "$INSTDIR"
  DetailPrint "    InstallLocation = $INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "DisplayIcon" "$\"$INSTDIR\Nova IDE.exe$\""
  DetailPrint "    DisplayIcon = Nova IDE.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "Publisher" "asubilla"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "URLInfoAbout" "https://github.com/asubilla/Nova-IDE"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "NoRepair" 1
  DetailPrint "  [OK] Registry entries written"
  DetailPrint ""

  ; ── Step 6: Calculate & Write Size ──
  DetailPrint "[6/6] Calculating installed size..."
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE" "EstimatedSize" "$0"
  DetailPrint "  [OK] Estimated size: $0 KB"
  DetailPrint ""

  ; ── Final Summary ──
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Installation Complete!"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Location: $INSTDIR"
  DetailPrint "  Version:  ${VERSION}"
  DetailPrint "  Status:   Ready to use!"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
!macroend

; ─── Custom UnInit (Uninstallation) ──────────────────────────────────────────
!macro customUnInit
  DetailPrint ""
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Nova IDE - Uninstallation"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint ""

  ; ── Step 1: Remove from PATH ──
  DetailPrint "[1/5] Removing Nova IDE from system PATH..."
  DetailPrint "  -> Removing: $INSTDIR"
  EnVar::RemoveValue "PATH" "$INSTDIR"
  ${If} $0 == "0"
    DetailPrint "  [OK] Removed from PATH"
  ${Else}
    DetailPrint "  [WARN] PATH entry not found or already removed"
  ${EndIf}
  DetailPrint ""

  ; ── Step 2: Remove Desktop Shortcut ──
  DetailPrint "[2/5] Removing desktop shortcut..."
  DetailPrint "  -> Deleting: $DESKTOP\Nova IDE.lnk"
  Delete "$DESKTOP\Nova IDE.lnk"
  DetailPrint "  [OK] Desktop shortcut removed"
  DetailPrint ""

  ; ── Step 3: Remove Start Menu Shortcuts ──
  DetailPrint "[3/5] Removing Start Menu entries..."
  DetailPrint "  -> Deleting: $SMPROGRAMS\Nova IDE\*.*"
  RMDir /r "$SMPROGRAMS\Nova IDE"
  DetailPrint "  [OK] Start Menu entries removed"
  DetailPrint ""

  ; ── Step 4: Remove Registry Entries ──
  DetailPrint "[4/5] Removing registry entries..."
  DetailPrint "  -> HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NovaIDE"
  DetailPrint "  [OK] Registry entries removed"
  DetailPrint ""

  ; ── Step 5: Remove Installed Files ──
  DetailPrint "[5/5] Removing installed files..."
  DetailPrint "  -> Scanning: $INSTDIR"
  DetailPrint "  -> Removing all files and folders..."

  ; List files before removal
  DetailPrint ""
  DetailPrint "  Files being removed:"
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  DetailPrint "    Total size: $0 KB ($1 files, $2 folders)"

  RMDir /r "$INSTDIR"
  DetailPrint "  [OK] All files removed"
  DetailPrint ""

  ; ── Final Summary ──
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Uninstallation Complete!"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DetailPrint "  Nova IDE has been completely removed."
  DetailPrint "  Thank you for using Nova IDE!"
  DetailPrint "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
!macroend
