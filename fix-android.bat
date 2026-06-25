@echo off
REM ============================================================
REM  fix-android.bat  --  How U Doin Android build fixer
REM  Re-applies the two files that "npx expo run:android" wipes
REM  every time it regenerates the android/ folder on prebuild.
REM
REM   BUILD-04: pin Gradle wrapper to 8.13 (9.x breaks RN plugin)
REM   BUILD-05: recreate local.properties (SDK location)
REM
REM  Run this AFTER prebuild has created android/ but BEFORE the
REM  Gradle build runs -- or just run it then re-run the build.
REM ============================================================

setlocal

set "PROJ=%~dp0"
set "WRAPPER=%PROJ%android\gradle\wrapper\gradle-wrapper.properties"
set "LOCALPROPS=%PROJ%android\local.properties"
REM Use FORWARD slashes for sdk.dir -- AGP's SdkLocator accepts them on Windows
REM and they avoid the backslash-escaping bug in .properties files that throws
REM "java.io.IOException: The filename, directory name, or volume label syntax is incorrect"
set "SDKDIR=C:/Users/mural/AppData/Local/Android/Sdk"

if not exist "%PROJ%android" (
    echo [!] android\ folder not found. Run "npx expo prebuild" or "npx expo run:android" first.
    exit /b 1
)

echo [*] Pinning Gradle wrapper to 8.13 ...
(
echo distributionBase=GRADLE_USER_HOME
echo distributionPath=wrapper/dists
echo distributionUrl=https\://services.gradle.org/distributions/gradle-8.13-bin.zip
echo networkTimeout=10000
echo validateDistributionUrl=true
echo zipStoreBase=GRADLE_USER_HOME
echo zipStorePath=wrapper/dists
) > "%WRAPPER%"

echo [*] Writing android\local.properties ...
echo sdk.dir=%SDKDIR%> "%LOCALPROPS%"

echo.
echo [OK] Build files re-applied:
echo     - %WRAPPER%
echo     - %LOCALPROPS%
echo.
echo Verify:
type "%WRAPPER%" | findstr distributionUrl
type "%LOCALPROPS%"
echo.
echo Now run:  npx expo run:android

endlocal
