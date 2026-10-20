import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { describeSettings, estimatedBytesPerHour, formatBytes } from '../core/format';
import { BITRATES, FORMATS, type Settings } from '../core/types';
import { colors, radius, spacing } from '../theme';
import { ActionButton } from './ActionButton';
import { SegmentedControl } from './SegmentedControl';

type Props = {
  visible: boolean;
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
};

/**
 * All recording options live here so the main screen stays uncluttered.
 * Changes apply immediately and are persisted by the caller.
 */
export function SettingsSheet({ visible, settings, onChange, onClose }: Props) {
  const perHour = estimatedBytesPerHour(settings);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
        />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>Recording settings</Text>
            <Text style={styles.subtitle}>Applies to your next recording.</Text>

            <Text style={styles.groupLabel}>Bitrate</Text>
            <SegmentedControl
              label="Bitrate"
              value={settings.bitrate}
              options={BITRATES.map((bitrate) => ({ value: bitrate, label: `${bitrate} kbps` }))}
              onChange={(bitrate) => onChange({ ...settings, bitrate })}
            />
            <Text style={styles.help}>
              Lower bitrates make smaller files. Bitrate applies to MP3 only — WAV stores
              uncompressed audio, so the setting has no effect there.
            </Text>

            <Text style={styles.groupLabel}>Format</Text>
            <SegmentedControl
              label="Format"
              value={settings.format}
              options={FORMATS.map((format) => ({ value: format, label: format.toUpperCase() }))}
              onChange={(format) => onChange({ ...settings, format })}
            />
            <Text style={styles.help}>
              WAV is uncompressed: perfect fidelity and instant to write, but around{' '}
              {formatBytes(estimatedBytesPerHour({ ...settings, format: 'wav' }))} per hour.
            </Text>

            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>About {formatBytes(perHour)} per hour</Text>
              <Text style={styles.summaryBody}>{describeSettings(settings)}</Text>
            </View>

            <ActionButton label="Done" variant="primary" onPress={onClose} style={styles.done} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    backgroundColor: colors.scrim,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginTop: spacing.md,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  groupLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  help: {
    color: colors.textFaint,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  summary: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  summaryBody: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  done: {
    marginTop: spacing.xl,
  },
});
