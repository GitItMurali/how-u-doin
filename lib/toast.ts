/**
 * lib/toast.ts
 * QA consolidation — the one toast helper (was copy-pasted in useTimer,
 * Home, and Settings). Android-first: ToastAndroid is the in-app surface.
 * iOS has no native toast; a custom snackbar can land in a later polish pass.
 */
import { ToastAndroid, Platform } from 'react-native';

export function toast(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  }
}
