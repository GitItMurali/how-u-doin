/**
 * notifications/useNotificationObserver.tsx
 * Phase 5 — wires expo-notifications runtime events to app behaviour.
 *
 * 2026-07-07: interval pings are OS-repeating now (repeats:true in
 * scheduler.ts), so NOTHING is rescheduled when one fires. The old
 * reschedule-on-fire only ran while the app was foregrounded — backgrounded
 * habits pinged once and went silent. The check button owns cadence restarts
 * (restartHabitCadence). The B3 cold-start consume/reschedule is gone for the
 * same reason: the active DB row IS the "due at" anchor and must survive
 * fires untouched until the habit is checked off or the daily reset runs.
 *
 * What remains: RESPONSE (user taps a push) → route Home. The DB record is
 * resolved for future deep-linking; V1 routes every tap to Home (Focus|Habits
 * is a local segment inside Home).
 *
 * Mount once, high in the tree (app root), AFTER NavigationContainer is ready.
 */

import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import {
  NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { getNotificationByExpoId } from '@/db/notifications';
import type { RootStackParamList } from '@/app/_layout';

type NavRef = NavigationContainerRefWithCurrent<RootStackParamList>;

export function useNotificationObserver(navRef: NavRef): void {
  useEffect(() => {
    // User tapped a push -> route to the right place.
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void (async () => {
          const expoId = response.notification.request.identifier;
          // Resolved for future deep-linking; intentionally unused for now.
          const record = await getNotificationByExpoId(expoId);
          void record;
          if (navRef.isReady()) {
            navRef.navigate('Tabs');
          }
        })();
      }
    );

    return () => {
      responseSub.remove();
    };
  }, [navRef]);
}
