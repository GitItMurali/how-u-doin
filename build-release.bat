@echo off
REM ============================================================
REM build-release.bat -- Phase 8 Flow B: local release APK
REM Signed with the debug keystore (RN template default) --
REM fine for sideloading; keep the keystore for in-place upgrades.
REM Run fix-android.bat first after ANY prebuild.
REM ============================================================
cd /d C:\dev\how-u-doin

if not exist android\gradle\wrapper\gradle-wrapper.properties (
  echo [!] android\ missing or incomplete.
  echo     Run: npx expo prebuild --platform android --clean
  echo     Then: fix-android.bat
  echo     Then re-run this script.
  exit /b 1
)

findstr /C:"distributionUrl=https\://services.gradle.org/distributions/gradle-8.13-bin.zip" android\gradle\wrapper\gradle-wrapper.properties >nul
if errorlevel 1 (
  echo [!] Gradle is not pinned to 8.13 ^(BUILD-04^). Run fix-android.bat first.
  exit /b 1
)

findstr /C:"newArchEnabled=false" android\gradle.properties >nul
if errorlevel 1 (
  echo [!] newArchEnabled is not false in android\gradle.properties ^(RUNTIME-01^).
  echo     Run fix-android.bat first.
  exit /b 1
)

if not exist android\local.properties (
  echo [!] android\local.properties missing ^(BUILD-05^). Run fix-android.bat first.
  exit /b 1
)

echo [*] Building release APK...
cd android
call gradlew.bat assembleRelease
if errorlevel 1 (
  echo.
  echo [!] BUILD FAILED.
  echo     clang "CreateProcess error=5"? Just re-run this script ^(BUILD-11 -- transient^).
  exit /b 1
)

echo.
echo ============================================================
echo [OK] APK ready:
echo   C:\dev\how-u-doin\android\app\build\outputs\apk\release\app-release.apk
echo.
echo Install (device connected, USB debugging on):
echo   "%%LOCALAPPDATA%%\Android\Sdk\platform-tools\adb.exe" install -r android\app\build\outputs\apk\release\app-release.apk
echo.
echo NOTE: uninstall the DEBUG build first if "signatures do not match".
echo ============================================================
