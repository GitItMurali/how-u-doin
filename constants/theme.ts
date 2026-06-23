/**
 * constants/theme.ts
 * How U Doin — Design System
 * Visual direction: Autumn Bold
 * Source of truth: 04_UI_UX_Design_Brief.md + 00_PROJECT_CONTEXT.md
 *
 * DO NOT change any value without updating the Design Brief first.
 */

// ─────────────────────────────────────────────
// COLORS
// All 9 palette colors + semantic aliases
// ─────────────────────────────────────────────
export const colors = {
  // Core palette
  background: '#F5ECD7',   // Warm Parchment — main screen background
  surface: '#EDD9B0',      // Toasted Cream — card backgrounds
  primary: '#C0622F',      // Burnt Sienna — primary buttons, active states, timer running
  accent: '#E08A2F',       // Deep Amber — progress bars, highlights, icons
  textPrimary: '#2C1A0E',  // Espresso — all primary text
  textSecondary: '#7A5C3E', // Warm Walnut — secondary text, labels, placeholders
  success: '#7A8C3E',      // Olive Grove — completed tasks, quota hit
  snooze: '#A07080',       // Dusty Mauve — snooze banner, paused state
  danger: '#A03020',       // Rust Red — delete, destructive actions

  // Semantic aliases (for code readability)
  timerRunning: '#C0622F',       // same as primary
  progressFill: '#E08A2F',       // same as accent
  progressFillComplete: '#7A8C3E', // transitions to success when quota hit
  cardBorderDefault: '#2C1A0E',  // Espresso — default left accent border
  fabBackground: '#C0622F',      // Burnt Sienna
  bottomNavActive: '#C0622F',    // active tab indicator
  bottomNavBackground: '#EDD9B0', // Toasted Cream
  snoozeBanner: '#A07080',       // Dusty Mauve

  // Utility
  transparent: 'transparent',
  white: '#FFFFFF',              // use sparingly — prefer background or surface
  shadowColor: '#2C1A0E',        // Espresso for hard shadow

  // Opacity variants (used inline — see card rules below)
  // progressTrack: textSecondary at 20% → use rgba(122, 92, 62, 0.20)
  // bottomNavBorder: textPrimary at 10% → use rgba(44, 26, 14, 0.10)
  // cardShadow: textPrimary at 15% → use rgba(44, 26, 14, 0.15)
} as const;

export type Color = typeof colors[keyof typeof colors];


// ─────────────────────────────────────────────
// TYPOGRAPHY
// Fraunces = headings (Black 900)
// DM Sans = body / UI labels
//
// Note: fonts loaded via expo-font in Phase 2 (_layout.tsx)
// Font family strings must match the names registered with useFonts()
// ─────────────────────────────────────────────
export const typography = {
  fonts: {
    heading: 'Fraunces_900Black',  // registered in Phase 2
    body: 'DMSans_400Regular',
    bodySemiBold: 'DMSans_600SemiBold',
    bodyBold: 'DMSans_700Bold',
  },

  // Size scale — use ONLY these values, never freestyle
  sizes: {
    appTitle: 28,      // App name "How U Doin" — Fraunces Black
    screenTitle: 22,   // Screen headings — Fraunces Bold
    cardTitle: 17,     // Task name on card — DM Sans SemiBold
    body: 14,          // Body text, labels — DM Sans Regular
    caption: 12,       // Meta text, timestamps — DM Sans Regular
    timer: 36,         // Live timer MM:SS — Fraunces Black, tabular figures
  },

  // Weight constants (for StyleSheet fontWeight)
  weights: {
    black: '900' as const,
    bold: '700' as const,
    semiBold: '600' as const,
    regular: '400' as const,
  },

  // Timer uses tabular figures so digits don't jump width
  timerFontVariant: ['tabular-nums'] as const,
} as const;


// ─────────────────────────────────────────────
// SPACING
// Base unit: 8dp
// All spacing should be multiples of 8 (or 4 for tight gaps)
// ─────────────────────────────────────────────
export const spacing = {
  xs: 4,    // tight gaps
  sm: 8,    // base unit
  md: 12,   // between cards
  lg: 16,   // screen horizontal padding, card inner padding
  xl: 24,   // section spacing
  xxl: 32,  // large section breaks
} as const;


