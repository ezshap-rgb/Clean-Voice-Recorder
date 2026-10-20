import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { formatBytes, formatClock, formatDateTime, formatDuration } from '../core/format';
import { RECORDINGS_FOLDER_NAME, type RecordingEntry } from '../storage/recordings';
import { batchShareRecordings, exportRecordingsToFolder } from '../services/batchExport';
import { colors, radius, spacing } from '../theme';

type Props = {
  recordings: RecordingEntry[];
  onShare: (entry: RecordingEntry) => void;
  onRename: (entry: RecordingEntry) => void;
  onEdit: (entry: RecordingEntry) => void;
  onDelete: (entry: RecordingEntry) => void;
  onBatchDelete?: (entries: RecordingEntry[]) => void;
};

export function LibraryScreen({
  recordings,
  onShare,
  onRename,
  onEdit,
  onDelete,
  onBatchDelete,
}: Props) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [activeUri, setActiveUri] = useState<string | null>(null);

  // Selection mode state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const togglePlayback = useCallback(
    (entry: RecordingEntry) => {
      if (activeUri === entry.uri) {
        if (status.playing) player.pause();
        else player.play();
        return;
      }

      setActiveUri(entry.uri);
      player.replace(entry.uri);
      player.play();
    },
    [activeUri, player, status.playing]
  );

  // Rewind when playback completes so next tap replays
  useEffect(() => {
    if (status.didJustFinish) player.seekTo(0);
  }, [status.didJustFinish, player]);

  // Stop playback if playing item was deleted
  useEffect(() => {
    if (activeUri && !recordings.some((item) => item.uri === activeUri)) {
      player.pause();
      setActiveUri(null);
    }
  }, [recordings, activeUri, player]);

  // Clean up selected uris if files are deleted
  useEffect(() => {
    const existingUris = new Set(recordings.map((r) => r.uri));
    setSelectedUris((prev) => {
      const next = new Set<string>();
      for (const uri of prev) {
        if (existingUris.has(uri)) next.add(uri);
      }
      return next;
    });
  }, [recordings]);

  // Multi-selection helpers
  const toggleSelect = useCallback((uri: string) => {
    setSelectedUris((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedUris.size === recordings.length) {
      setSelectedUris(new Set());
    } else {
      setSelectedUris(new Set(recordings.map((r) => r.uri)));
    }
  }, [recordings, selectedUris.size]);

  const enterSelectModeWith = useCallback((uri?: string) => {
    setIsSelectMode(true);
    if (uri) setSelectedUris(new Set([uri]));
  }, []);

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedUris(new Set());
  }, []);

  // Batch actions
  const selectedEntries = recordings.filter((r) => selectedUris.has(r.uri));

  const handleBatchShare = useCallback(async () => {
    if (selectedEntries.length === 0) return;
    try {
      await batchShareRecordings(selectedEntries);
    } catch (err: any) {
      Alert.alert('Could not share', err?.message || 'Failed to share recordings');
    }
  }, [selectedEntries]);

  const handleBatchExport = useCallback(async () => {
    if (selectedEntries.length === 0) return;
    setIsExporting(true);
    try {
      const result = await exportRecordingsToFolder(selectedEntries);
      if (result.success) {
        Alert.alert(
          'Saved to Device',
          `Successfully saved ${result.count} recording${
            result.count === 1 ? '' : 's'
          } to your selected folder! You can now access the files in your phone's file manager or on your PC.`,
          [{ text: 'OK', onPress: exitSelectMode }]
        );
      } else if (result.error && result.error !== 'Permission was not granted.') {
        Alert.alert('Export Failed', result.error);
      }
    } finally {
      setIsExporting(false);
    }
  }, [selectedEntries, exitSelectMode]);

  const handleBatchDelete = useCallback(() => {
    if (selectedEntries.length === 0) return;
    Alert.alert(
      'Delete recordings',
      `Delete ${selectedEntries.length} recording${
        selectedEntries.length > 1 ? 's' : ''
      }? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (onBatchDelete) {
              onBatchDelete(selectedEntries);
            } else {
              selectedEntries.forEach(onDelete);
            }
            exitSelectMode();
          },
        },
      ]
    );
  }, [selectedEntries, onBatchDelete, onDelete, exitSelectMode]);

  const topClearance =
    Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, 32) + 26 : 64;

  return (
    <View style={[styles.root, { paddingTop: topClearance }]}>
      <Header
        count={recordings.length}
        isSelectMode={isSelectMode}
        selectedCount={selectedUris.size}
        allSelected={recordings.length > 0 && selectedUris.size === recordings.length}
        onToggleSelectMode={() => {
          if (isSelectMode) exitSelectMode();
          else enterSelectModeWith();
        }}
        onToggleSelectAll={toggleSelectAll}
      />

      {recordings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconBadge}>
              <View style={styles.emptyIconCircle}>
                <View style={styles.emptyIconBar} />
                <View style={[styles.emptyIconBar, { height: 16 }]} />
                <View style={styles.emptyIconBar} />
              </View>
            </View>
            <Text style={styles.emptyTitle}>No recordings yet</Text>
            <Text style={styles.emptyBody}>
              Recorded audio files are saved automatically in the “{RECORDINGS_FOLDER_NAME}”
              folder and will appear here. Switch to the Record tab to start your first session.
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={recordings}
          keyExtractor={(item) => item.uri}
          contentContainerStyle={[styles.list, isSelectMode && styles.listSelectMode]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isActive = activeUri === item.uri;
            const isPlaying = isActive && status.playing;
            const isSelected = selectedUris.has(item.uri);
            const progress =
              isActive && status.duration > 0
                ? Math.min(1, status.currentTime / status.duration)
                : 0;

            return (
              <Pressable
                onLongPress={() => {
                  if (!isSelectMode) enterSelectModeWith(item.uri);
                }}
                onPress={() => {
                  if (isSelectMode) toggleSelect(item.uri);
                }}
                delayLongPress={300}
                style={[
                  styles.card,
                  isActive && !isSelectMode && styles.cardActive,
                  isSelected && styles.cardSelected,
                ]}
              >
                {/* Header row: [Checkbox if SelectMode] + Circular Play/Pause + Title & Meta */}
                <View style={styles.cardHeaderRow}>
                  {isSelectMode ? (
                    <Pressable
                      onPress={() => toggleSelect(item.uri)}
                      style={[styles.checkbox, isSelected && styles.checkboxActive]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                    >
                      {isSelected ? <Text style={styles.checkmarkGlyph}>✓</Text> : null}
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={() => {
                      if (isSelectMode) toggleSelect(item.uri);
                      else togglePlayback(item);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isPlaying ? `Pause ${item.name}` : `Play ${item.name}`
                    }
                    style={({ pressed }) => [
                      styles.playButton,
                      isActive && styles.playButtonActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.playGlyph,
                        isActive && styles.playGlyphActive,
                        isPlaying && styles.pauseGlyph,
                      ]}
                    >
                      {isPlaying ? '❚❚' : '▶'}
                    </Text>
                  </Pressable>

                  <View style={styles.cardTextGroup}>
                    <Text style={styles.recordingName} numberOfLines={1}>
                      {item.name}
                    </Text>

                    <Text style={styles.recordingMeta}>
                      {isActive && status.duration > 0
                        ? `${formatClock(status.currentTime)} / ${formatDuration(status.duration)}`
                        : formatBytes(item.sizeBytes)}
                      {'  ·  '}
                      {formatDateTime(item.createdAtMs)}
                      {item.format ? `  ·  ${item.format.toUpperCase()}` : ''}
                    </Text>
                  </View>
                </View>

                {/* Progress bar when active */}
                {isActive && !isSelectMode ? (
                  <View style={styles.progressTrack}>
                    <View
                      style={[styles.progressFill, { width: `${progress * 100}%` }]}
                    />
                  </View>
                ) : null}

                {/* Action Buttons Row (hidden in select mode to keep screen clean) */}
                {!isSelectMode ? (
                  <View style={styles.actionsRow}>
                    {/* 1. Edit */}
                    <Pressable
                      onPress={() => onEdit(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.name}`}
                      style={({ pressed }) => [styles.editAction, pressed && styles.pressed]}
                    >
                      <Text style={styles.editActionText} numberOfLines={1}>
                        ✂ Edit
                      </Text>
                    </Pressable>

                    {/* 2. Rename */}
                    <Pressable
                      onPress={() => onRename(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Rename ${item.name}`}
                      style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
                    >
                      <Text style={styles.secondaryActionText} numberOfLines={1}>
                        Rename
                      </Text>
                    </Pressable>

                    {/* 3. Share */}
                    <Pressable
                      onPress={() => onShare(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Share ${item.name}`}
                      style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
                    >
                      <Text style={styles.secondaryActionText} numberOfLines={1}>
                        Share
                      </Text>
                    </Pressable>

                    {/* 4. Delete (Icon-only trash button) */}
                    <Pressable
                      onPress={() => onDelete(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${item.name}`}
                      style={({ pressed }) => [styles.deleteAction, pressed && styles.pressed]}
                    >
                      <View style={styles.trashIconContainer}>
                        <View style={styles.trashLidHandle} />
                        <View style={styles.trashLidBar} />
                        <View style={styles.trashBinBody}>
                          <View style={styles.trashRib} />
                          <View style={styles.trashRib} />
                        </View>
                      </View>
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      {/* Floating Bottom Batch Action Bar */}
      {isSelectMode ? (
        <View style={styles.batchActionBar}>
          {/* 1. Share Selected */}
          <Pressable
            onPress={handleBatchShare}
            disabled={selectedUris.size === 0 || isExporting}
            style={({ pressed }) => [
              styles.batchShareBtn,
              selectedUris.size === 0 && styles.batchBtnDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.batchShareBtnText}>
              ↗ Share{selectedUris.size > 0 ? ` (${selectedUris.size})` : ''}
            </Text>
          </Pressable>

          {/* 2. Save / Export to Device Folder */}
          <Pressable
            onPress={handleBatchExport}
            disabled={selectedUris.size === 0 || isExporting}
            style={({ pressed }) => [
              styles.batchExportBtn,
              selectedUris.size === 0 && styles.batchBtnDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.batchExportBtnText}>
              {isExporting ? 'Saving…' : `📁 Save to Folder${selectedUris.size > 0 ? ` (${selectedUris.size})` : ''}`}
            </Text>
          </Pressable>

          {/* 3. Batch Delete */}
          <Pressable
            onPress={handleBatchDelete}
            disabled={selectedUris.size === 0 || isExporting}
            style={({ pressed }) => [
              styles.batchDeleteBtn,
              selectedUris.size === 0 && styles.batchBtnDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.batchDeleteBtnText}>🗑</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Header({
  count,
  isSelectMode,
  selectedCount,
  allSelected,
  onToggleSelectMode,
  onToggleSelectAll,
}: {
  count: number;
  isSelectMode: boolean;
  selectedCount: number;
  allSelected: boolean;
  onToggleSelectMode: () => void;
  onToggleSelectAll: () => void;
}) {
  if (isSelectMode) {
    return (
      <View style={styles.header}>
        <View style={styles.headerSelectRow}>
          <Pressable
            onPress={onToggleSelectAll}
            style={({ pressed }) => [styles.selectHeaderBtn, pressed && styles.pressed]}
          >
            <Text style={styles.selectHeaderBtnText}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </Text>
          </Pressable>

          <View style={styles.selectCountBadge}>
            <Text style={styles.selectCountText}>
              {selectedCount} of {count} selected
            </Text>
          </View>

          <Pressable
            onPress={onToggleSelectMode}
            style={({ pressed }) => [styles.doneHeaderBtn, pressed && styles.pressed]}
          >
            <Text style={styles.doneHeaderBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
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
              <Text style={styles.subtitle}>
                {count === 0
                  ? 'No recordings in library'
                  : `${count} file${count === 1 ? '' : 's'} in ${RECORDINGS_FOLDER_NAME}`}
              </Text>
            </View>
          </View>
        </View>

        {count > 0 ? (
          <Pressable
            onPress={onToggleSelectMode}
            style={({ pressed }) => [styles.selectPillBtn, pressed && styles.pressed]}
          >
            <Text style={styles.selectPillBtnText}>Select</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
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
    borderColor: 'rgba(88, 80, 236, 0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
    paddingHorizontal: 4,
  },
  logoBar: {
    width: 3,
    borderRadius: 1.5,
  },
  logoDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#F59E0B',
    marginLeft: 1,
  },
  headerTextGroup: {
    gap: 3,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  studioBadge: {
    backgroundColor: 'rgba(92, 79, 238, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(92, 79, 238, 0.4)',
  },
  studioBadgeText: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
  },
  selectPillBtn: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  selectPillBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  headerSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  selectHeaderBtn: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  selectHeaderBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  selectCountBadge: {
    backgroundColor: 'rgba(92, 79, 238, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(92, 79, 238, 0.3)',
  },
  selectCountText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  doneHeaderBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  doneHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 110,
    gap: spacing.md,
  },
  listSelectMode: {
    paddingBottom: 170,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  cardSelected: {
    borderColor: 'rgba(245, 10, 206, 0.6)',
    backgroundColor: 'rgba(92, 79, 238, 0.12)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.accent,
    borderColor: colors.warning,
  },
  checkmarkGlyph: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    marginTop: -1,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  playGlyph: {
    color: colors.text,
    fontSize: 15,
    marginLeft: 2,
    fontWeight: '700',
  },
  playGlyphActive: {
    color: '#FFFFFF',
  },
  pauseGlyph: {
    marginLeft: 0,
    fontSize: 13,
    letterSpacing: -1,
  },
  cardTextGroup: {
    flex: 1,
    gap: 4,
  },
  recordingName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  recordingMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  progressTrack: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 1.5,
    overflow: 'hidden',
    marginTop: -spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  editAction: {
    flex: 1,
    backgroundColor: 'rgba(92, 79, 238, 0.16)',
    borderColor: 'rgba(92, 79, 238, 0.4)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editActionText: {
    color: '#A5B4FC',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  deleteAction: {
    width: 44,
    height: 38,
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashLidHandle: {
    width: 6,
    height: 2,
    backgroundColor: colors.danger,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  trashLidBar: {
    width: 14,
    height: 2,
    backgroundColor: colors.danger,
    borderRadius: 1,
    marginTop: 1,
  },
  trashBinBody: {
    width: 12,
    height: 12,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: colors.danger,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
    paddingTop: 1.5,
  },
  trashRib: {
    width: 1.2,
    height: 6,
    backgroundColor: colors.danger,
    borderRadius: 0.5,
  },
  batchActionBar: {
    position: 'absolute',
    bottom: 84,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 18,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  batchShareBtn: {
    flex: 1.2,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchShareBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  batchExportBtn: {
    flex: 1.6,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchExportBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  batchDeleteBtn: {
    width: 44,
    height: 42,
    backgroundColor: 'rgba(244, 63, 94, 0.16)',
    borderColor: 'rgba(244, 63, 94, 0.4)',
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchDeleteBtnText: {
    fontSize: 16,
  },
  batchBtnDisabled: {
    opacity: 0.4,
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    paddingBottom: spacing.xxl,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(88, 80, 236, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(88, 80, 236, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyIconCircle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emptyIconBar: {
    width: 4,
    height: 22,
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.75,
  },
});
