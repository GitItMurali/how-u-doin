/**
 * components/HistoryBar.tsx
 * Phase 7b — one History chart row: task name · horizontal bar · time value.
 * Custom Views, NOT victory-native (plan decision: zero skia-2.x risk, exact
 * design-token match — chunky 10dp bar, same pattern as FocusTaskCard).
 *
 * Bar width is normalized to the LARGEST total in the current set (the top
 * task always spans the full track). Quota marker: 2dp vertical line at the
 * quota position — only rendered on the Today view (showQuotaMarker), where
 * "quota" and "total" share a timescale. Fill flips to Olive when the total
 * meets quota (Today view only, same rule).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, typography, spacing, progressBar } from '@/constants/theme';
import { formatHoursMinutes } from '@/lib/date';

interface HistoryBarProps {
  name: string;
  totalSeconds: number;
  quotaMinutes: number | null;
  /** Largest totalSeconds in the rendered set — normalizes widths. */
  maxSeconds: number;
  /** True on the Today view: quota marker + olive-on-met-quota apply. */
  showQuotaMarker: boolean;
}

export default function HistoryBar({
  name,
  totalSeconds,
  quotaMinutes,
  maxSeconds,
  showQuotaMarker,
}: HistoryBarProps) {
  const safeMax = Math.max(1, maxSeconds);
  const widthPct = Math.min(1, totalSeconds / safeMax) * 100;

  const quotaSeconds = (quotaMinutes ?? 0) * 60;
  const quotaMet = showQuotaMarker && quotaSeconds > 0 && totalSeconds >= quotaSeconds;
  // Marker only meaningful when the quota fits inside the track's scale.
  const markerPct =
    showQuotaMarker && quotaSeconds > 0 && quotaSeconds <= safeMax
      ? (quotaSeconds / safeMax) * 100
      : null;

  return (
    <View style={styles.row}>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${widthPct}%`,
              backgroundColor: quotaMet
                ? progressBar.fillColorComplete
                : progressBar.fillColor,
            },
          ]}
        />
        {markerPct !== null && (
          <View style={[styles.quotaMarker, { left: `${markerPct}%` }]} />
        )}
      </View>
      <Text style={styles.value}>{formatHoursMinutes(totalSeconds)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  name: {
    width: 96,
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.caption,
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  track: {
    flex: 1,
    height: progressBar.height,
    borderRadius: progressBar.borderRadius,
    backgroundColor: progressBar.trackColor,
    // QA M6: keep children clipped (Android ignores overflow:'visible' anyway)
    // and draw the quota marker WITHIN the track bounds.
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: progressBar.borderRadius,
  },
  quotaMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.textPrimary,
    opacity: 0.55,
  },
  value: {
    width: 64,
    textAlign: 'right',
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
});
