import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LevelMeter } from '../components/LevelMeter';
import { describeSettings, formatClock } from '../core/format';
import type { Settings } from '../core/types';
import type { RecorderPhase } from '../hooks/useRecorder';
import { colors, radius, spacing, typography } from '../theme';

type Props = {
  settings: Settings;
  phase: RecorderPhase;
  elapsedSeconds: number;
  level: number;
  error: string | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onOpenSettings: () => void;
  onDismissError: () => void;
};

const BUTTON_SIZE = 144;
const DUAL_BTN_SIZE = 84;

export function RecordScreen({
  settings,
  phase,
  elapsedSeconds,
  level,
  error,
  onStart,
  onPause,
  onResume,
  onStop,
  onOpenSettings,
  onDismissError,
}: Props) {
  const isRecording = phase === 'recording';
  const isPaused = phase === 'paused';
  const isActive = isRecording || isPaused;
  const isBusy = phase === 'starting' || phase === 'saving';

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isRecording) {
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ])
    );
    loop.start();

    return () => loop.stop();
  }, [isRecording, pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });

  const statusText = isRecording
    ? 'Recording — tap pause or stop'
    : isPaused
      ? 'Recording paused — tap resume or stop'
      : phase === 'starting'
        ? 'Starting…'
        : phase === 'saving'
          ? 'Saving…'
          : 'Tap to record';

  const topClearance =
    Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, 32) + 26 : 64;

  return (
    <View style={[styles.root, { paddingTop: topClearance }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {/* Waveform Logo matching app icon */}
          <View style={styles.logoBadge}>
            <View style={[styles.logoBar, { height: 10, backgroundColor: '#5C4FEE' }]} />
            <View style={[styles.logoBar, { height: 18, backgroundColor: '#7C3AED' }]} />
            <View style={[styles.logoBar, { height: 25, backgroundColor: '#A816DF' }]} />
            <View style={[styles.logoBar, { height: 16, backgroundColor: '#D916B8' }]} />
            <View style={[styles.logoBar, { height: 11, backgroundColor: '#F50ACE' }]} />
            <View style={styles.logoDot} />
          </View>

          <View style={styles.headerTextGroup}>
            <Text style={styles.title}>Clean Recorder</Text>
            <View style={styles.subtitleRow}>
              <View style={styles.studioBadge}>
                <Text style={styles.studioBadgeText}>STUDIO</Text>
              </View>
              <Text style={styles.subtitle} numberOfLines={1}>
                {describeSettings(settings)}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel="Recording settings"
          style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
        >
          <Text style={styles.settingsGlyph}>⚙</Text>
          <Text style={styles.settingsLabel}>Settings</Text>
        </Pressable>
      </View>

      {error ? (
        <Pressable
          onPress={onDismissError}
          style={styles.errorBanner}
          accessibilityRole="button"
        >
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorDismiss}>Dismiss</Text>
        </Pressable>
      ) : null}

      {/* Centered Studio Recording Card */}
      <View style={styles.studioCard}>
        {/* Status indicator pill */}
        <View
          style={[
            styles.statusPill,
            isRecording
              ? styles.statusPillActive
              : isPaused
                ? styles.statusPillPaused
                : styles.statusPillIdle,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              isRecording
                ? styles.statusDotActive
                : isPaused
                  ? styles.statusDotPaused
                  : styles.statusDotIdle,
            ]}
          />
          <Text
            style={[
              styles.statusText,
              isRecording && styles.statusTextActive,
              isPaused && styles.statusTextPaused,
            ]}
          >
            {statusText}
          </Text>
        </View>

        {/* Large monospace timer */}
        <Text
          style={[styles.timer, isActive && styles.timerActive]}
          accessibilityLabel={`Elapsed time ${formatClock(elapsedSeconds)}`}
        >
          {formatClock(elapsedSeconds)}
        </Text>

        {/* Controls Area */}
        <View style={styles.buttonArea}>
          {!isActive ? (
            /* Idle: Single Large Record Button */
            <View style={styles.singleButtonWrap}>
              <Pressable
                onPress={onStart}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel="Start recording"
                accessibilityState={{ disabled: isBusy }}
                style={({ pressed }) => [
                  styles.recordButton,
                  pressed && styles.pressed,
                  isBusy && styles.recordButtonBusy,
                ]}
              >
                <View style={styles.recordShape} />
              </Pressable>
            </View>
          ) : (
            /* Active (Recording or Paused): Dual Controls (Pause/Resume + Stop) */
            <View style={styles.dualControlsWrap}>
              {/* Pause / Resume Button */}
              <View style={styles.controlItem}>
                <Pressable
                  onPress={isRecording ? onPause : onResume}
                  accessibilityRole="button"
                  accessibilityLabel={isRecording ? 'Pause recording' : 'Resume recording'}
                  style={({ pressed }) => [
                    styles.dualButton,
                    isRecording ? styles.pauseButton : styles.resumeButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.dualButtonGlyph,
                      isRecording ? styles.pauseGlyphText : styles.resumeGlyphText,
                    ]}
                  >
                    {isRecording ? '❚❚' : '▶'}
                  </Text>
                </Pressable>
                <Text style={styles.controlLabel}>{isRecording ? 'Pause' : 'Resume'}</Text>
              </View>

              {/* Stop & Save Button */}
              <View style={styles.controlItem}>
                <View style={styles.stopButtonContainer}>
                  {isRecording ? (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.pulseRingSmall,
                        { opacity: ringOpacity, transform: [{ scale: ringScale }] },
                      ]}
                    />
                  ) : null}

                  <Pressable
                    onPress={onStop}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Stop and save recording"
                    style={({ pressed }) => [
                      styles.dualButton,
                      styles.stopButton,
                      pressed && styles.pressed,
                      isBusy && styles.recordButtonBusy,
                    ]}
                  >
                    <View style={styles.stopShapeSmall} />
                  </Pressable>
                </View>
                <Text style={styles.controlLabel}>Stop & Save</Text>
              </View>
            </View>
          )}
        </View>

        {/* Level Meter */}
        <View style={styles.meterWrap}>
          <LevelMeter level={level} idle={!isRecording} />
        </View>

        <Text style={styles.saveHint}>Saves automatically to device storage</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(88, 80, 236, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(88, 80, 236, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  logoBar: {
    width: 3,
    backgroundColor: colors.accent,
    borderRadius: 1.5,
  },
  logoDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F59E0B',
    marginLeft: 1,
  },
  headerTextGroup: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  studioBadge: {
    backgroundColor: 'rgba(88, 80, 236, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(88, 80, 236, 0.45)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  studioBadgeText: {
    color: '#818CF8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  subtitle: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsGlyph: {
    color: colors.textMuted,
    fontSize: 15,
  },
  settingsLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  errorDismiss: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  studioCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    marginVertical: spacing.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusPillIdle: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
  },
  statusPillActive: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.35)',
  },
  statusPillPaused: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotIdle: {
    backgroundColor: colors.textFaint,
  },
  statusDotActive: {
    backgroundColor: colors.record,
  },
  statusDotPaused: {
    backgroundColor: colors.warning,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  statusTextActive: {
    color: colors.text,
  },
  statusTextPaused: {
    color: colors.warning,
  },
  timer: {
    color: colors.textMuted,
    fontSize: typography.timerSize,
    fontFamily: typography.mono,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  timerActive: {
    color: colors.text,
  },
  buttonArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
    minHeight: BUTTON_SIZE,
  },
  singleButtonWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 4,
    borderColor: colors.record,
  },
  recordButtonBusy: {
    opacity: 0.6,
  },
  recordShape: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.record,
  },
  dualControlsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxl,
  },
  controlItem: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  stopButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dualButton: {
    width: DUAL_BTN_SIZE,
    height: DUAL_BTN_SIZE,
    borderRadius: DUAL_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  pauseButton: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: colors.warning,
  },
  resumeButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: colors.success,
  },
  stopButton: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: colors.record,
  },
  dualButtonGlyph: {
    fontSize: 26,
    fontWeight: '800',
  },
  pauseGlyphText: {
    color: colors.warning,
  },
  resumeGlyphText: {
    color: colors.success,
    marginLeft: 3,
  },
  stopShapeSmall: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.record,
  },
  pulseRingSmall: {
    position: 'absolute',
    width: DUAL_BTN_SIZE,
    height: DUAL_BTN_SIZE,
    borderRadius: DUAL_BTN_SIZE / 2,
    backgroundColor: colors.record,
  },
  controlLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  meterWrap: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
  },
  saveHint: {
    color: colors.textFaint,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.75,
  },
});
