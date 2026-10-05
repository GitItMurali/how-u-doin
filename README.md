# How U Doin

An Android time and habit tracker. Solo build in React Native and Expo, written in TypeScript, about 7,000 lines.

You set your daily tasks, time the ones that need focus, tick off the habits, and get reminders through the day. Everything is stored on the phone. There is no account and no server.

## Features

- Focus tasks and habit tasks, with daily time targets, a timer and interval reminders
- Drag to reorder tasks, and archive or restore old ones
- History screen with daily bars and a session log
- Scheduled local notifications with snooze
- Automatic daily reset at a time you choose, run in the background
- PIN lock with optional fingerprint unlock
- Onboarding flow on first launch

## How it is built

| Part | Choice |
|---|---|
| Language | TypeScript in strict mode, type checked with `npx tsc --noEmit` before every commit |
| App | React Native 0.85 and Expo 56 |
| Storage | expo-sqlite, five tables, versioned migrations |
| Navigation | React Navigation, tabs and stack |
| Charts and motion | Victory Native, Skia, Reanimated |
| Background work | expo-notifications, expo-background-fetch, expo-task-manager |
| Security | expo-local-authentication, expo-secure-store |

## Worth a look

- **`db/schema.ts`** holds the migration runner. It reads `PRAGMA user_version` and runs each migration in order. Migration 1 to 2 moved time tracking from minutes to seconds and filled the new columns from the old data. Each `ALTER TABLE` is guarded by a `PRAGMA table_info` check, because SQLite throws on a duplicate column. That makes the migration safe to run twice.
- **`lib/pin.ts`** handles the PIN lock. Five wrong tries locks the app for 30 seconds. The attempt count and the lockout time are kept in secure storage, not in memory, so a force quit cannot skip the lockout.
- **`notifications/`** holds the reminder scheduler and the background daily reset.

## Run it

You need Node, the Android SDK and a device or emulator. The scripts are written for Windows.

```
npm install
npx expo prebuild --platform android --clean
fix-android.bat
npx expo run:android
```

`COMMANDS.md` lists the rest of the dev, debug and build commands.

## Testing and known issues

There are no automated tests in this repo yet. I tested each phase by hand on real devices. Open defects and feature requests are tracked in `bugs.txt`.

## Status

Version 1.0.0, Android only. The app was built in phases, one branch per phase.
