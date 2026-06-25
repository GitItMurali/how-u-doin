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

export type { TimeSession, ActiveSession } from './sessions';
export { getActiveSession, getSessionsForDate,
         startSession, stopSession,
         recoverOrphanedSessions, addManualSession } from './sessions';

export type { DailyProgress, HistoryRow } from './progress';
export { getOrCreateProgress, setLoggedMinutes, addLoggedMinutes,
         markComplete, recordIntervalFired, resetDailyProgress,
         getHistory, getTodayHistory } from './progress';

export type { AppSettings } from './settings';
export { getSetting, setSetting,
         getResetTime, setResetTime,
         getLastResetDate, setLastResetDate,
         isSnoozeActive, setSnoozeActive, getSnoozeActivatedAt,
         isBiometricsEnabled, setBiometricsEnabled,
         isOnboardingComplete, setOnboardingComplete,
         getAllSettings } from './settings';

export type { NotificationType, NotificationRecord, CancelledIntervalNotification } from './notifications';
export { saveNotification, cancelNotificationById,
         cancelNotificationsForTask, cancelAllNotifications,
         clearAllNotificationRecords,
         getActiveNotificationsForTask, getCancelledIntervalNotifications,
         getNotificationByExpoId,
         getAllActiveNotifications } from './notifications';