// ─────────────────────────────────────────────
// CARD RULES
// Hard shadow (no blur) = cartoony / hand-drawn feel
// Left accent border = visual hierarchy without full outline
// ─────────────────────────────────────────────
export const card = {
  borderRadius: 12,          // NOT the 24dp pill — intentionally restrained
  accentBorderWidth: 4,      // left accent border width (dp)

  // Hard drop shadow — offset right+down, ZERO blur
  shadow: {
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 0,         // blur = 0 for hard shadow
    elevation: 4,            // Android equivalent
  },

  // Inner padding
  paddingHorizontal: spacing.lg,  // 16
  paddingVertical: spacing.lg,    // 16

  // Gap between cards in the list
  gap: spacing.md,                // 12
} as const;


// ─────────────────────────────────────────────
// PROGRESS BAR
// Chunky, not a thin line. Track is muted walnut.
// Fill: amber → olive when quota hit (no animation on fill — just update value)
// ─────────────────────────────────────────────
export const progressBar = {
  height: 10,                // chunky
  borderRadius: 5,           // rounded ends = height / 2
  trackColor: 'rgba(122, 92, 62, 0.20)',  // Walnut at 20%
  fillColor: colors.accent,              // Deep Amber
  fillColorComplete: colors.success,     // Olive Grove when quota hit
} as const;


// ─────────────────────────────────────────────
// FAB (Floating Action Button)
// Bottom-right, Burnt Sienna, hard shadow
// ─────────────────────────────────────────────
export const fab = {
  size: 56,            // width + height
  borderRadius: 12,    // matches card — not a full circle
  backgroundColor: colors.primary,
  shadow: {
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.20,
    shadowRadius: 0,
    elevation: 6,
  },
  // Position from screen edge
  bottom: spacing.xl,   // 24
  right: spacing.lg,    // 16
} as const;


// ─────────────────────────────────────────────
// BOTTOM TAB BAR
// Active indicator: small pill underline in Burnt Sienna
// Background: Toasted Cream with top border (Espresso 10%)
// Icons only in V1 (no labels)
// ─────────────────────────────────────────────
export const bottomNav = {
  height: 60,                    // minimum 60dp for comfortable tap targets
  backgroundColor: colors.bottomNavBackground,
  borderTopColor: 'rgba(44, 26, 14, 0.10)',  // Espresso at 10%
  borderTopWidth: 1,
  activeIndicatorColor: colors.bottomNavActive,  // Burnt Sienna pill underline
  activeIndicatorHeight: 3,
  activeIndicatorBorderRadius: 2,
  iconSize: 24,
} as const;


// ─────────────────────────────────────────────
// SHEET / MODAL
// Slides up from bottom — 75% height, spring animation
// Used for: Create task, Three-dot menu
// ─────────────────────────────────────────────
export const sheet = {
  heightPercentage: 0.75,   // 75% of screen height
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  backgroundColor: colors.surface,
  handleColor: 'rgba(44, 26, 14, 0.20)',  // Espresso 20% drag handle
  handleWidth: 40,
  handleHeight: 4,
  handleBorderRadius: 2,
} as const;


// ─────────────────────────────────────────────
// SWIPE ACTIONS
// Swipe left = delete (Rust Red background)
// Swipe right = archive (immediate, no prompt)
// ─────────────────────────────────────────────
export const swipe = {
  deleteBackgroundColor: colors.danger,
  archiveBackgroundColor: colors.accent,
  actionIconSize: 24,
  revealThreshold: 80,   // px dragged before action triggers
} as const;


// ─────────────────────────────────────────────
// PILL TABS (Focus | Habits segmented control)
// ─────────────────────────────────────────────
export const pillTab = {
  borderRadius: 20,
  height: 36,
  paddingHorizontal: spacing.lg,
  activeBackground: colors.primary,
  activeTextColor: colors.white,
  inactiveBackground: 'transparent',
  inactiveTextColor: colors.textSecondary,
  containerBackground: 'rgba(44, 26, 14, 0.08)',
  containerBorderRadius: 24,
  containerPadding: 3,
} as const;
