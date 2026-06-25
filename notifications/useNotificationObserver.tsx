/**
 * notifications/useNotificationObserver.tsx
 * Phase 5 — wires expo-notifications runtime events to app behaviour:
 *
 *   1. RECEIVED (app foregrounded): when an interval ping fires, schedule the
 *      next one so the habit keeps pinging. (Background reschedule is handled
 *      on next launch / daily reset — Phase 6.)
 *
 *   2. RESPONSE (user taps a push): look the notification up by its expo id to
 *      find which task/type it was, then route. 'interval' + 'times_up' both
 *      land on Home for V1 (Focus|Habits is a local segment inside Home).
 *
 * Mount once, high in the tree (app root), AFTER NavigationContainer is ready.
 */

import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import {
  NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { rescheduleAfterIntervalFired } from '@/notifications/scheduler';
import { getNotificationByExpoId } from '@/db/notifications';
import type { RootStackParamList } from '@/app/_layout';

type NavRef = NavigationContainerRefWithCurrent<RootStackParamList>;

function readNotificationType(
  notification: Notifications.Notification
): { taskId?: number; notificationType?: string } {
  const data = notification.request.content.data ?? {};
  return {
    taskId: typeof data.taskId === 'number' ? data.taskId : undefined,
    notificationType:
      typeof data.notificationType === 'string' ? data.notificationType : undefined,
  };
}

export function useNotificationObserver(navRef: NavRef): void {
  useEffect(() => {
    // (1) Interval ping fired while app is alive -> queue the next one.
    const receivedSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        const { taskId, notificationType } = readNotificationType(notification);
        if (notificationType === 'interval' && typeof taskId === 'number') {
          void rescheduleAfterIntervalFired(taskId);
        }
      }
    );

    // (2) User tapped a push -> route to the right place.
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void (async () => {
          const expoId = response.notification.request.identifier;
          // Prefer the DB record (authoritative); fall back to the data payload.
          const record = await getNotificationByExpoId(expoId);
          const fallback = readNotificationType(response.notification);
          const type = record?.notification_type ?? fallback.notificationType;

          // V1: every tap opens Home (Focus|Habits is a segment inside Home).
          // type is resolved for future deep-linking; intentionally unused for now.
          void type;
          if (navRef.isReady()) {
            navRef.navigate('Tabs');
          }
        })();
      }
    );

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [navRef]);
}
