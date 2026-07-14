# How U Doin — Dev Commands Reference

Quick access to all essential commands for development, debugging, and deployment.

---

## Core Development

| Command | Purpose |
|---------|---------|
| `npx expo run:android` | Run app on Android (simulator or device) |
| `npx expo prebuild --clean` | Regenerate native code (before first run or after dep changes) |
| `npx tsc --noEmit` | Type-check entire codebase (run BEFORE committing) |
| `npm start` | Start Metro bundler |
| `npx expo install --fix` | Fix/install native dependencies (never guess versions) |

---

## Android & Native Setup

| Command | Purpose |
|---------|---------|
| `fix-android.bat` | Apply Gradle fixes + set newArchEnabled=false (run after every prebuild) |
| `adb devices` | List connected devices/simulators |
| `adb logcat` | Stream device logs (use `-s` for specific device) |
| `adb pull /path/to/file` | Copy file from device to local |
| `adb install app.apk` | Install APK on device |

**Note:** `adb` is located at `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` (add to PATH or use full path)

---

## Debugging & Logs

| Command | Purpose |
|---------|---------|
| `npx expo run:android --local` | Run without clearing Metro cache |
| `adb logcat \| grep -i "error\|exception"` | Filter device logs for errors |
| `adb logcat -c` | Clear device logs |
| `adb shell dumpsys dbinfo` | Check SQLite database state |
| `npx expo doctor` | Diagnose environment issues |

---

## Build & Distribution

| Command | Purpose |
|---------|---------|
| `eas build --platform android` | Build via EAS (requires config) |
| `eas submit --platform android` | Submit to Play Store |
| `npx expo export` | Export for web (if applicable) |

---

## Common Troubleshooting

| Issue | Command | Notes |
|-------|---------|-------|
| `clang error=5` | Re-run `npx expo run:android` | Transient error, safe to retry |
| SQLite NPE on startup | Check `gradle.properties` newArchEnabled setting | Must be `false` for now |
| Stale index lock | Delete `node_modules/.expo` and re-run | Or use `npx expo install --fix` |
| Permission dialog not showing | Kill app, clear app data, restart | `adb shell pm clear <package>` |
| TypeScript errors past file end | Run Python strip on file | Fix NUL byte appends from Edit tool |

---

## Key Paths

| Path | Purpose |
|------|---------|
| `app.json` | Expo config |
| `eas.json` | EAS build config |
| `gradle.properties` | Android build settings (newArchEnabled, etc.) |
| `src/` | TypeScript/TSX source code |
| `src/lib/` | Shared utilities (toast, date, lockout, etc.) |
| `src/screens/` | Screen components |
| `src/db/` | Database schema & queries |

---

## Environment & Setup

```bash
# View Android SDK location
echo $env:LOCALAPPDATA\Android\Sdk  # Windows PowerShell
echo %LOCALAPPDATA%\Android\Sdk     # Windows CMD

# View Node version
node --version

# View Expo version
npx expo --version

# Check npm packages for outdated
npm outdated
```

---

## File Writing (Project-Specific Rule)

⚠️ **ALWAYS use Python/bash for project file writes, NEVER the Edit/Write tool**

```bash
python3 << 'EOF'
with open("path/to/file.tsx", "w", encoding="utf-8") as f:
    f.write(content)
# Verify no NUL bytes
with open("path/to/file.tsx", "rb") as f:
    data = f.read()
    if b'\x00' in data:
        print("NUL bytes detected!")
EOF
```

---

## Git & Commits

| Command | Purpose |
|---------|---------|
| `git status` | Check staged/unstaged changes |
| `git add <file>` | Stage a file |
| `git commit -m "message"` | Commit with message |
| `git log --oneline -n 10` | View last 10 commits |
| `git diff HEAD` | View all unstaged changes |

---

## Quick Start (Fresh Clone)

```bash
npm install
npx expo install --fix
npx expo prebuild --clean
fix-android.bat
npx expo run:android
npx tsc --noEmit
```

---

**Last updated:** 2026-07-13  
**Project:** How U Doin (Android)
