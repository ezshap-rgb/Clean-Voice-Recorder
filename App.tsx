import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NameDialog } from './src/components/NameDialog';
import { TrimmerScreen } from './src/screens/TrimmerScreen';
import { trimAndReplace } from './src/audio/trimReencoder';
import { createSettingsStore } from './src/platform/settingsStore';
import type { TrimRegion } from './src/screens/TrimmerScreen.types';
import { SettingsSheet } from './src/components/SettingsSheet';
import { splitExtension } from './src/core/filename';
import { formatBytes, formatDuration } from './src/core/format';
import { loadSettings, saveSettings } from './src/core/settings';
import type { Settings } from './src/core/types';
import { useRecorder, type RecordedTake } from './src/hooks/useRecorder';
import { createMp3Encoder } from './src/platform/mp3Encoder';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { RecordScreen } from './src/screens/RecordScreen';
import {
  deleteRecording,
  listRecordings,
  RECORDINGS_FOLDER_NAME,
  renameRecording,
  shareRecording,
  type RecordingEntry,
} from './src/storage/recordings';
import { colors, radius, spacing } from './src/theme';

const settingsStore = createSettingsStore();

type Tab = 'record' | 'library';

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings(settingsStore));
  const [tab, setTab] = useState<Tab>('record');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [pendingTake, setPendingTake] = useState<RecordedTake | null>(null);
  const [renaming, setRenaming] = useState<RecordingEntry | null>(null);
  const [trimming, setTrimming] = useState<RecordingEntry | null>(null);
  const [trimRegion, setTrimRegion] = useState<TrimRegion | null>(null);
  const trimRegionRef = useRef<TrimRegion | null>(null);

  const recorder = useRecorder(settings);
  const { start, stop, pause, resume, phase } = recorder;

  const refresh = useCallback(() => {
    try {
      setRecordings(listRecordings());
    } catch {
      // A read failure should not take the app down; show an empty library.
      setRecordings([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    try {
      saveSettings(settingsStore, next);
    } catch {
      // Preferences are not worth interrupting the user over.
    }
  }, []);

  /** Stop, save, and ask what the new recording should be called. */
  const handleStop = useCallback(async () => {
    const take = await stop();
    if (!take) return;
    refresh();
    setPendingTake(take);
  }, [stop, refresh]);

  /** Apply a chosen name, optionally sharing straight away. */
  const applyTakeName = useCallback(
    (take: RecordedTake, requestedName: string, share: boolean) => {
      let entry = take.entry;
      try {
        entry = renameRecording(entry, requestedName);
      } catch (caught) {
        Alert.alert('Could not rename', describeFailure(caught));
      }

      setPendingTake(null);
      refresh();

      if (share) {
        shareRecording(entry).catch((caught: unknown) => {
          Alert.alert('Could not share', describeFailure(caught));
        });
      }
    },
    [refresh]
  );

  /**
   * Open the trimmer for a saved recording. The recording exists on disk, so the
   * trimmer can preview it and replace the original when the user saves.
   */
  const openTrimmer = useCallback((entry: RecordingEntry) => {
    setTrimming(entry);
    const initialDuration = Math.max(1, entry.sizeBytes / 16000);
    const initialRegion = { keepStartSeconds: 0, keepEndSeconds: initialDuration };
    setTrimRegion(initialRegion);
    trimRegionRef.current = initialRegion;
  }, []);

  const closeTrimmer = useCallback(() => {
    setTrimming(null);
    setTrimRegion(null);
    trimRegionRef.current = null;
  }, []);

  const applyTrimRegion = useCallback((region: TrimRegion) => {
    setTrimRegion(region);
    trimRegionRef.current = region;
  }, []);

  const confirmTrimSave = useCallback(
    async (region: TrimRegion) => {
      const currentSettings = loadSettings(settingsStore);
      try {
        const result = await trimAndReplace(trimming!, region, currentSettings, createMp3Encoder);
        setTrimming(null);
        setTrimRegion(null);
        trimRegionRef.current = null;
        refresh();
        Alert.alert('Trimmed', `“${result.entry.name}” is now ${formatBytes(result.bytes)} long.`);
      } catch (caught) {
        Alert.alert('Could not save trim', describeFailure(caught));
      }
    },
    [trimming, refresh]
  );

  const applyRename = useCallback(
    (entry: RecordingEntry, requestedName: string) => {
      try {
        renameRecording(entry, requestedName);
      } catch (caught) {
        Alert.alert('Could not rename', describeFailure(caught));
      }
      setRenaming(null);
      refresh();
    },
    [refresh]
  );

  const handleShare = useCallback((entry: RecordingEntry) => {
    shareRecording(entry).catch((caught: unknown) => {
      Alert.alert('Could not share', describeFailure(caught));
    });
  }, []);

  const confirmDelete = useCallback(
    (entry: RecordingEntry) => {
      Alert.alert('Delete recording', `Delete “${entry.name}”? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try {
              deleteRecording(entry);
            } catch (caught) {
              Alert.alert('Could not delete', describeFailure(caught));
            }
            refresh();
          },
        },
      ]);
    },
    [refresh]
  );

  const confirmBatchDelete = useCallback(
    (entries: RecordingEntry[]) => {
      for (const entry of entries) {
        try {
          deleteRecording(entry);
        } catch (caught) {
          console.warn('Could not delete', entry.name, caught);
        }
      }
      refresh();
    },
    [refresh]
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.screen}>
        {tab === 'record' ? (
          <RecordScreen
            settings={settings}
            phase={recorder.phase}
            elapsedSeconds={recorder.elapsedSeconds}
            level={recorder.level}
            error={recorder.error}
            onStart={() => {
              void start();
            }}
            onPause={pause}
            onResume={resume}
            onStop={() => {
              void handleStop();
            }}
            onOpenSettings={() => setSettingsVisible(true)}
            onDismissError={recorder.dismissError}
          />
        ) : (
          <LibraryScreen
            recordings={recordings}
            onShare={handleShare}
            onRename={setRenaming}
            onEdit={openTrimmer}
            onDelete={confirmDelete}
            onBatchDelete={confirmBatchDelete}
          />
        )}
      </View>

      <TabBar
        tab={tab}
        onChange={setTab}
        isRecording={phase === 'recording'}
        isPaused={phase === 'paused'}
      />

      <SettingsSheet
        visible={settingsVisible}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsVisible(false)}
      />

      <NameDialog
        visible={pendingTake !== null}
        title="Name this recording"
        initialValue={pendingTake ? splitExtension(pendingTake.entry.name).base : ''}
        footnote={
          pendingTake
            ? `${formatBytes(pendingTake.sizeBytes)} · ${formatDuration(
                pendingTake.durationSeconds
              )} · saved to ${RECORDINGS_FOLDER_NAME}`
            : undefined
        }
        confirmLabel="Save"
        secondaryLabel="Save & Share"
        onCancel={() => setPendingTake(null)}
        onConfirm={(name) => {
          if (pendingTake) applyTakeName(pendingTake, name, false);
        }}
        onSecondary={(name) => {
          if (pendingTake) applyTakeName(pendingTake, name, true);
        }}
      />

      <NameDialog
        visible={renaming !== null}
        title="Rename recording"
        initialValue={renaming ? splitExtension(renaming.name).base : ''}
        footnote="The file extension is kept."
        confirmLabel="Rename"
        onCancel={() => setRenaming(null)}
        onConfirm={(name) => {
          if (renaming) applyRename(renaming, name);
        }}
      />

      <Modal
        visible={trimming !== null}
        animationType="slide"
        onRequestClose={closeTrimmer}
        statusBarTranslucent
      >
        {trimming ? (
          <TrimmerScreen
            key={trimming.uri}
            entry={trimming}
            durationSeconds={
              trimRegion
                ? trimRegion.keepEndSeconds
                : Math.max(1, trimming.sizeBytes / 16000)
            }
            sizeBytes={trimming.sizeBytes}
            onRegionChange={applyTrimRegion}
            onSave={async () => {
              if (!trimRegionRef.current) {
                Alert.alert('Nothing to trim', 'Set an In/Out range first.');
                return;
              }
              await confirmTrimSave(trimRegionRef.current);
            }}
            onCancel={closeTrimmer}
          />
        ) : null}
      </Modal>
    </View>
  );
}

function TabBar({
  tab,
  onChange,
  isRecording,
  isPaused,
}: {
  tab: Tab;
  onChange: (tab: Tab) => void;
  isRecording: boolean;
  isPaused: boolean;
}) {
  const bottomPadding = Platform.OS === 'android' ? 68 : 54;

  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: bottomPadding }]}>
      <View style={styles.tabBarCard}>
        <TabButton
          label="Record"
          active={tab === 'record'}
          onPress={() => onChange('record')}
          indicator={isRecording ? 'recording' : isPaused ? 'paused' : undefined}
        />
        <TabButton
          label="Library"
          active={tab === 'library'}
          onPress={() => onChange('library')}
        />
      </View>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
  indicator,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  indicator?: 'recording' | 'paused';
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.tabButton,
        active && styles.tabButtonActive,
        pressed && styles.pressed,
      ]}
    >
      {indicator === 'recording' ? (
        <View style={styles.recordingDot} />
      ) : indicator === 'paused' ? (
        <View style={[styles.recordingDot, styles.pausedDot]} />
      ) : null}
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function describeFailure(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message;
  if (typeof caught === 'string' && caught) return caught;
  return 'Something went wrong.';
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
  },
  tabBarWrapper: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    backgroundColor: colors.background,
  },
  tabBarCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: 16,
  },
  tabButtonActive: {
    backgroundColor: colors.accent,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.record,
  },
  pausedDot: {
    backgroundColor: colors.warning,
  },
  pressed: {
    opacity: 0.8,
  },
});
