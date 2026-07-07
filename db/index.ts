/**
 * db/index.ts
 * Single import point for the entire DB layer.
 *
 * Usage in app:
 *   import { initDb } from '@/db';
 *   import { getFocusTasks, createFocusTask } from '@/db';
 */

export { initDb, getDb } from './schema';

export type { Task, TaskWithProgress, HabitWithProgress, TaskType,
              CreateFocusTaskInput, CreateHabitTaskInput,
              UpdateTaskInput, ReorderEntry } from './tasks';
export { getCurrentDateString,
         getFocusTasks, getHabitTasks, getTask,
         getNextPendingFocusTask, getArchivedTasks,
         getActiveHabitTasksBasic,
         createFocusTask, createHabitTask, updateTask,
         deleteTask, archiveTask, restoreTask,
         reorderFocusTasks } from './tasks';

export type { TimeSession, ActiveSession, SessionWithTaskName } from './sessions';
export { getActiveSession, getSessionsInRange,
         startSession, stopSession,
         recoverOrphanedSessions, addManualSession } from './sessions';

export type { DailyProgress, HistoryTotalsRow, HabitPingRow } from './progress';
export { getOrCreateProgress, addLoggedSeconds,
         markComplete, reevaluateCompletion, recordIntervalFired,
         getHistoryTotals, getHabitPingCounts } from './progress';

export { getSetting, setSetting,
         getResetTime, setResetTime,
         getLastResetDate, setLastResetDate,
         isSnoozeActive, setSnoozeActive,
         isBiometricsEnabled, setBiometricsEnabled,
         isOnboardingComplete, setOnboardingComplete } from './settings';

export type { NotificationType, NotificationRecord, NextFireRow } from './notifications';
export { saveNotification, cancelNotificationById,
         cancelNotificationsForTask, cancelAllNotifications,
         clearAllNotificationRecords,
         getActiveNotificationsForTask,
         getNotificationByExpoId,
         getNextIntervalFireTimes } from './notifications';
