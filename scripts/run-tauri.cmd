@echo off
setlocal

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
  echo vswhere.exe not found. Install Visual Studio 2022 Build Tools or Community with C++ tools.
  exit /b 1
)

for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
  set "VSINSTALL=%%i"
)

if not defined VSINSTALL (
  echo Visual Studio with MSVC tools was not found.
  exit /b 1
)

set "VSCMD=%VSINSTALL%\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VSCMD%" (
  echo vcvars64.bat not found at "%VSCMD%".
  exit /b 1
)

call "%VSCMD%" >nul
if errorlevel 1 (
  echo Failed to initialize MSVC environment.
  exit /b 1
)

call npx tauri %*
