/**
 * db/schema.ts
 * SQLite schema creation, indexes, seeding, and migration runner.
 * Run initDb() once on app launch before any other DB calls.
 */

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'howudoin.db';
const CURRENT_VERSION = 2; // bump this when adding a new migration

let _db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    throw new Error('Database not initialised. Call initDb() first.');
  }
  return _db;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function initDb(): Promise<void> {
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await runMigrations(_db);
}

// ─── Migration runner ─────────────────────────────────────────────────────────

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;'
  );
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion < CURRENT_VERSION) {
    if (currentVersion < 1) {
      await migrate_0_to_1(db);
      await db.execAsync('PRAGMA user_version = 1;');
    }
    if (currentVersion < 2) {
      await migrate_1_to_2(db);
      await db.execAsync('PRAGMA user_version = 2;');
    }
  }
}

// ─── Migration 1 -> 2 (seconds-granular time tracking) ───────────────────────
// daily_progress.logged_seconds + time_sessions.duration_seconds become the
// source of truth; the *_minutes columns are kept in sync (floor(seconds/60))
// so existing queries/readers keep working. Backfill seconds from existing
// minutes so historical data isn't lost (best-effort: minutes * 60).
async function migrate_1_to_2(db: SQLite.SQLiteDatabase): Promise<void> {
  // SQLite can't easily check column existence inline; ALTER ... ADD COLUMN
  // throws if it already exists, so guard each with a pragma check.
  const dpCols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(daily_progress);"
  );
  if (!dpCols.some((c) => c.name === 'logged_seconds')) {
    await db.execAsync(
      'ALTER TABLE daily_progress ADD COLUMN logged_seconds INTEGER NOT NULL DEFAULT 0;'
    );
    await db.execAsync(
      'UPDATE daily_progress SET logged_seconds = logged_minutes * 60;'
    );
  }

  const tsCols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(time_sessions);"
  );
  if (!tsCols.some((c) => c.name === 'duration_seconds')) {
    await db.execAsync(
      'ALTER TABLE time_sessions ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0;'
    );
    await db.execAsync(
      'UPDATE time_sessions SET duration_seconds = duration_minutes * 60;'
    );
  }
}

// ─── Migration 0 -> 1 (initial V1 schema) ────────────────────────────────────

async function migrate_0_to_1(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL,
      notes            TEXT,
      task_type        TEXT    NOT NULL DEFAULT 'focus',
      quota_minutes    INTEGER,
      interval_minutes INTEGER,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      is_archived      INTEGER NOT NULL DEFAULT 0,
      archived_at      INTEGER,
      is_deleted       INTEGER NOT NULL DEFAULT 0,
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_progress (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id                INTEGER NOT NULL REFERENCES tasks(id),
      date                   TEXT    NOT NULL,
      logged_minutes         INTEGER NOT NULL DEFAULT 0,
      logged_seconds         INTEGER NOT NULL DEFAULT 0,
      is_complete            INTEGER NOT NULL DEFAULT 0,
      interval_count         INTEGER NOT NULL DEFAULT 0,
      last_interval_fired_at INTEGER,
      created_at             INTEGER NOT NULL,
      updated_at             INTEGER NOT NULL,
      UNIQUE(task_id, date)
    );

    CREATE TABLE IF NOT EXISTS time_sessions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id          INTEGER NOT NULL REFERENCES tasks(id),
      date             TEXT    NOT NULL,
      started_at       INTEGER,
      ended_at         INTEGER,
      duration_minutes INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      is_manual        INTEGER NOT NULL DEFAULT 0,
      is_active        INTEGER NOT NULL DEFAULT 0,
      created_at       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_schedule (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id           INTEGER NOT NULL REFERENCES tasks(id),
      notification_id   TEXT    NOT NULL,
      notification_type TEXT    NOT NULL DEFAULT 'interval',
      scheduled_for     INTEGER NOT NULL,
      is_active         INTEGER NOT NULL DEFAULT 1,
      created_at        INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_daily_progress_date
      ON daily_progress(date);

    CREATE INDEX IF NOT EXISTS idx_daily_progress_task_date
      ON daily_progress(task_id, date);

    CREATE INDEX IF NOT EXISTS idx_time_sessions_task_date
      ON time_sessions(task_id, date);

    CREATE INDEX IF NOT EXISTS idx_time_sessions_active
      ON time_sessions(is_active) WHERE is_active = 1;

    CREATE INDEX IF NOT EXISTS idx_notification_schedule_task
      ON notification_schedule(task_id, is_active);

    CREATE INDEX IF NOT EXISTS idx_notification_type
      ON notification_schedule(notification_type, is_active);

    CREATE INDEX IF NOT EXISTS idx_tasks_type_order
      ON tasks(task_type, sort_order)
      WHERE is_deleted = 0 AND is_archived = 0;

    CREATE INDEX IF NOT EXISTS idx_tasks_focus_order
      ON tasks(sort_order)
      WHERE task_type = 'focus' AND is_deleted = 0;

    CREATE INDEX IF NOT EXISTS idx_tasks_archived
      ON tasks(task_type, archived_at)
      WHERE is_archived = 1 AND is_deleted = 0;
  `);

  await db.execAsync(`
    INSERT OR IGNORE INTO app_settings (key, value) VALUES
      ('reset_time',          '00:00'),
      ('last_reset_date',     ''),
      ('snooze_active',       '0'),
      ('snooze_activated_at', ''),
      ('biometrics_enabled',  '0'),
      ('onboarding_complete', '0');
  `);
}
