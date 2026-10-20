/** Shared design tokens for the dark Audio Studio aesthetic matching Clean Recorder icon gradient. */

export const colors = {
  background: '#070913',
  surface: '#0E1324',
  surfaceRaised: '#151C33',
  border: '#1E2746',
  accent: '#5C4FEE', // Primary (Color 1 - Electric Violet)
  warning: '#F50ACE', // Contrast Highlight (Color 2 - Vibrant Magenta)
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  textFaint: '#64748B',
  record: '#F43F5E',
  danger: '#F43F5E',
  success: '#10B981',
  recordDark: '#9F1239',
  scrim: 'rgba(7, 9, 19, 0.85)',
  gradientStart: '#5C4FEE',
  gradientMid: '#A816DF',
  gradientEnd: '#F50ACE',
  dotGold: '#F59E0B',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  card: 20,
  pill: 999,
} as const;

export const typography = {
  /** Monospace keeps timers and numbers from jittering. */
  mono: 'monospace',
  timerSize: 56,
  titleSize: 26,
} as const;
