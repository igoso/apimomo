# Custom NSIS include script, auto-detected by electron-builder at build/installer.nsh.
# Works together with the "nsis" options in package.json:
#   oneClick: false, perMachine: false, allowElevation: false,
#   allowToChangeInstallationDirectory: true
#
# Forces a per-user installation and skips the install-mode selection page, so the
# setup runs as a plain wizard (choose install dir -> install -> finish), installs to
# %LOCALAPPDATA%\Programs\ApiMomo by default and never requests administrator rights.

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
