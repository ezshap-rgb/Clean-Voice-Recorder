import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import type { RecordingEntry } from '../storage/recordings';
import { formatBytes, formatClock, formatDuration } from '../core/format';
import { colors, radius, spacing, typography } from '../theme';
import type { TrimRegion } from './TrimmerScreen.types';

type Props = {
  entry: RecordingEntry;
  durationSeconds: number;
  sizeBytes: number;
  onRegionChange?: (region: TrimRegion) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
};

export function TrimmerScreen({
  entry,
  durationSeconds,
  sizeBytes,
  onRegionChange,
  onSave,
  onCancel,
}: Props) {
  const player = useAudioPlayer(entry.uri, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const effectiveDuration =
    status.isLoaded && status.duration > 0 ? status.duration : Math.max(1, durationSeconds);

  const [inTime, setInTime] = useState(0);
  const [outTime, setOutTime] = useState(effectiveDuration);
  const [inInputText, setInInputText] = useState('00:00');
  const [outInputText, setOutInputText] = useState(formatClock(effectiveDuration));
  const [saving, setSaving] = useState(false);
  const hasLoadedRealDuration = useRef(false);

  // Manual playhead dragging and seeking state
  const [waveformWidth, setWaveformWidth] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [manualSeekTime, setManualSeekTime] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const isScrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const startXRef = useRef(0);
  const waveformWidthRef = useRef(0);
  waveformWidthRef.current = waveformWidth;
  const scrubTimeRef = useRef<number | null>(null);
  const effectiveDurationRef = useRef(effectiveDuration);
  effectiveDurationRef.current = effectiveDuration;
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (status.playing) {
      setManualSeekTime(null);
    }
  }, [status.playing]);

  const currentPlayheadTime =
    scrubTime !== null
      ? scrubTime
      : manualSeekTime !== null
      ? manualSeekTime
      : status.currentTime;

  // Sync outTime and input text once true duration loads from audio status
  useEffect(() => {
    if (status.isLoaded && status.duration > 0 && !hasLoadedRealDuration.current) {
      hasLoadedRealDuration.current = true;
      const trueDur = status.duration;
      setOutTime((prevOut) => {
        if (prevOut >= durationSeconds || prevOut > trueDur) {
          setOutInputText(formatClock(trueDur));
          return trueDur;
        }
        return prevOut;
      });
    }
  }, [status.isLoaded, status.duration, durationSeconds]);

  // Keep parent notified of active region changes
  useEffect(() => {
    onRegionChange?.({ keepStartSeconds: inTime, keepEndSeconds: outTime });
  }, [inTime, outTime, onRegionChange]);

  const clipDuration = Math.max(0, outTime - inTime);

  const seekToIn = useCallback(() => {
    setManualSeekTime(inTime);
    player.seekTo(inTime);
  }, [player, inTime]);

  const seekToOut = useCallback(() => {
    setManualSeekTime(outTime);
    player.seekTo(outTime);
  }, [player, outTime]);

  const playSelection = useCallback(() => {
    if (!status.isLoaded) return;
    player.seekTo(inTime);
    player.play();
  }, [player, inTime, status.isLoaded]);

  const stopSelection = useCallback(() => {
    player.pause();
  }, [player]);

  // Enforce loop within [inTime, outTime]
  useEffect(() => {
    if (!status.isLoaded || !status.playing) return;

    if (status.currentTime >= outTime) {
      player.pause();
      player.seekTo(inTime).then(() => {
        player.play();
      });
    }
  }, [status.isLoaded, status.playing, status.currentTime, inTime, outTime, player]);

  const setInToPlayhead = useCallback(() => {
    const nextIn = Math.min(outTime - 0.5, Math.max(0, currentPlayheadTime));
    setInTime(nextIn);
    setInInputText(formatClock(nextIn));
  }, [currentPlayheadTime, outTime]);

  const setOutToPlayhead = useCallback(() => {
    const nextOut = Math.max(inTime + 0.5, Math.min(effectiveDuration, currentPlayheadTime));
    setOutTime(nextOut);
    setOutInputText(formatClock(nextOut));
  }, [currentPlayheadTime, inTime, effectiveDuration]);

  const commitInTime = useCallback(
    (text: string) => {
      const parsed = parseTime(text);
      const nextIn = Math.max(0, Math.min(parsed, outTime - 0.5));
      setInTime(nextIn);
      setInInputText(formatClock(nextIn));
      player.seekTo(nextIn);
    },
    [outTime, player]
  );

  const commitOutTime = useCallback(
    (text: string) => {
      const parsed = parseTime(text);
      const nextOut = Math.max(inTime + 0.5, Math.min(effectiveDuration, parsed));
      setOutTime(nextOut);
      setOutInputText(formatClock(nextOut));
      player.seekTo(nextOut);
    },
    [inTime, effectiveDuration, player]
  );

  const confirmSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave();
    } catch {
      setSaving(false);
    }
  }, [onSave]);

  const confirmCancel = useCallback(() => {
    player.pause();
    onCancel();
  }, [player, onCancel]);

  // Deterministic simulated waveform envelope bars for studio visualization
  const waveformBars = useMemo(() => {
    const count = 44;
    const bars: number[] = [];
    let hash = 0;
    for (let j = 0; j < entry.name.length; j++) {
      hash = (hash * 31 + entry.name.charCodeAt(j)) >>> 0;
    }
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 6 + (hash % 10);
      const base = 0.28 + 0.5 * Math.abs(Math.sin(angle) * Math.cos(angle * 0.7));
      const variation = (((hash ^ (i * 997)) % 100) / 100) * 0.22;
      bars.push(Math.min(1, Math.max(0.15, base + variation)));
    }
    return bars;
  }, [entry.name]);

  const inPct = Math.min(100, Math.max(0, (inTime / effectiveDuration) * 100));
  const outPct = Math.min(100, Math.max(0, (outTime / effectiveDuration) * 100));
  const playheadPct = Math.min(100, Math.max(0, (currentPlayheadTime / effectiveDuration) * 100));

  const topClearance =
    Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, 32) + 26 : 64;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (evt) => {
          setIsScrubbing(true);
          isScrubbingRef.current = true;
          wasPlayingRef.current = statusRef.current.playing;
          if (statusRef.current.playing) {
            player.pause();
          }
          const width = waveformWidthRef.current || 1;
          const touchX = Math.max(0, Math.min(width, evt.nativeEvent.locationX));
          startXRef.current = touchX;
          const target = (touchX / width) * effectiveDurationRef.current;
          scrubTimeRef.current = target;
          setScrubTime(target);
        },
        onPanResponderMove: (_evt, gestureState) => {
          const width = waveformWidthRef.current || 1;
          const currentX = Math.max(0, Math.min(width, startXRef.current + gestureState.dx));
          const target = (currentX / width) * effectiveDurationRef.current;
          scrubTimeRef.current = target;
          setScrubTime(target);
        },
        onPanResponderRelease: () => {
          const target = scrubTimeRef.current ?? 0;
          setIsScrubbing(false);
          isScrubbingRef.current = false;
          setManualSeekTime(target);
          player
            .seekTo(target)
            .then(() => {
              if (wasPlayingRef.current) {
                player.play();
              }
            })
            .catch(() => {});
          setTimeout(() => {
            setScrubTime(null);
          }, 100);
        },
        onPanResponderTerminate: () => {
          const target = scrubTimeRef.current ?? 0;
          setIsScrubbing(false);
          isScrubbingRef.current = false;
          setManualSeekTime(target);
          player
            .seekTo(target)
            .then(() => {
              if (wasPlayingRef.current) {
                player.play();
              }
            })
            .catch(() => {});
          setTimeout(() => {
            setScrubTime(null);
          }, 100);
        },
      }),
    [player]
  );

  return (
    <View style={[styles.root, { paddingTop: topClearance }]}>
      {/* Top Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Audio Trimmer</Text>
            <View style={styles.studioBadge}>
              <Text style={styles.studioBadgeText}>STUDIO</Text>
            </View>
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>
            {entry.name} · {formatBytes(sizeBytes)}
          </Text>
        </View>

        <Pressable
          onPress={confirmCancel}
          accessibilityRole="button"
          accessibilityLabel="Close trimmer"
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
        >
          <Text style={styles.closeBtnText}>✕ Close</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        scrollEnabled={!isScrubbing}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Card 1 — Transport & Playhead Readout */}
        <View style={styles.card}>
          <View style={styles.transportRow}>
            <Pressable
              onPress={() => (status.playing ? stopSelection() : playSelection())}
              accessibilityRole="button"
              accessibilityLabel={status.playing ? 'Stop playback' : 'Play selection'}
              style={({ pressed }) => [
                styles.transportPlayBtn,
                status.playing && styles.transportPlayBtnActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.transportPlayText}>
                {status.playing ? '■ STOP' : '▶ PLAY'}
              </Text>
            </Pressable>

            <View style={styles.playheadBadge}>
              <View style={styles.amberDot} />
              <Text style={styles.playheadText}>
                Playhead: <Text style={styles.monoTime}>{formatClock(currentPlayheadTime)}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.chipsRow}>
            <Pressable
              onPress={seekToIn}
              accessibilityRole="button"
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            >
              <Text style={styles.chipText}>Jump to IN</Text>
            </Pressable>

            <Pressable
              onPress={seekToOut}
              accessibilityRole="button"
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            >
              <Text style={styles.chipText}>Jump to OUT</Text>
            </Pressable>

            <Pressable
              onPress={playSelection}
              accessibilityRole="button"
              style={({ pressed }) => [styles.chip, styles.chipActive, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, styles.chipTextActive]}>↻ Loop Selection</Text>
            </Pressable>
          </View>
        </View>

        {/* Card 2 — Visual Waveform & In/Out Region */}
        <View style={styles.card}>
          {/* Top ruler strip */}
          <View style={styles.ruler}>
            <Text style={styles.rulerMarker}>00:00</Text>
            <View style={styles.rulerTicks}>
              {Array.from({ length: 9 }).map((_, idx) => (
                <View
                  key={idx}
                  style={[styles.rulerTick, idx === 4 && styles.rulerTickMajor]}
                />
              ))}
            </View>
            <Text style={styles.rulerMarker}>{formatClock(effectiveDuration)}</Text>
          </View>

          {/* Dark waveform viewport */}
          <View
            style={styles.waveformContainer}
            onLayout={(e) => setWaveformWidth(e.nativeEvent.layout.width)}
            {...panResponder.panHandlers}
          >
            {/* Waveform Bars */}
            <View style={styles.waveformBars} pointerEvents="none">
              {waveformBars.map((heightFactor, idx) => {
                const barTime = (idx / (waveformBars.length - 1)) * effectiveDuration;
                const isInside = barTime >= inTime && barTime <= outTime;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.waveformBar,
                      {
                        height: `${Math.round(heightFactor * 100)}%`,
                        backgroundColor: isInside ? '#6366F1' : '#1E2746',
                        opacity: isInside ? 1 : 0.45,
                      },
                    ]}
                  />
                );
              })}
            </View>

            {/* Indigo selection overlay */}
            <View
              pointerEvents="none"
              style={[
                styles.selectionOverlay,
                {
                  left: `${inPct}%`,
                  width: `${Math.max(0, outPct - inPct)}%`,
                },
              ]}
            />

            {/* IN Vertical Line + Flag */}
            <View
              pointerEvents="none"
              style={[styles.markerLine, styles.inLine, { left: `${inPct}%` }]}
            >
              <View style={styles.inFlag}>
                <Text style={styles.flagTextDark}>IN</Text>
              </View>
            </View>

            {/* OUT Vertical Line + Flag */}
            <View
              pointerEvents="none"
              style={[styles.markerLine, styles.outLine, { left: `${outPct}%` }]}
            >
              <View style={styles.outFlag}>
                <Text style={styles.flagTextLight}>OUT</Text>
              </View>
            </View>

            {/* Golden Playhead Line + Tag */}
            <View
              pointerEvents="none"
              style={[
                styles.markerLine,
                styles.playheadLine,
                { left: `${playheadPct}%` },
                isScrubbing && styles.playheadLineActive,
              ]}
            >
              <View style={[styles.playheadTag, isScrubbing && styles.playheadTagActive]}>
                <Text style={styles.playheadTagText}>{isScrubbing ? 'SEEK' : 'PLAY'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Card 3 — START & END Controls */}
        <View style={styles.card}>
          {/* START Row */}
          <View style={styles.timeControlRow}>
            <View style={[styles.timeInputContainer, styles.startInputContainer]}>
              <View style={styles.greenDot} />
              <Text style={styles.timeTag}>START</Text>
              <TextInput
                style={styles.timeInput}
                value={inInputText}
                onChangeText={setInInputText}
                onEndEditing={() => commitInTime(inInputText)}
                onSubmitEditing={() => commitInTime(inInputText)}
                selectTextOnFocus
                returnKeyType="done"
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Trim start time"
              />
            </View>

            <Pressable
              onPress={setInToPlayhead}
              accessibilityRole="button"
              accessibilityLabel="Set start to playhead"
              style={({ pressed }) => [styles.snapBtn, styles.snapBtnStart, pressed && styles.pressed]}
            >
              <Text style={styles.snapBtnStartText}>|‹ Set to Playhead</Text>
            </Pressable>
          </View>

          {/* END Row */}
          <View style={[styles.timeControlRow, { marginTop: spacing.md }]}>
            <View style={[styles.timeInputContainer, styles.endInputContainer]}>
              <View style={styles.redDot} />
              <Text style={styles.timeTag}>END</Text>
              <TextInput
                style={styles.timeInput}
                value={outInputText}
                onChangeText={setOutInputText}
                onEndEditing={() => commitOutTime(outInputText)}
                onSubmitEditing={() => commitOutTime(outInputText)}
                selectTextOnFocus
                returnKeyType="done"
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Trim end time"
              />
            </View>

            <Pressable
              onPress={setOutToPlayhead}
              accessibilityRole="button"
              accessibilityLabel="Set end to playhead"
              style={({ pressed }) => [styles.snapBtn, styles.snapBtnEnd, pressed && styles.pressed]}
            >
              <Text style={styles.snapBtnEndText}>›| Set to Playhead</Text>
            </Pressable>
          </View>

          {/* Footer Duration Summary */}
          <View style={styles.footerSummary}>
            <Text style={styles.footerSummaryText}>
              Selection Duration:{' '}
              <Text style={styles.footerHighlight}>
                {formatDuration(clipDuration)} ({clipDuration.toFixed(1)}s)
              </Text>
            </Text>
          </View>
        </View>

        {/* Card 4 — Bottom Save / Cancel Bar */}
        <View style={styles.card}>
          <Text style={styles.destructiveNote}>
            Trim replaces the original file permanently with your In→Out selection.
          </Text>

          <View style={styles.actionRow}>
            <Pressable
              onPress={confirmCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel trimming"
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={confirmSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save trimmed audio"
              style={({ pressed }) => [
                styles.saveBtn,
                saving && styles.saveBtnDisabled,
                pressed && !saving && styles.pressed,
              ]}
            >
              <Text style={styles.saveBtnText}>
                {saving ? 'Saving…' : '↓ Save Trimmed Audio'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function parseTime(text: string): number {
  if (!text) return 0;
  const cleaned = text.trim();
  const parts = cleaned.split(':');
  if (parts.length === 2) {
    const mins = parseFloat(parts[0]) || 0;
    const secs = parseFloat(parts[1]) || 0;
    return mins * 60 + secs;
  }
  if (parts.length === 3) {
    const hrs = parseFloat(parts[0]) || 0;
    const mins = parseFloat(parts[1]) || 0;
    const secs = parseFloat(parts[2]) || 0;
    return hrs * 3600 + mins * 60 + secs;
  }
  return parseFloat(cleaned.replace(/[^\d.-]/g, '')) || 0;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  studioBadge: {
    backgroundColor: 'rgba(88, 80, 236, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(88, 80, 236, 0.45)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  studioBadgeText: {
    color: '#818CF8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  closeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeBtnText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: Platform.OS === 'android' ? 36 : 48,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: spacing.lg,
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  transportPlayBtn: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  transportPlayBtnActive: {
    backgroundColor: '#FBBF24',
  },
  transportPlayText: {
    color: '#070913',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  playheadBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    gap: 6,
  },
  amberDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.warning,
  },
  playheadText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  monoTime: {
    color: colors.warning,
    fontFamily: typography.mono,
    fontWeight: '700',
  },
  totalDurationText: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: typography.mono,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: 'rgba(88, 80, 236, 0.14)',
    borderColor: 'rgba(88, 80, 236, 0.35)',
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#A5B4FC',
  },
  ruler: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  rulerMarker: {
    color: colors.textFaint,
    fontSize: 11,
    fontFamily: typography.mono,
  },
  rulerTicks: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-end',
    height: 10,
    marginHorizontal: spacing.md,
  },
  rulerTick: {
    width: 1,
    height: 4,
    backgroundColor: colors.border,
  },
  rulerTickMajor: {
    height: 8,
    backgroundColor: colors.textFaint,
  },
  waveformContainer: {
    height: 116,
    backgroundColor: '#070913',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    overflow: 'hidden',
  },
  waveformBars: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  selectionOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(99, 102, 241, 0.16)',
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: 'rgba(99, 102, 241, 0.5)',
  },
  markerLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    zIndex: 10,
  },
  inLine: {
    backgroundColor: colors.success,
  },
  outLine: {
    backgroundColor: colors.record,
  },
  playheadLine: {
    backgroundColor: colors.warning,
    zIndex: 20,
  },
  inFlag: {
    position: 'absolute',
    top: 3,
    left: -13,
    backgroundColor: colors.success,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  outFlag: {
    position: 'absolute',
    top: 3,
    left: -14,
    backgroundColor: colors.record,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  playheadLineActive: {
    width: 3,
    backgroundColor: '#FDE047',
  },
  playheadTagActive: {
    backgroundColor: '#FDE047',
    transform: [{ scale: 1.15 }],
  },
  playheadTag: {
    position: 'absolute',
    bottom: 3,
    left: -15,
    backgroundColor: colors.warning,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  flagTextDark: {
    color: '#070913',
    fontSize: 9,
    fontWeight: '800',
  },
  flagTextLight: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  playheadTagText: {
    color: '#070913',
    fontSize: 8,
    fontWeight: '800',
  },
  timeControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timeInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    gap: spacing.xs,
  },
  startInputContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  endInputContainer: {
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
    borderColor: 'rgba(244, 63, 94, 0.35)',
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  redDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.record,
  },
  timeTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    marginRight: 4,
  },
  timeInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontFamily: typography.mono,
    fontWeight: '600',
    letterSpacing: 1,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    textAlign: 'center',
  },
  snapBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapBtnStart: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  snapBtnStartText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  snapBtnEnd: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.35)',
  },
  snapBtnEndText: {
    color: colors.record,
    fontSize: 12,
    fontWeight: '700',
  },
  footerSummary: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  footerSummaryText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  footerHighlight: {
    color: '#818CF8',
    fontWeight: '700',
    fontFamily: typography.mono,
  },
  destructiveNote: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
